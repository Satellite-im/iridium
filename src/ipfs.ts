import merge from 'merge';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import { create } from 'ipfs-core';
import type { IPFS } from 'ipfs-core';
import { keys } from '@libp2p/crypto';
import type { IridiumConfig } from './iridium';

export async function ipfsNodeFromSeed(
  seed: Uint8Array,
  config: IridiumConfig = {}
): Promise<{ ipfs: IPFS; peerId: string }> {
  const key = await keys.supportedKeys.ed25519.generateKeyPairFromSeed(seed);
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
        Addresses: {
          Swarm: [],
        },
        Bootstrap: [],
        Discovery: {
          MDNS: {
            Enabled: true,
            Interval: 0.1,
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
    config.ipfs
  );
}
