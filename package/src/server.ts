import chalk from "chalk";
import { HighNoonBase } from "./base";
import type {
  HighNoonClientConstructor,
  HNResponse,
  CreateRoomData,
  HighNoonServerPeer,
  ClientListData,
  ClientMessage,
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
   * Initialize the HighNoonServer
   * 
   * @returns HNResponse<Initialize>
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

  broadcast = (message: any, stringify: boolean = true) => {
    console.log(chalk.green("Broadcasting WebRTC message to all clients: " + JSON.stringify(message)));
    this.foreignPeers.forEach((peer) => {
      peer.channel?.send(stringify ? JSON.stringify(message) : message);
    });
  };

  sendTo = (userId: string, message: any, stringify: boolean = true) => {
    this.printDebugMessage("Sending WebRTC message to: " + userId);
    const peer = this.foreignPeers.find((p) => p.userId === userId);
    if (peer) {
      peer.channel?.send(this.attachMetadata({
        payload: stringify ? JSON.stringify(message) : message,
      }));

      return { data: { success: true }, error: null };
    } else {
      return { data: null, error: "Client not found" };
    }
  };

  broadcastSafe = (message: any, stringify: boolean = false) => {
    this.printDebugMessage("Broadcasting WebSocket message to all clients: " + JSON.stringify(message));
    this.socket?.emit("server_send_message", this.attachMetadata({
      payload: stringify ? JSON.stringify(message) : message,
    }));
  }

  sendToSafe = (userId: string, message: any, stringify: boolean = false) => {
    this.printDebugMessage("Sending WebSocket message to: " + userId);
    const peer = this.foreignPeers.find((p) => p.userId === userId);
    if (peer) {
      this.socket?.emit("server_send_message_to", this.attachMetadata({
        to: peer.socketId,
        payload: stringify ? JSON.stringify(message) : message,
      }));
      return { data: { success: true }, error: null };
    } else {
      return { data: null, error: "Client not found" };
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

      this.socket!.emit("update_client_list", this.attachMetadata({
        isJoin: false,
        removedClient: {
          userId: userId,
        },
        clients: this.getConnectedClients(),
      }))
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
          this.emitEvent("clientConnected", this.attachMetadata({ userId: data.userId }));
          // send an update list of connected clients to all clients
          this.socket!.emit("update_client_list", this.attachMetadata({
            isJoin: true,
            newClient: {
              userId: data.userId,
              sockerId: data.socketId
            },
            clients: this.getConnectedClients(),
          }))
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
      isHost: this.foreignPeers.length === 0,
    };

    channelPromise.then((c) => {
      newPeer.channel = c;
      newPeer.channel.onmessage = ({ data }) =>
        this.handleChannelMessage(data, newPeer);
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
    data: ClientMessage,
    peer: HighNoonServerPeer,
  ) => {
    this.emitEvent("clientPacketReceived",
      this.attachMetadata({
        from: {
          userId: peer.userId,
          socketId: peer.socketId,
        },
        payload: this.decodeMessagePayload(data),
      })
    );
  };

  private sendConnectedClients = (data: ClientGetConnectedClientsEvent) => {
    this.socket?.emit("connected_clients", this.attachMetadata({
      to: data.from,
      payload: this.getConnectedClients(),
    }));
  }


  private attachMetadata = (data: any) => {
    return {
      ...data,
      meta: {
        roomId: this.currentRoom,
        initialized: this.initialized,
        connectedToRoom: this.connectedToRoom,
      },
    };
  }
}
