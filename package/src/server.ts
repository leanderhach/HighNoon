import chalk from "chalk";
import { HighNoonBase } from "./base";
import type {
  HighNoonClientConstructor,
  HNResponse,
  CreateRoomData,
  HighNoonServerPeer,
  ClientListData,
  ClientMessage,
  HighNoonServerEvents,
  HighNoonRelayMessage,
} from "./types";
import type { ClientAnswerEvent, ClientGetConnectedClientsEvent, ClientJoinEvent } from "./serverTypes";
import { isWebRTCAvailable } from "./util";

/**
 * HighNoonServer class
 * 
 * Class for the HighNoonServer. Docuemntation for this class can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
 * 
 * @extends HighNoonBase
 */
export default class HighNoonServer extends HighNoonBase<HighNoonServerEvents> {
  foreignPeers: HighNoonServerPeer[] = [];

  /**
   * Constructor for the HighNoonServer class
   * 
   * Documentation for this class can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
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
   * This functions should be called after a HighNoonServer instance is created. It will
   * initialize the server and connect it to the HighNoon signaling server.
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
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
    this.socket!.on("message", (data) => this.handleRelayMessage(data));
    return { data, error };
  };

  /**
   * 
   * 
   * 
   * ROOM HANDLERS
   * 
   * Functions to handler room creation and management
   * 
   * 
   * 
   */


  /**
   * Creates a new room for the server to manage. This step is required to allow clients to interact with the server.
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
   * 
   * @returns Promise<HNResponse<CreateRoomData>>
   */
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


  /**
   * 
   * 
   * 
   * 
   *  MESSAGING HANDLERS
   * 
   * 
   * functions for sending and receving messages with clients
   * 
   * 
   * 
   * 
   */

  /**
   * This function will send a given message to all clients via the WebRTC connection. Note that 
   * the message will be stringified before being sent. 
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
   * 
   * @param message the message to be sent. This will be stringified before being sent
   */
  broadcast = (message: any) => {
    console.log(chalk.green("Broadcasting WebRTC message to all clients: " + JSON.stringify(message)));
    this.foreignPeers.forEach((peer) => {
      peer.channel?.send(JSON.stringify(message));
    });
  };

  /**
   * Sends a message to a specific client via the WebRTC connection. Note that the message will be stringified before being sent.
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
   * 
   * @param userId the user to send the message to
   * @param message the message to be sent
   * @returns If the user was found, the function will return a success. If the user was not found, the function will return an error.
   */
  send = (userId: string, message: any) => {
    this.printDebugMessage("Sending the following message: " + JSON.stringify(message) + ", to user: " + userId);
    const peer = this.foreignPeers.find((p) => p.userId === userId);
    if (peer) {
      this.printDebugMessage("User found, sending message")
      peer.channel?.send(JSON.stringify(message));

      return { data: { success: true }, error: null };
    } else {
      return { data: null, error: "Client not found" };
    }
  };

  /**
   * Sends a message to all clients connected to the room via a WebSocket connection.
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
   * 
   * @param message the message to be sent
   * @param stringify whether or not to stringify the message before sending
   */
  relay = (message: any, stringify: boolean = false) => {
    this.printDebugMessage("Broadcasting WebSocket message to all clients: " + JSON.stringify(message));
    this.socket?.emit("server_send_message", this.attachMetadata({
      payload: stringify ? JSON.stringify(message) : message,
    }));
  }

  /**
   * Sends a message to a specified client via the WebSocket connection.
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
   * 
   * @param userId the user to send the message to
   * @param message the message to be sent
   * @param stringify whether or not to stringify the message before sending
   * @returns If the user was found, the function will return a success. If the user was not found, the function will return an error.
   */
  relayTo = (userId: string, message: any, stringify: boolean = false) => {
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

  /**
   * This function will return a list of all clients connected to the server. In many instances, it may be more 
   * convenient to use the `clientListUpdated` event to get a list of connected clients instead as this is 
   * guaranteed to be up to date.
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
   * 
   * @returns a list of connected clients
   */
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

  /**
   * Kicks a client from the server using their userId. This will close the WebRTC connection and remove the client from
   * the signalling room. It will also send an updated list of connected clients to all clients.
   * 
   * Documentation can be found at the [HighNoon Documentation](https://docs.gethighnoon.com)
   * 
   * @param userId the user to kick from the server
   * @returns a list of connected clients after the user has been kicked
   */
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

      // handle the channel being closed
      c.onclose = () => {
        this.printDebugMessage("Channel closed with client: " + data.userId);
        this.emitEvent("clientDisconnected", this.attachMetadata({ userId: data.userId }));
        this.foreignPeers = this.foreignPeers.filter((p) => p.userId !== data.userId);
        this.socket!.emit("update_client_list", this.attachMetadata({
          isJoin: false,
          removedClient: {
            userId: data.userId,
          },
          clients: this.getConnectedClients(),
        }))
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
    this.emitEvent("packet",
      this.attachMetadata({
        from: {
          userId: peer.userId,
          socketId: peer.socketId,
        },
        payload: this.decodeMessagePayload(data),
      })
    );
  };

  private handleRelayMessage = (data: HighNoonRelayMessage) => {

    // we can ignore the message if it is not addressed to the server
    if (!data.to || data.to !== "server") {
      return;
    }

    this.emitEvent("relay", data);
  }

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
