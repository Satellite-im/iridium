import merge from 'merge';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import { create } from 'ipfs-core';
import type { IPFS } from 'ipfs-core';
import { keys } from '@libp2p/crypto';
import { IridiumConfig } from './iridium';

export async function ipfsNodeFromSeed(
  seed: Uint8Array,
  config: IridiumConfig = {}
): Promise<IPFS> {
  const key = await keys.supportedKeys.ed25519.generateKeyPairFromSeed(seed);
  const peerId = await createFromPrivKey(key);
  return create(ipfsConfig(peerId, config));
}

export function ipfsConfig(peerId: any, config: IridiumConfig = {}) {
  console.info(
    'repo',
    `${config.repo || 'iridium'}/${
      config.version || 'v1.0.0'
    }/${peerId.toString()}`
  );
  return merge(
    {
      repo: `${config.repo || 'iridium'}/${
        config.version || 'v1.0.0'
      }/${peerId.toString()}`,
      config: {
        Addresses: {
          Swarm: config.swarm,
        },
        Bootstrap: config.bootstrap || [],
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
          PubSubRouter: 'floodsub',
          Enabled: true,
        },
        Routing: {
          type: 'dhtclient',
        },
        Swarm: {
          DisableRelay: false,
          EnableRelayHop: true,
        },
        Identity: {
          peerId,
        },
      },
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: true,
        },
      },
      init: {
        privateKey: peerId,
        algorithm: 'ed25519',
      },
    },
    config
  );
}
