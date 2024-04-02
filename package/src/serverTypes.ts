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

export type ClientAnswerEvent = {
  candidates: RTCIceCandidate[];
  answer: RTCSessionDescription;
  userId: string;
  roomId: string;
  from?: string;
};

export type ClientGetConnectedClientsEvent = {
  from: string;
}
