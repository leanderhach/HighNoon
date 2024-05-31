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

/**
 * HighNoonServer class
 */
export default class HighNoonServer extends HighNoonBase {
  foreignPeers: HighNoonServerPeer[] = [];

  /**
   * Constructor for the HighNoonServer class
   * 
   * @param options options for the HighNoonClient, as defined in the HighNoonClientConstructor type
   */
  constructor(options: HighNoonClientConstructor) {
    if (!isWebRTCAvailable()) {
      throw new Error("WebRTC is not available in this environment");
    }
    super(options, "server");
  }

  /**
   * Initalize a HghNoonServer instance
   * @returns {
   * data: {
   *  server: string
   * } | error: string 
   * }
   */
  init = async () => {

    const { data, error } = await this.initBase();

    this.socket!.off("client_joined");
    this.socket!.off("client_response");
    this.socket!.off("get_connected_clients");
    this.socket!.off("room_created");

    // server specific initialization
    this.socket!.on("client_joined", (data) => this.createPeerConnection(data));
    this.socket!.on("client_response", (data) => this.connectClient(data));
    this.socket!.on("get_connected_clients", (data) => this.sendConnectedClients(data))
    return { data, error };
  };

  createRoom = async () => {
    return new Promise<HNResponse<CreateRoomData>>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ data: null, error: "Connection Timed out" });
      }, 10000);

      this.socket!.emit("create_room");
      this.socket!.on("room_created", (roomId) => {
        this.connectedToRoom = true;
        this.currentRoom = roomId;
        clearTimeout(timeout);
        resolve({ data: { room: roomId }, error: null });
      });
    });
  };

  broadcast = (message: any) => {
    this.foreignPeers.forEach((peer) => {
      peer.channel?.send(JSON.stringify(message));
    });
  };

  sendTo = (userId: string, message: any) => {
    this.printDebugMessage("Sending safe message to: " + userId);
    const peer = this.foreignPeers.find((p) => p.userId === userId);
    if (peer) {
      peer.channel?.send(JSON.stringify(message));
    }
  };

  broadcastSafe = (message: any) => {
    this.printDebugMessage("Broadcasting safe message to all clients: " + JSON.stringify(message));
    this.socket?.emit("send_message", {
      roomId: this.currentRoom,
      payload: message,
    });
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

      this.socket!.emit("update_client_list", {
        roomId: this.currentRoom,
        payload: this.getConnectedClients(),
      })
    }

    return this.getConnectedClients();
  }

  private createPeerConnection = async (data: ClientJoinEvent) => {

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
          this.emitEvent("clientConnected", data.userId);
          // send an update list of connected clients to all clients
          this.socket!.emit("update_client_list", {
              roomId: this.currentRoom,
            payload: {
              newClient: {
                userId: data.userId,
                sockerId: data.socketId
              },
              clients: this.getConnectedClients(),
              },
          })
          resolve(c);
        }
      };
    });

    const offer = new RTCSessionDescription(await peer.createOffer());

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
    this.emitEvent("messageReceived", {
      meta: {
        userId: peer.userId,
        socketId: peer.socketId,
      },
      data: JSON.parse(event.data),
    });
  };

  private sendConnectedClients = (data: ClientGetConnectedClientsEvent) => {
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
