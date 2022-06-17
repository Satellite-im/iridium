import merge from 'merge';
import { createFromPrivKey } from '@libp2p/peer-id-factory';
import type { PrivateKey } from '@libp2p/interfaces/src/keys';
import { DelegatedContentRouting } from '@libp2p/delegated-content-routing';
import { DelegatedPeerRouting } from '@libp2p/delegated-peer-routing';
import { create } from 'ipfs-core';
import type { IridiumConfig } from './iridium';
import type { PeerId } from 'ipfs-core/ipns';
import * as ipfsHttpClient from 'ipfs-http-client';

export async function ipfsNodeFromKey(
  key: PrivateKey,
  config: IridiumConfig = {}
): Promise<{ ipfs: any; peerId: PeerId }> {
  const peerId = await createFromPrivKey(key);
  return {
    ipfs: await create(ipfsConfig(peerId, config)),
    peerId,
  };
}

export function ipfsConfig(peerId: PeerId, config: IridiumConfig = {}) {
  const contentRouting = new DelegatedContentRouting(
    ipfsHttpClient.create({
      protocol: 'https',
      port: 443,
      host: 'satellite.infura-ipfs.io',
    })
  );

  const peerRouting = new DelegatedPeerRouting(
    ipfsHttpClient.create({
      protocol: 'https',
      port: 443,
      host: 'satellite.infura-ipfs.io',
    })
  );

  const conf = merge.recursive(
    true,
    {
      repo: `iridium/${Math.random()}/${peerId}`,
      offline: true,
      silent: true,
      preload: {
        enabled: false,
      },
      config: {
        Addresses: {
          API: '/dns4/ipfs.infura.io/tcp/5001/https',
          Gateway: '/dns4/satellite.infura-ipfs.io/tcp/443/https',
          RemotePinning: ['/dns4/satellite.infura-ipfs.io/tcp/443/https'],
        },
        Discovery: {
          MDNS: {
            Enabled: true,
            Interval: 0.1,
          },
          webRTCStar: {
            Enabled: true,
          },
        },
        Experimental: {
          ShardingEnabled: false,
          FilestoreEnabled: false,
          Libp2pStreamMounting: false,
        },
        Ipns: {
          RecordLifeTime: '90d',
          RepublishPeriod: '24h',
          ResolveCacheSize: 256,
          UsePubsub: true,
        },
        Pubsub: {
          Enabled: true,
          Router: 'gossipsub',
        },
        Mounts: {
          FuseAllowOther: false,
          IPFS: '/ipfs',
          IPNS: '/ipns',
        },
        Reprovider: {
          Interval: '6h',
          Strategy: 'pinned',
        },
        Swarm: {
          AddrFilters: null,
          ConnMgr: {
            GracePeriod: '60s',
            HighWater: 200,
            LowWater: 20,
            Type: 'basic',
          },
          DisableBandwidthMetrics: true,
          DisableNatPortMap: false,
          DisableRelay: false,
          EnableRelayHop: true,
          EnableAutoNATService: true,
          EnableAutoRelay: true,
        },
        Datastore: {
          BloomFilterSize: 0,
          GCPeriod: '1h',
          HashOnRead: true,
          StorageGCWatermark: 90,
          StorageMax: '10GB',
        },
        Router: {
          Enabled: true,
          Type: 'dht',
        },
      },
      init: {
        algorithm: 'ed25519',
        profiles: ['default-power'],
        privateKey: peerId,
        allowNew: true,
        emptyRepo: true,
      },
      libp2p: {
        addresses: {},
        dialer: {
          maxParallelDials: 20,
          maxDialsPerPeer: 4,
          dialTimeout: 60000,
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
          },
          nat: {
            enabled: true,
            // ttl: 7200,
            // keepAlive: true,
            // pmp: {
            // enabled: false,
            // },
          },
          relay: {
            enabled: true,
            hop: {
              enabled: true,
              active: true,
            },
          },
          peerRouting: {
            // Peer routing configuration
            refreshManager: {
              // Refresh known and connected closest peers
              enabled: true, // Should find the closest peers.
              interval: 6e5, // Interval for getting the new for closest peers of 10min
              bootDelay: 10e3, // Delay for the initial query for closest peers
            },
          },
        },
        contentRouting: [contentRouting],
        peerRouting: [peerRouting],
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

  conf.config.peerId = peerId;
  conf.init.privateKey = peerId;

  if (process.env.IRIDIUM_LOCAL_RELAY) {
    conf.libp2p.addresses.bootstrap = [
      '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star',
      `/ip4/127.0.0.1/tcp/15003/ws/p2p/${process.env.IRIDIUM_LOCAL_RELAY}`,
      `/ip4/127.0.0.1/tcp/8000/p2p/${process.env.IRIDIUM_LOCAL_RELAY}`,
    ];
    console.info(`Using local relay peer: ${process.env.IRIDIUM_LOCAL_RELAY}`);
  }

  return conf;
}
