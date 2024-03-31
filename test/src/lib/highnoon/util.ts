export function isWebRTCAvailable() {
    return typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined' && typeof window !== 'undefined';
}