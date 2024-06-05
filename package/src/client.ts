import { nanoid } from "nanoid";
import type {
  ClientListData,
  HNResponse,
  HighNoonClientConstructor,
  HighNoonClientEvents,
  HighNoonClientPeer,
  HighNoonRelayMessage,
  RoomJoinData,
} from "./types";
import { HighNoonBase } from "./base";
import type { ClientAnswerEvent, ServerOfferEvent } from "./serverTypes";
import { isWebRTCAvailable } from "./util";

export default class HighNoonClient extends HighNoonBase<HighNoonClientEvents> {
  userId: string;
  socketId: string;
  peer: RTCPeerConnection;
  channelPromise: Promise<RTCDataChannel>;
  channel: RTCDataChannel | null = null;
  iceCandidates: RTCIceCandidate[] = [];


  // other clients in the room
  foreignPeers: HighNoonClientPeer[] = [];

  constructor(options: HighNoonClientConstructor) {
    if (!isWebRTCAvailable()) {
      throw new Error("WebRTC is not available in this environment");
    }

    super(options, "client");
    this.userId = options.userId
      ? options.userId + "-" + nanoid(4)
      : `user-${nanoid(8)}`;
    this.socketId = "";

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

    this.socket?.on("message", (data: HighNoonRelayMessage) => {
      this.printDebugMessage("Recieved a message via Websocket: " + JSON.stringify(data));

      if ('userId' in data.meta) {
        this.emitEvent("relayFromClient", data);
      } else {
        this.emitEvent("relayFromServer", data);
      }

      this.emitEvent("relay", data)
    })

    this.socket?.on("update_client_list", (data: HighNoonClientEvents['clientListUpdated']) => {
      this.foreignPeers = data.clients.clients;

      this.emitEvent("clientListUpdated", data);
    })

    this.channelPromise.then((channel) => {
      this.channel = channel;
      this.channel.onmessage = ({ data }: { data: HighNoonClientEvents['packet'] }) => this.handleChannelMessage(data);
      this.emitEvent("serverConnectionEstablished");
      this.channel.onclose = () => {
        this.printDebugMessage("Data channel closed");
        this.emitEvent("disconnected");
      };
    });
  };
  

  /**
   * 
   * MESSAGING HANDLERS
   * 
   * These functions are used to send messages to the server and other clients over both WebRTC and the WebSocket connection
   * 
   */

  send = (payload: any) => {
    if (this.channel) {
      this.channel.send(JSON.stringify(payload));
    }
  };

  relay = (message: any, stringify: boolean = false) => {
    if (this.socket) {
      this.socket.emit("client_send_message", this.attachMetaData({
        payload: stringify ? JSON.stringify(message) : message,
      }));
    }
  };

  relayTo = (userId: string, message: any, stringify: boolean = false) => {
    this.printDebugMessage("Sending a WebSocket message to: " + userId);
    this.socket?.emit("client_send_message_to", this.attachMetaData({
      to: userId,
      payload: stringify ? JSON.stringify(message) : message,
    }))
  };


  /**
   * 
   * ROOM HANDLERS
   * 
   * These functions are used to connect to a room and get information about the clients in the room
   * 
   */

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
        resolve({ data: res, error: null });
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

      this.socket!.emit("join_room", {
        roomId: roomId,
        userId: this.userId,
      });

      this.socket!.on("room_joined", (res) => {
        clearTimeout(timeout);
        this.connectedToRoom = true;
        this.currentRoom = res.roomId;
        this.socketId = res.socketId;
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

  /**
   * 
   * RTC HANDLERS
   * 
   * Functions for managing the WebRTC connection between the client and server
   * 
   */

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

  private handleChannelMessage = (event: HighNoonClientEvents["packet"]) => {
    this.printDebugMessage("Recieved message from server: " + this.decodeMessagePayload(event));
    this.emitEvent("packet", this.decodeMessagePayload(event));
  };



  /**
   * 
   * UTILITY FUNCTIONS
   * 
   */

  private attachMetaData = (data: any) => {
    return {
      meta: {
        userId: this.userId,
        roomId: this.currentRoom,
        socketId: this.socketId
      },
      ...data
    }
  }
}

