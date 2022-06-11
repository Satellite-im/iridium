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
      repo: `${config.repo || 'iridium'}/${
        config.version || 'v0.0.1'
      }/${peerId.toString()}`,
      offline: true,
      silent: true,
      preload: {
        enabled: false,
      },
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
        },
        Swarm: {
          DisableRelay: false,
          EnableRelayHop: true,
          EnableAutoNATService: true,
          EnableAutoRelay: true,
        },
        Datastore: {
          GCPeriod: '10m',
          StorageGCWatermark: 90,
        },
        Router: {
          Enabled: true,
          Type: 'dhtclient',
        },
      },
      init: {
        privateKey: peerId,
        algorithm: 'ed25519',
      },
      libp2p: {
        addresses: {
          bootstrap: [
            '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star',
            '/ip4/127.0.0.1/tcp/15003/ws/p2p/QmepGAJCPEtn92mwznz1GKc2vqY4E3A4yFDBi7riDAr7Et',
            '/ip4/127.0.0.1/tcp/8000/p2p/QmepGAJCPEtn92mwznz1GKc2vqY4E3A4yFDBi7riDAr7Et',
          ],
        },
        dialer: {
          maxParallelDials: 150,
          maxDialsPerPeer: 4,
          dialTimeout: 5 * 1000,
        },
        config: {
          peerDiscovery: {
            mdns: {
              enabled: true,
            },
            webRTCStar: {
              enabled: true,
            },
          },
          pubsub: {
            enabled: true,
            emitSelf: false,
            canRelayMessages: true,
          },
          dht: {
            enabled: true,
            kBucketSize: 20,
            randomWalk: {
              enabled: true,
              interval: 10e3, // This is set low intentionally, so more peers are discovered quickly. Higher intervals are recommended
              timeout: 2e3, // End the query quickly since we're running so frequently
            },
          },
          nat: {
            enabled: true,
            ttl: 7200,
            keepAlive: true,
            pmp: {
              enabled: false,
            },
          },
          relay: {
            enabled: true,
            hop: {
              enabled: true,
              active: true,
            },
          },
        },
        peerId,
        metrics: {
          enabled: false,
        },
        peerStore: {
          persistence: false,
        },
        connectionManager: {
          autoDial: false,
        },
      },
    },
    config.ipfs
  );
}
