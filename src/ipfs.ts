import merge from 'merge';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import type { PrivateKey } from '@libp2p/interfaces/src/keys';
import { create } from 'ipfs-core';
import type { IPFS } from 'ipfs-core';
import type { IridiumConfig } from './iridium';
import type { PeerId } from 'ipfs-core/ipns';

export async function ipfsNodeFromKey(
  key: PrivateKey,
  config: IridiumConfig = {}
): Promise<{ ipfs: IPFS; peerId: string }> {
  const peerId = await createFromPrivKey(key);
  return {
    ipfs: await create(ipfsConfig(peerId, config)),
    peerId: peerId.toString(),
  };
}

export function ipfsConfig(peerId: PeerId, config: IridiumConfig = {}) {
  return merge(
    {
      repo: `${config.repo || 'iridium'}/${config.version || 'v1.0.0'}`,
      config: {
        Discovery: {
          MDNS: {
            Enabled: true,
            Interval: 1,
          },
          webRTCStar: {
            Enabled: true,
          },
        },
        Experimental: {
          ShardingEnabled: true,
          FilestoreEnabled: true,
          Libp2pStreamMounting: true,
        },
        Pubsub: {
          Enabled: true,
          Router: 'floodsub',
        },
        Swarm: {
          DisableRelay: false,
          EnableRelayHop: true,
          EnableAutoNATService: false,
          EnableAutoRelay: true,
        },
        Datastore: {
          GCPeriod: '1h',
          StorageGCWatermark: 90,
        },
        Router: {
          Enabled: true,
          Type: 'dht',
        },
      },
      init: {
        privateKey: peerId,
        algorithm: 'ed25519',
      },
    },
    config.ipfs
  );
}
