import { createFromPrivKey } from '@libp2p/peer-id-factory';
import type { KeyType, PrivateKey } from '@libp2p/interfaces/keys';
import { create, Options } from 'ipfs-core';
import type { PeerId } from 'ipfs-core/ipns';
import * as ipfsHttpClient from 'ipfs-http-client';
import { WebSockets } from '@libp2p/websockets';
import * as filters from '@libp2p/websockets/filters';
import { DelegatedContentRouting } from '@libp2p/delegated-content-routing';
import { DelegatedPeerRouting } from '@libp2p/delegated-peer-routing';
import type { IridiumConfig } from '../../types';
import { IridiumIPFSConfig } from './types';

export async function ipfsNodeFromKey(
  key: PrivateKey,
  config: IridiumConfig = {}
): Promise<{ ipfs: any; peerId: PeerId }> {
  const peerId = await createFromPrivKey(key);
  const conf = await ipfsConfig(peerId, config);
  return {
    ipfs: await create(conf),
    peerId,
  };
}

export async function ipfsConfig(
  peerId: PeerId,
  config: IridiumIPFSConfig = {}
): Promise<Options> {
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

  const localRelay =
    process.env.IRIDIUM_LOCAL_RELAY ||
    process.env.NUXT_ENV_IRIDIUM_LOCAL_RELAY ||
    process.env.VITE_ENV_IRIDIUM_LOCAL_RELAY;
  if (localRelay) {
    console.info(`Using local relay peer: ${localRelay}`);
  }
  const conf = Object.assign(
    {},
    {
      repo: 'iridium',
      repoAutoMigrate: false,
      relay: { enabled: true, hop: { enabled: true, active: true } },
      config: {
        Addresses: {
          API: '/dns4/ipfs.infura.io/tcp/5001/https',
          Gateway: '/dns4/satellite.infura-ipfs.io/tcp/443/https',
          RemotePinning: ['/dns4/satellite.infura-ipfs.io/tcp/443/https'],
          Swarm: [
            '/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star',
            '/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star',
          ],
        },
        Bootstrap: [
          '/ip4/127.0.0.1/tcp/15003/ws/p2p/QmekhznL3jS9HgHViLkQ3VWY6XmgierxHrUL4JXLFqgAap',
          '/ip4/127.0.0.1/tcp/8000/p2p/QmekhznL3jS9HgHViLkQ3VWY6XmgierxHrUL4JXLFqgAap',
          '/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star',
        ],
      },
      libp2p: {
        peerId,
        // datastore: new MemoryDatastore(),
        peerRouting: {
          refreshManager: {
            enabled: true,
            interval: 6e5,
            bootDelay: 10e3,
          },
        },
        identify: {
          protocolPrefix: 'iridium',
        },
        ping: {
          protocolPrefix: 'iridium',
        },
        transports: [
          new WebSockets({
            filter: filters.all,
          }),
        ],
        // peerStore: {
        //   addressFilter: (peerId: PeerId) => {
        //     return (
        //       config.followedPeers?.includes(peerId.toString()) ||
        //       config.syncNodes?.some(
        //         (node) => node.peerId === peerId.toString()
        //       )
        //     );
        //   },
        // },
        relay: {
          enabled: true,
          hop: {
            enabled: true,
            active: true,
          },
          advertise: {
            bootDelay: 60 * 1000,
            enabled: true,
            ttl: 30 * 60 * 1000,
          },
        },
      },
      init: {
        algorithm: 'ed25519' as KeyType,
        profiles: ['default-power'],
        privateKey: peerId,
        allowNew: true,
        emptyRepo: true,
      },
      contentRouting: [contentRouting],
      peerRouting: [peerRouting],
    },
    config.ipfs
  );

  return conf;
}
