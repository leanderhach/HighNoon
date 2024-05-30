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
};


export type HighNoonClientPeer = {
  usrId: string;
  socketId: string;
}

export type HighNoonEvents = "serverConnectionEstablished" | "messageReceived" | "clientConnected" | "clientListUpdated";


export type GuranteedMessageResponse = {
  success: boolean;
};