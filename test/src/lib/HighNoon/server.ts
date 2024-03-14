import { HighNoonBase } from "./base";
import type { HighNoonClientConstructor } from "./types";


export default class HighNoonServer extends HighNoonBase {
    constructor(options: HighNoonClientConstructor) {
        super(options, "server");
        this.socket.on("client-signalling", (data) => this.receiveClientSignalling(data));
    }

    initialize = async (password?: string) => {
        if (password) {
            this.createRoom();
        } else {
            this.createRoom();
        }
    }

    receiveClientSignalling = (data: any) => {
        console.log(data)
    }

    createRoom = async () => {
        this.socket.send("create-room");
        this.socket.on("room-created", (data) => console.log(data))
    }
}