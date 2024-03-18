import { nanoid } from "nanoid";
import chalk from "chalk";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import {
  type CreateRoomData,
  type HNResponse,
  type HighNoonClientConstructor,
  type HighNoonClientOptions,
  type Initialize,
  type RoomJoinData,
} from "./types";
import { HighNoonBase } from "./base";

export default class HighNoonClient extends HighNoonBase {
  userId: string;
  peer: RTCPeerConnection;
  channel: Promise<RTCDataChannel>;
  iceCandidates: RTCIceCandidate[] = [];

  constructor(options: HighNoonClientConstructor) {
    super(options, "client");
    this.userId = options.userId || `user-${nanoid()}`;

    this.peer = new RTCPeerConnection({
      iceServers: this.options.iceServers,
    });

    // make new RTC data channel
    this.channel = new Promise((resolve) => {
      const c = this.peer.createDataChannel(this.options.channelName!);

      c.onopen = ({ target }) => {
        if (target!.readyState === "open") {
          if (this.options.showDebug) {
            console.group(chalk.blue(`Change in ${this.options.channelName}`));
            console.log("Data channel opened");
            console.groupEnd();
          }
          resolve(c);
        }
      };
    });
  }

  init = async () => {
    return new Promise<HNResponse<Initialize>>(async (resolve) => {
      await this.initBase();

      // create a new RTC offer and bind listeners to it
      this.peer
        .createOffer()
        .then((offer) => {
          this.peer.setLocalDescription(offer);
          this.peer.onicecandidate = this.onIceCandidate;
          this.peer.onicegatheringstatechange = this.onIceGatheringStateChange;

          this.socket!.on("handshake", (data) => {
            if (this.socket!.connected) {
              this.initialized = true;
              resolve({ data: { status: "connected" }, error: null });
            } else {
              this.initialized = false;
              resolve({ data: null, error: "Connection failed" });
            }
          });
        })
        .catch((error) => {
          this.initialized = false;
          resolve({ data: null, error: error.toString() });
        });
    });
  };

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
      this.socket!.on("room_joined", (data) => {
        clearTimeout(timeout);
        this.connectedToRoom = true;
        this.currentRoom = data.roomId;

        this.socket?.emit("client_candidates", this.iceCandidates);
        resolve({
          data: {
            room: data.roomId,
            connectedClients: data.connectedClients,
          },
          error: null,
        });
      });
      this.socket?.on("room_not_found", () => {
        clearTimeout(timeout);
        this.connectedToRoom = false;
        resolve({ data: null, error: "Room not found" });
      });
    });
  };

  receiveServerSignalling = (data: any) => {
    console.log(data);
  };

  //--------------------------//
  // RTC ACCESSORY FUNCTIONS //
  //-------------------------//

  onIceCandidate = async ({
    candidate,
  }: {
    candidate: RTCIceCandidate | null;
  }) => {
    if (this.options.showDebug) {
      console.group(chalk.blue(`Change in ${this.options.channelName}`));
      console.log("ICE candidate: ", candidate);
      console.groupEnd();
    }

    if (candidate) {
      this.iceCandidates.push(candidate);
    }
  };

  onIceGatheringStateChange = async () => {
    if (this.options.showDebug) {
      console.group(chalk.blue(`Change in ${this.options.channelName}`));
      console.log("ICE gathering state changed: ", this.peer.iceGatheringState);
      if (this.peer.iceGatheringState === "complete") {
        console.log("ICE gathering complete");
      }
      console.groupEnd();
    }
  };
}
