import { nanoid } from "nanoid";
import chalk from "chalk";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { HighNoonClientConstructor, HighNoonClientOptions } from "./types";
import { HighNoonBase } from "./base";

export default class HighNoonClient extends HighNoonBase {

  constructor(options: HighNoonClientConstructor) {
    super(options, "client");
    this.socket.on("server-signalling", (data) => this.receiveServerSignalling(data));
  }

  connectToRoom = async (roomId: string) => {
    this.socket.send("join-room", roomId);
  };

  receiveServerSignalling = (data: any) => {
    console.log(data)
  }
}
