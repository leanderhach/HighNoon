import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type {
  HighNoonClientConstructor,
  HighNoonClientOptions,
  HighNoonEvents,
  HNResponse,
  Initialize,
} from "./types";
import chalk from "chalk";
import { nanoid } from "nanoid";
import { EventEmitter } from "events";

export class HighNoonBase<T extends HighNoonEvents> {
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
      iceServers: options.iceServers || [{ urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }],
      signallingOverride: options.signallingOverride || undefined,
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
      this.socket = io(this.options.signallingOverride || "https://service.gethighnoon.com", {
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

      this.socket.onAny((eventName, args) => {
        this.printDebugMessage(`an event was recieved: ${eventName} \n Data: \n ${JSON.stringify(args)}`)
      })

      this.socket.on("connect_error", (err) => {
        this.socketConnectionError(err);
        resolve({ data: null, error: "Connection error" });
      });

      this.socket.on("connect_timeout", (err) => {
        this.socketConnectionError(err);
        resolve({ data: null, error: "Connection timeout" });
      });

      this.socket.on("connect", () => {
        console.log(this.socket?.connected);
        this.socket?.emit("get_turn_auth");
        this.socket?.on("turn_auth", (data) => {

          this.options.iceServers!.push(data);
          
          resolve({ data: { status: "connected" }, error: null });
        })
      })
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

  on<K extends keyof T>(eventName: K, listener: (data: T[K]) => void) {
    if (this.eventTarget instanceof EventEmitter) {
      this.eventTarget.on(eventName as string, listener);
    } else {
      const wrappedListener = (event: Event) => {

        listener((event as CustomEvent).detail as T[K]);
      };
      this.eventTarget.addEventListener(eventName as string, wrappedListener as EventListener);
    }
  }

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

  protected decodeMessagePayload = (message: any) => {
    if (typeof message === "string") {
      try {
        return JSON.parse(message);
      } catch (e) {
        return message;
      }
    } else {
      try {
        return {
          ...message,
          payload: JSON.parse(message.payload),
        }
      } catch (e) {
        return {
          ...message,
          payload: message.payload,
        }
      }
    }
  }
}
