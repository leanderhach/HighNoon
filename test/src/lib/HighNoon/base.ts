import { io, type Socket } from "socket.io-client";
import type {
  HighNoonClientConstructor,
  HighNoonClientOptions,
  HNResponse,
  Initialize,
} from "./types";
import chalk from "chalk";
import { nanoid } from "nanoid";
import { EventEmitter } from "events";

export type HighNoonEvents =
  | "relayHandshake"
  | "relayHandshakeFailed"
  | "serverConnectionEstablished";

export class HighNoonBase {
  options: HighNoonClientOptions;
  socket: Socket | null = null;
  projectId: string;
  apiToken: string;
  private eventTarget: EventTarget | EventEmitter;
  webSocketTimeout: number = 10000;
  initialized: boolean = false;
  connectedToRoom: boolean = false;
  currentRoom: string | null = null;
  type: string;

  constructor(options: HighNoonClientConstructor, type: "client" | "server") {
    // setup options
    this.options = {
      channelName:
        `${type}-${options.channelName}` || `highnoon-${type}-${nanoid()}`,
      showDebug: options.showDebug || false,
      iceServers: options.iceServers || [],
    };
    this.type = type;

    if (!options.projectId) {
      throw new Error("projectId is required");
    }

    if (!options.apiToken) {
      throw new Error("apiToken is required");
    }

    this.projectId = options.projectId;
    this.apiToken = options.apiToken;

    // make a new RTC peer connection

    // setup event emitter
    const isNode =
      typeof process !== "undefined" &&
      process.versions != null &&
      process.versions.node != null;
    if (isNode) {
      this.eventTarget = new EventEmitter();
    } else {
      this.eventTarget = new EventTarget();
    }
  }

  //---------------------------//
  // INITIALIZATION FUNCTIONS //
  //--------------------------//

  protected initBase = async (userId?: string) => {
    return new Promise<HNResponse<Initialize>>(async (resolve) => {
      // connect to the signalling server
      // initialize the socket for signalling
      this.socket = io("https://service.gethighnoon.com", {
        auth: {
          projectId: this.projectId,
          apiToken: this.apiToken,
        },
        extraHeaders: {
          type: this.type,
          userId: userId || nanoid(4),
        },
        autoConnect: true,
      });

      this.socket.on("connect_error", (err) => {
        this.socketConnectionError(err);
        resolve({ data: null, error: "Connection error" });
      });

      this.socket.on("connect_timeout", (err) => {
        this.socketConnectionError(err);
        resolve({ data: null, error: "Connection timeout" });
      });

      resolve({ data: { status: "connected" }, error: null });
    });
  };

  //------------------------------//
  // EVENT LISTENERS AND HELPERS //
  //-----------------------------//

  protected emitEvent(eventName: string, detail?: any) {
    if (this.eventTarget instanceof EventEmitter) {
      this.eventTarget.emit(eventName, detail);
    } else {
      const event = new CustomEvent(eventName, { detail });
      this.eventTarget.dispatchEvent(event);
    }
  }

  on(eventName: HighNoonEvents, listener: (...args: any[]) => void) {
    if (this.eventTarget instanceof EventEmitter) {
      this.eventTarget.on(eventName, listener);
    } else {
      this.eventTarget.addEventListener(eventName, listener as EventListener);
    }
  }

  //-----------------------------//
  // SOCKET ACCESSORY FUNCTIONS //
  //----------------------------//

  socketConnectionError = (err: Error) => {
    this.printErrorMessage(
      `Error establishing a signalling connection: ${err.message} \n ${
        err.message.includes("Authentication error")
          ? "Check that your projectId and apiToken are correct."
          : ""
      }`
    );
  };

  protected printErrorMessage = (message: string) => {
    console.error(chalk.red(message));
  };

  protected printSuccessMessage = (message: string) => {
    console.log(chalk.green(message));
  };

  protected printDebugMessage = (message: string) => {
    if (this.options.showDebug) {
      console.log(chalk.blue(message));
    }
  };
}
