import { nanoid } from "nanoid";
import type {
  ClientListData,
  HNResponse,
  HighNoonClientConstructor,
  RoomJoinData,
} from "./types";
import { HighNoonBase } from "./base";
import type { ClientAnswerEvent, ServerOfferEvent } from "./serverTypes";
import { isWebRTCAvailable } from "./util";

export default class HighNoonClient extends HighNoonBase {
  userId: string;
  peer: RTCPeerConnection;
  channelPromise: Promise<RTCDataChannel>;
  channel: RTCDataChannel | null = null;
  iceCandidates: RTCIceCandidate[] = [];

  constructor(options: HighNoonClientConstructor) {
    if (!isWebRTCAvailable()) {
      throw new Error("WebRTC is not available in this environment");
    }

    super(options, "client");
    this.userId = options.userId
      ? options.userId + "-" + nanoid(4)
      : `user-${nanoid(8)}`;

    this.peer = new RTCPeerConnection({
      iceServers: this.options.iceServers,
    });

    // make new RTC data channel
    this.channelPromise = new Promise((resolve) => {
      this.peer.ondatachannel = (event) => {
        resolve(event.channel);
      };
    });
  }

  init = async () => {

    const res = await this.initBase(this.userId);
    // create a new RTC offer and bind listeners to it
    if (this.socket!.connected) {
      this.initialized = true;
    } else {
      this.initialized = false;
    }

    this.socket?.on("server_offer", (data: ServerOfferEvent) =>
      this.generateResponse(data)
    );

    this.socket?.on("message", (data) => {
      this.printDebugMessage("Recieved safe message from server: " + data);
      this.emitEvent("safeMessage", data);
    })

    this.channelPromise.then((channel) => {
      this.channel = channel;
      this.channel.onmessage = (event) => this.handleChannelMessage(event);
      this.emitEvent("serverConnectionEstablished");
    });
  };

  send = (message: any) => {
    if (this.channel) {
      this.channel.send(JSON.stringify(message));
    }
  };

  getConnectedClients = async (): Promise<HNResponse<ClientListData>> => {
    if (!this.connectedToRoom) {
      return { data: null, error: "Not connected to a room" };
    }

    return new Promise<HNResponse<ClientListData>>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ data: null, error: "Connection Timed out" });
      }, 10000);


      this.socket?.emit("get_connected_clients", { roomId: this.currentRoom });

      this.socket?.on("connected_clients", (res) => {
        clearTimeout(timeout);
        resolve({ data: { clients: res.clients, count: res.clients.length }, error: null });
        });
      });
  }

  connectToRoom = async (roomId: string): Promise<HNResponse<RoomJoinData>> => {
    if (!this.initialized) {
      return {
        data: null,
        error: "Client not initialized",
      };
    }

    return new Promise<HNResponse<RoomJoinData>>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ data: null, error: "Connection Timed out" });
      }, 10000);

      console.log("debug is: " + this.options.showDebug)

      this.socket!.emit("join_room", {
        roomId: roomId,
        userId: this.userId,
      });

      this.socket!.on("room_joined", (res) => {
        clearTimeout(timeout);
        this.connectedToRoom = true;
        this.currentRoom = res.roomId;
        this.printDebugMessage("Connected to room: " + res.roomId);
        resolve({ data: { room: res.roomId, connectedClients: res.connectedClients }, error: null })
      });
      this.socket?.on("room_not_found", () => {
        clearTimeout(timeout);
        this.connectedToRoom = false;
        this.printErrorMessage("Room not found");
        resolve({ data: null, error: "Room not found" });
      });
    });
  };

  private generateResponse = async (data: ServerOfferEvent) => {
    this.printDebugMessage("Recieved server offer!");
    // set the remote description of the connection to that recieved from the server
    this.peer.setRemoteDescription(data.offer);

    // transfer the server ice candiates to the client
    for (const candidate of data.candidates) {
      this.peer.addIceCandidate(candidate);
    }

    // create an answer session description
    const answer = new RTCSessionDescription(await this.peer.createAnswer());
    this.peer.setLocalDescription(answer);

    this.peer.onicecandidate = (event) => this.onIceCandidate(event);
    this.peer.onicegatheringstatechange = () =>
      this.onIceGatheringStateChange(answer);
  };

  //--------------------------//
  // RTC ACCESSORY FUNCTIONS //
  //-------------------------//

  private onIceCandidate = async ({
    candidate,
  }: {
    candidate: RTCIceCandidate | null;
  }) => {
    if (candidate) {
      this.iceCandidates.push(candidate);
    }
  };

  private onIceGatheringStateChange = async (answer: RTCSessionDescription) => {
    if (this.peer.iceGatheringState == "complete") {
      const response: ClientAnswerEvent = {
        candidates: this.iceCandidates,
        answer: answer,
        userId: this.userId,
        roomId: this.currentRoom!,
      };

      this.printDebugMessage("Sending answer to server");

      this.socket?.emit("send_client_offer_response", response);
    }
  };

  private handleChannelMessage = (event: MessageEvent) => {
    this.printDebugMessage("Recieved message from server: " + JSON.stringify(event.data));
    this.emitEvent("messageReceived", JSON.parse(event.data));
  };
}
