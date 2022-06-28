import { createFromPrivKey } from '@libp2p/peer-id-factory';
import type { KeyType, PrivateKey } from '@libp2p/interfaces/src/keys';
import { create, Options } from 'ipfs-core';
import type { PeerId } from 'ipfs-core/ipns';
import * as ipfsHttpClient from 'ipfs-http-client';
import { DelegatedContentRouting } from '@libp2p/delegated-content-routing';
import { DelegatedPeerRouting } from '@libp2p/delegated-peer-routing';
import type { IridiumConfig } from './types';

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
  config: IridiumConfig = {}
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
      repo: `iridium/${peerId.toString()}/${Date.now()}`,
      repoAutoMigrate: false,
      relay: { enabled: true, hop: { enabled: true, active: true } },
      EXPERIMENTAL: { ipnsPubsub: true, sharding: true },
      offline: true,
      silent: false,
      preload: {
        enabled: false,
      },
      config: {
        Addresses: {
          API: '/dns4/ipfs.infura.io/tcp/5001/https',
          Gateway: '/dns4/satellite.infura-ipfs.io/tcp/443/https',
          RemotePinning: ['/dns4/satellite.infura-ipfs.io/tcp/443/https'],
          Swarm: [
            '/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star',
            '/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star',
          ],
          Delegates: [
            '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWMxGZS8e33Qf2r2qMcuWkEeuo8Fhjh7PUCSVvfTUhRCnY',
            '/dns4/satellite.infura-ipfs.io/tcp/443/https',
            '/dns4/trialect.infura-ipfs.io/tcp/443/https',
          ],
        },
        Bootstrap: [
          '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWMxGZS8e33Qf2r2qMcuWkEeuo8Fhjh7PUCSVvfTUhRCnY',
          '/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWQ3jkKp2rm42mC5h4mH5hjg9MfBUad8kjQkLokB2uXmd1',
          '/ip4/127.0.0.1/tcp/4003/ws/p2p/12D3KooWQ3jkKp2rm42mC5h4mH5hjg9MfBUad8kjQkLokB2uXmd1',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmZa1sAxajnQjVM8WjWXoMbmPd7NsWhfKsPkErzpm9wGkp',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
          '/dns4/node0.preload.ipfs.io/tcp/443/wss/p2p/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic',
          '/dns4/node1.preload.ipfs.io/tcp/443/wss/p2p/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6',
          '/dns4/node2.preload.ipfs.io/tcp/443/wss/p2p/QmV7gnbW5VTcJ3oyM2Xk1rdFBJ3kTkvxc87UFGsun29STS',
          '/dns4/node3.preload.ipfs.io/tcp/443/wss/p2p/QmY7JB6MQXhxHvq7dBDh4HpbH29v4yE9JRadAVpndvzySN',
        ],
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
      metrics: {
        enabled: false,
      },
      peerStore: {
        persistence: false,
      },
      connectionManager: {
        autoDial: true,
      },
    },
    config.ipfs
  );

  return conf;
}
