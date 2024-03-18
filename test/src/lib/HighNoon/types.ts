export type HighNoonClientOptions = {
  channelName?: string;
  showDebug?: boolean;
  iceServers?: RTCIceServer[];
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

export type Initialize = {
  status: "connected";
};

export type HighNoonServerPeer = {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  userId: string;
};
