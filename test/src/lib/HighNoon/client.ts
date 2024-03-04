import { nanoid } from "nanoid";
import chalk from 'chalk';

export type HighNoonClientOptions = {
  channelName?: string;
  showDebug?: boolean;
  iceServers?: RTCIceServer[];
};

export default class HighNoonClient {
  client: RTCPeerConnection;
  channel: Promise<RTCDataChannel>;
  options: HighNoonClientOptions;

  constructor(options: HighNoonClientOptions = {}) {

    // setup options
    this.options = {
      channelName: options.channelName || `highnoon-client-${nanoid()}`,
      showDebug: options.showDebug || false,
      iceServers: options.iceServers || [],
    }

    // make a new RTC peer connection
    this.client = new RTCPeerConnection({
      iceServers: this.options.iceServers
    });

    if (this.options.showDebug) {
      console.group(chalk.blue("New HighNoon client created"))
      console.info(`Client name: ${this.options.channelName} `)
      console.info("ICE config: ", this.client.getConfiguration().iceServers)
      console.groupEnd()
    }


    // 
    this.channel = new Promise(resolve => {
      const c = this.client.createDataChannel(this.options.channelName!)

      c.onopen = ({ target }) => {

        if (target!.readyState === "open") {
          if (this.options.showDebug) {
            console.group(chalk.blue(`Change in ${this.options.channelName}`))
            console.log('Data channel opened');
            console.groupEnd()
          }
          resolve(c)
        }
      }
    })
  }

  initialize = async () => {
    const offer = new RTCSessionDescription(await this.client.createOffer());
    this.client.setLocalDescription(offer);
    this.client.onicecandidate = this.onIceCandidate;
    this.client.onicegatheringstatechange = this.onIceGatheringStateChange;
  }



  onIceCandidate = async ({ candidate }: { candidate: RTCIceCandidate | null }) => {
    if (this.options.showDebug) {
      console.group(chalk.blue(`Change in ${this.options.channelName}`))
      console.log('ICE candidate: ', candidate);
      console.groupEnd()
    }
  }


  onIceGatheringStateChange = async () => {
    if (this.options.showDebug) {
      console.group(chalk.blue(`Change in ${this.options.channelName}`))
      console.log('ICE gathering state changed: ', this.client.iceGatheringState);
      if (this.client.iceGatheringState === 'complete') {
        console.log('ICE gathering complete');
      }
      console.groupEnd()
    }
  }
}