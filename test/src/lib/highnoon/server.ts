import chalk from "chalk";
import { HighNoonBase } from "./base";
import type {
  HighNoonClientConstructor,
  HNResponse,
  CreateRoomData,
  HighNoonServerPeer,
  Initialize,
  ClientListData,
  GuranteedMessageResponse,
} from "./types";
import type { ClientAnswerEvent, ClientGetConnectedClientsEvent, ClientJoinEvent } from "./serverTypes";
import { isWebRTCAvailable } from "./util";

export default class HighNoonServer extends HighNoonBase {
  foreignPeers: HighNoonServerPeer[] = [];

  constructor(options: HighNoonClientConstructor) {
    if (!isWebRTCAvailable()) {
      throw new Error("WebRTC is not available in this environment");
    }
    super(options, "server");
  }

  init = async () => {
    const { data, error } = await this.initBase();

    // server specific initialization
    this.socket!.on("client_joined", async (data) => await this.createPeerConnection(data));
    this.socket!.on("client_response", async (data) => await this.connectClient(data));
    this.socket!.on("get_connected_clients", async (data) => await this.sendConnectedClients(data))
    return { data, error };
  };

  createRoom = async () => {

    console.log("creating room once")
    this.socket!.off("room_created");
    this.socket!.emit("create_room");
    return new Promise<HNResponse<CreateRoomData>>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ data: null, error: "Connection Timed out" });
      }, 10000);

      console.log("this will run once")
      this.socket!.on("room_created", (roomId) => {
        console.log("a room was created once")
        clearTimeout(timeout);
        resolve({ data: { room: roomId }, error: null });
      });
    });
  };

  broadcast = (message: any) => {
    this.foreignPeers.forEach((peer) => {
      peer.channel?.send(message);
    });
  };

  sendTo = (userId: string, message: any) => {
    this.printDebugMessage("Sending safe message to: " + userId);
    const peer = this.foreignPeers.find((p) => p.userId === userId);
    if (peer) {
      peer.channel?.send(message);
    }
  };

  broadcastSafe = (message: any) => {
    this.printDebugMessage("Broadcasting safe message to all clients: " + JSON.stringify(message));
    this.socket?.emit("send_message", message);
  }

  sendToSafe = (userId: string, message: any) => {
    this.printDebugMessage("Sending safe message to: " + userId);
      const peer = this.foreignPeers.find((p) => p.userId === userId);
      if (peer) {
        this.socket?.emit("send_message_to", {
          to: peer.socketId,
          payload: message,
        });
        return { data: { success: true }, error: null };
      } else {
        return { data: { success: false }, error: "Client not found" };
      }
  }

  getConnectedClients = (): ClientListData => {
    return {
      clients: this.foreignPeers.map((peer) => {
        const res = {
          userId: peer.userId,
          socketId: peer.socketId,
        };
        
        return res;
      }),
      count: this.foreignPeers.length,
    };
  }

  kickClient = (userId: string): ClientListData => {
    // locate the peer
    const peer = this.foreignPeers.find((p) => p.userId === userId);

    if (peer) {
      peer.channel?.close();
      peer.peer.close();
      this.foreignPeers = this.foreignPeers.filter((p) => p.userId !== userId);
    }

    // send an updated list of clients to every client still connected
    this

    return this.getConnectedClients();
  }

  private createPeerConnection = async (data: ClientJoinEvent) => {

    console.log("a new client is here")
    console.log(data)
    // create a new peer connection
    const peer = new RTCPeerConnection({
      iceServers: this.options.iceServers,
    });

    const channelPromise: Promise<RTCDataChannel> = new Promise((resolve) => {
      const c = peer.createDataChannel(this.options.channelName!);

      c.onopen = (event) => {
        const target = event.target as RTCDataChannel;
        if (target.readyState === "open") {
          this.printDebugMessage(
            "Connection established with client: " + data.userId
          );

          console.log(this.foreignPeers);
          resolve(c);
        }
      };
    });

    const offer = new RTCSessionDescription(await peer.createOffer());

    console.log(offer)
    peer.setLocalDescription(offer);
    peer.onicecandidate = (event) =>
      this.onPeerIceCandidate(event, data.userId);
    peer.onicegatheringstatechange = () =>
      this.onIceGatheringStateChange(peer, data.userId);

    const newPeer: HighNoonServerPeer = {
      peer,
      channelPromise,
      channel: null,
      userId: data.userId,
      socketId: data.socketId,
      localIceCandidates: [],
      localIceCandidatesCollected: false,
      localOffer: offer,
      foreignOffer: null,
      foreignIceCandidates: [],
      foreignIceCandidatesCollected: false,
    };

    channelPromise.then((c) => {
      newPeer.channel = c;
      newPeer.channel.onmessage = (event) =>
        this.handleChannelMessage(event, newPeer, c);
    });

    this.foreignPeers.push(newPeer);
  };

  private onPeerIceCandidate = (
    event: RTCPeerConnectionIceEvent,
    userId: string
  ) => {
    if (event.candidate) {
      // push the ice candidate to the right peer
      this.foreignPeers = this.foreignPeers.map((peer) => {
        if (peer.userId === userId) {
          peer.localIceCandidates.push(event.candidate!);
        }
        return peer;
      });
    }
  };

  private onIceGatheringStateChange = (
    peer: RTCPeerConnection,
    userId: string
  ) => {
    if (peer.iceGatheringState === "complete") {
      this.printDebugMessage("Ice Gathering Complete for: " + userId);
      // update the foreign peers list
      this.foreignPeers = this.foreignPeers.map((p) => {
        if (p.userId === userId) {
          p.localIceCandidatesCollected = true;
        }
        return p;
      });

      // send a message to the client to with the ice candidates to complete the connection
      const peer = this.foreignPeers.find((p) => p.userId === userId);

      if (peer) {
        this.socket?.emit("send_offer_to_client", {
          to: peer.socketId,
          candidates: peer.localIceCandidates,
          offer: peer.localOffer,
        });
      }
    }
  };

  private connectClient = async (data: ClientAnswerEvent) => {
    const peer = this.foreignPeers.find((p) => p.socketId === data.from);
    if (peer) {
      peer.foreignIceCandidates = data.candidates;
      peer.foreignOffer = data.answer;
      peer.foreignIceCandidatesCollected = true;
      peer.peer.setRemoteDescription(data.answer);
      for (const candidate of data.candidates) {
        peer.peer.addIceCandidate(candidate);
      }
    }
  };

  private handleChannelMessage = (
    event: MessageEvent,
    peer: HighNoonServerPeer,
    channel: RTCDataChannel
  ) => {
    this.emitEvent("messageReceived", event.data);
  };

  private sendConnectedClients = (data: ClientGetConnectedClientsEvent) => {
    this.printDebugMessage("Got a request for connected clients. Sending response to: " + data.from);

    const clientData: ClientListData = {
      clients: this.foreignPeers.map((peer) => {
        return {
          userId: peer.userId,
          socketId: peer.socketId,
        };
      }),
      count: this.foreignPeers.length,
    };

    this.socket?.emit("connected_clients", {
      to: data.from,
      payload: clientData,
    });
  }
}
