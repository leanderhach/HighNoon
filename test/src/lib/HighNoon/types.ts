export type HighNoonClientOptions = {
    channelName?: string;
    showDebug?: boolean;
    iceServers?: RTCIceServer[];
};

export type HighNoonClientRequirements = {
    projectId: string;
    apiToken: string;
};

export type HighNoonClientConstructor = HighNoonClientOptions &
    HighNoonClientRequirements;