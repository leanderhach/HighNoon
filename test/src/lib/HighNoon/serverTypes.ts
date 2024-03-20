export type ClientJoinEvent = {
  userId: string;
  socketId: string;
  connectedClients: number;
};

export type ServerOfferEvent = {
  candidates: RTCIceCandidate[];
  offer: RTCSessionDescription;
  to: string;
};
