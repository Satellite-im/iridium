import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
dotenv.config({
  path: '../../.env',
});

const rl = readline.createInterface({ input, output });

import Iridium from '../../dist/index.js';
import IridiumTerminal from '../../dist/readline-adapter';

const client = await Iridium.fromSeedString('user a seed', {
  config: {
    followedPeers: ['12D3KooWJANMEJ97LJzLFH6N5Wgz63v8Qrv5rvyTm1iHu7asPasp'],
    syncNodes: [
      {
        label: 'Satellite.im Sync Node',
        peerId: '12D3KooWQ3jkKp2rm42mC5h4mH5hjg9MfBUad8kjQkLokB2uXmd1',
        multiaddr:
          '/ip4/127.0.0.1/tcp/4003/ws/p2p/12D3KooWQ3jkKp2rm42mC5h4mH5hjg9MfBUad8kjQkLokB2uXmd1',
      },
    ],
    ipfs: {
      config: {
        Addresses: {
          Swarm: [
            '/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star',
            '/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star',
            '/ip4/127.0.0.1/tcp/9000',
            '/ip4/127.0.0.1/tcp/9001/ws',
          ],
        },
      },
    },
  },
});

const terminal = new IridiumTerminal(client);
await client.start();
await terminal.exec('whoami');
await terminal.exec('pins');

while (true) {
  const line = await rl.question('> ');
  await terminal.exec(line).catch((error) => {
    console.error(error);
  });
}
