import { DID } from 'dids';
import pRetry from 'p-retry';
import { IridiumPubsubProvider } from 'src/core/pubsub/interface';
import type Iridium from 'src/iridium';
import {
  IridiumLogger,
  IridiumPeerIdentifier,
  IridiumPubsubMessage,
} from 'src/types';
import { IPFSWithLibP2P } from '../types';
import Emitter from 'src/core/emitter';

export class IPFSPubsubProvider
  extends Emitter<IridiumPubsubMessage>
  implements IridiumPubsubProvider
{
  private iridium?: Iridium;

  constructor(
    private readonly ipfs: IPFSWithLibP2P,
    private readonly logger: IridiumLogger = console
  ) {
    super();
  }

  async start(iridium: Iridium) {
    this.iridium = iridium;
    this.logger.info('iridium/pubsub/ipfs/start', 'starting');
  }

  async subscribe(topic: string) {
    this.logger.info(
      'iridium/pubsub/ipfs/subscribe',
      `subscribing to topic "${topic}"`
    );
    return this.ipfs.libp2p.pubsub.subscribe(topic);
  }

  async unsubscribe(topic: string) {
    this.logger.info(
      'iridium/pubsub/ipfs/unsubscribe',
      `unsubscribing from topic "${topic}"`
    );
    return this.ipfs.libp2p.pubsub.unsubscribe(topic);
  }

  async publish(topic: string, data: Uint8Array) {
    this.logger.info(
      'iridium/pubsub/ipfs/publish',
      `publishing to topic "${topic}"`,
      { topic, data }
    );
    const result = await this.ipfs.libp2p.pubsub.publish(topic, data);
    if (result.recipients.length === 0) {
      throw new Error(`ipfs/pubsub/publish: no recipients for topic ${topic}`);
    }
  }

  subscriptions(): string[] {
    return this.ipfs.libp2p.pubsub.getTopics();
  }

  async stop() {
    this.logger.info('iridium/pubsub/ipfs/stop', 'stopping');
    const channels = this.subscriptions();
    for (const channel of channels) {
      this.unsubscribe(channel);
    }
    this.ipfs.libp2p.stop();
  }

  waitForSubscriber(
    topic: string,
    options: {
      did?: IridiumPeerIdentifier;
      dids?: DID | string[] | undefined;
      timeout: number;
    }
  ): Promise<void> {
    this.logger.info(
      'iridium/pubsub/ipfs/waitForSubscriber',
      `waiting for subscriber to topic "${topic}"`,
      { topic, options }
    );
    return pRetry(
      async () => {
        const peer = options.did && this.iridium?.p2p.getPeer(options.did);
        const peers = await this.ipfs.pubsub.peers(topic);
        if (!peer) {
          if (peers.length) return;
          throw new Error(`No peers found for topic ${topic}`);
        }
        const peerIdString = typeof peer !== 'string' ? peer.toString() : peer;
        const peerIds = peers.map((p) => p.toString());
        if (!peerIds.includes(peerIdString)) {
          throw new Error(
            `Could not find peer ${peerIdString} in topic ${topic}`
          );
        }
      },
      { maxRetryTime: options.timeout }
    );
  }
}
