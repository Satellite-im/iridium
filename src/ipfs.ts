import merge from 'merge';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import type { PrivateKey } from '@libp2p/interfaces/src/keys';
import { create } from 'ipfs-core';
import type { IPFS } from 'ipfs-core';
import type { IridiumConfig } from './iridium';

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

export function ipfsConfig(peerId: any, config: IridiumConfig = {}) {
  return merge(
    {
      repo: `${config.repo || 'iridium'}/${
        config.version || 'v1.0.0'
      }/${peerId.toString()}`,
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
        Pubsub: {
          Enabled: true,
        },
        Swarm: {
          DisableRelay: false,
          EnableRelayHop: true,
        },
        Datastore: {
          GCPeriod: '1h',
          StorageGCWatermark: 90,
        },
      },
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: true,
        },
      },
      EXPERIMENTAL: {
        pubsub: true,
      },
      init: {
        privateKey: peerId,
        algorithm: 'ed25519',
      },
    },
    config.ipfs
  );
}
