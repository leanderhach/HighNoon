import { io, type Socket } from "socket.io-client";
import type { HighNoonClientConstructor, HighNoonClientOptions } from "./types";
import chalk from "chalk";
import { nanoid } from "nanoid";

export class HighNoonBase {
    client: RTCPeerConnection;
    channel: Promise<RTCDataChannel>;
    options: HighNoonClientOptions;
    socket: Socket;
    projectId: string;
    apiToken: string;

    constructor(options: HighNoonClientConstructor, type: "client" | "server") {
        // setup options
        this.options = {
            channelName: `${type}-${options.channelName}` || `highnoon-${type}-${nanoid()}`,
            showDebug: options.showDebug || false,
            iceServers: options.iceServers || [],
        };

        if (!options.projectId) {
            throw new Error("projectId is required");
        }

        if (!options.apiToken) {
            throw new Error("apiToken is required");
        }

        this.projectId = options.projectId;
        this.apiToken = options.apiToken;

        // make a new RTC peer connection
        this.client = new RTCPeerConnection({
            iceServers: this.options.iceServers,
        });

        //
        this.channel = new Promise((resolve) => {
            const c = this.client.createDataChannel(this.options.channelName!);

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

        // initialize the socket for signalling
        this.socket = io("http://localhost:8080", {
            auth: {
                projectId: this.projectId,
                apiToken: this.apiToken,
            },
        });

        this.socket.on("connect_error", (err) => this.socketConnectionError(err));
        this.socket.on("greeting", (msg) => console.log(msg));
    }

    //---------------------------//
    // INITIALIZATION FUNCTIONS //
    //--------------------------//


    initialize = async () => {
        // create a new RTC offer and bind listeners to it
        const offer = new RTCSessionDescription(await this.client.createOffer());
        this.client.setLocalDescription(offer);
        this.client.onicecandidate = this.onIceCandidate;
        this.client.onicegatheringstatechange = this.onIceGatheringStateChange;
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
    };

    onIceGatheringStateChange = async () => {
        if (this.options.showDebug) {
            console.group(chalk.blue(`Change in ${this.options.channelName}`));
            console.log(
                "ICE gathering state changed: ",
                this.client.iceGatheringState
            );
            if (this.client.iceGatheringState === "complete") {
                console.log("ICE gathering complete");
            }
            console.groupEnd();
        }
    };

    //-----------------------------//
    // SOCKET ACCESSORY FUNCTIONS //
    //----------------------------//

    socketConnectionError = (err: Error) => {
        this.printErrorMessage(
            `Error establishing a signalling connection: ${err.message} \n ${err.message.includes("Authentication error")
                ? "Check that your projectId and apiToken are correct."
                : ""
            }`
        );
    };

    printErrorMessage = (message: string) => {
        console.error(chalk.red(message));
    };

    printSuccessMessage = (message: string) => {
        console.log(chalk.green(message));
    };

    printDebugMessage = (message: string) => {
        if (this.options.showDebug) {
            console.log(chalk.blue(message));
        }
    };
}