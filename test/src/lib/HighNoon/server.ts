import chalk from "chalk";
import { HighNoonBase } from "./base";
import type {
  HighNoonClientConstructor,
  HNResponse,
  CreateRoomData,
  HighNoonServerPeer,
  Initialize,
} from "./types";
import type { ClientAnswerEvent, ClientJoinEvent } from "./serverTypes";

export default class HighNoonServer extends HighNoonBase {
  foreignPeers: HighNoonServerPeer[] = [];

  constructor(options: HighNoonClientConstructor) {
    super(options, "server");
  }

  init = async () => {
    const { data, error } = await this.initBase();

    // server specific initialization
    this.socket!.on("client_joined", (data) => this.createPeerConnection(data));
    this.socket!.on("client_response", (data) => this.connectClient(data));
    return { data, error };
  };

  createRoom = async () => {
    return new Promise<HNResponse<CreateRoomData>>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ data: null, error: "Connection Timed out" });
      }, 10000);

      this.socket!.emit("create_room");
      this.socket!.on("room_created", (roomId) => {
        clearTimeout(timeout);
        resolve({ data: { room: roomId }, error: null });
      });
    });
  };

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

  sendMessageToAll = (message: string) => {
    this.foreignPeers.forEach((peer) => {
      peer.channel?.send(message);
    });
  };
}
