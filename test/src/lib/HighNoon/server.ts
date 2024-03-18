import chalk from "chalk";
import { HighNoonBase } from "./base";
import type {
  HighNoonClientConstructor,
  HNResponse,
  CreateRoomData,
  HighNoonServerPeer,
  Initialize,
} from "./types";

export default class HighNoonServer extends HighNoonBase {
  peers: HighNoonServerPeer[] = [];

  constructor(options: HighNoonClientConstructor) {
    super(options, "server");
  }

  init = async () => {
    const { data, error } = await this.initBase();

    // server specific initialization
    this.socket!.on("client_joined", (data) => this.createPeerConnection(data));

    return { data, error };
  };

  receiveClientSignalling = (data: any) => {
    console.log(data);
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

  createPeerConnection = async (data: any) => {
    if (this.options.showDebug) {
      this.printDebugMessage("Creating a new peer for client");
    }
    // create a new peer connection
    const peer = new RTCPeerConnection({
      iceServers: this.options.iceServers,
    });

    const channel = new Promise((resolve) => {
      const c = peer.createDataChannel(this.options.channelName!);

      c.onopen = ({ target }) => {
        if (target!.readyState === "open") {
          if (this.options.showDebug) {
            console.group(chalk.blue(`Creating a new peer`));
            console.log("Data channel opened");
            console.groupEnd();
          }
          resolve(c);
        }
      };
    });

    const offer = new RTCSessionDescription(await peer.createOffer());
    peer.setLocalDescription(offer);
    peer.onicecandidate = this.onIceCandidate;
    peer.onicegatheringstatechange = this.onIceGatheringStateChange;
  };

  onPeerIceCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      this.socket!.emit("signalling", {
        candidate: event.candidate,
        userId: this.userId,
      });
    }
  };
}
