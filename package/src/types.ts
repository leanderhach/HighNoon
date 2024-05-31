export type HighNoonClientOptions = {
  channelName?: string;
  showDebug?: boolean;
  iceServers?: RTCIceServer[];
  signallingOverride?: string;
};

export type HighNoonClientRequirements = {
  projectId: string;
  apiToken: string;
  userId?: string;
};

export type HighNoonClientConstructor = HighNoonClientOptions &
  HighNoonClientRequirements;

export type HNResponse<T> = { data: T | null; error: string | null };

export type CreateRoomData = {
  room: string;
};
export type RoomJoinData = {
  room: string;
  connectedClients: number;
};

export type ClientListData = {
  clients: {
    userId: string;
    socketId: string;
  }[];
  count: number;
};

export type Initialize = {
  status: "connected";
};

export type HighNoonServerPeer = {
  peer: RTCPeerConnection;
  channelPromise: Promise<RTCDataChannel>;
  channel: RTCDataChannel | null;
  userId: string;
  socketId: string;
  // local content
  localIceCandidates: RTCIceCandidate[];
  localIceCandidatesCollected: boolean;
  localOffer: RTCSessionDescription;
  // foreign offers
  foreignOffer: RTCSessionDescription | null;
  foreignIceCandidates: RTCIceCandidate[];
  foreignIceCandidatesCollected: boolean;
  isHost: boolean;
};

export type HighNoonClientPeer = {
  usrId: string;
  socketId: string;
}

export type GuranteedMessageResponse = {
  success: boolean;
};

export type ServerMetadata = {
  roomId: string;
  initialized: boolean;
  connectedToRoom: boolean;
}

export interface HighNoonEvent {
  serverConnectionEstablished: {},
  clientPacketReceived: {
    meta: ServerMetadata;
    from: HighNoonClientPeer;
    payload: any;
  },
  serverPacketReceived: any
  clientConnected: ServerMetadata & {
    userId: string;
  },
  clientListUpdated: ServerMetadata & {
    clients: HighNoonClientPeer[];
    isJoin: boolean;
    newClient?: HighNoonClientPeer;
    removedClient?: HighNoonClientPeer;
  },
  safeMessageReceived: {
    meta: ServerMetadata,
    to: string;
    payload: any;
  },
}

export type HighNoonEvents = keyof HighNoonEvent;

export type ClientMessage = {
  payload: any;
}