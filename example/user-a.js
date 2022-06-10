import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

import Iridium from '../dist/index.js';
import IridiumTerminal from '../dist/readline-adapter';

/*
{
  peerId: '12D3KooWJ1KLJy1UiNZWGe96WPgsRjWKnZQQ6erbc5KebT5sne6e',
  did: 'did:key:z6MkneDDA5gCs1nUyFUNZMuNW2yV7odcUr2ULVsZ3jtzovA6'
}
*/
const client = await Iridium.fromSeedString('user a seed', {
  config: {
    ipfs: {
      config: {
        Addresses: {
          Swarm: ['/ip4/127.0.0.1/tcp/4003', '/ip4/127.0.0.1/tcp/4004/ws'],
        },
      },
      Bootstrap: [
        '/ip4/127.0.0.1/tcp/4006/ws/p2p/12D3KooWJ1KLJy1UiNZWGe96WPgsRjWKnZQQ6erbc5KebT5sne6e',
      ],
    },
    followedPeers: ['12D3KooWJANMEJ97LJzLFH6N5Wgz63v8Qrv5rvyTm1iHu7asPasp'],
  },
});

const terminal = new IridiumTerminal(client);
await client.start();

while (true) {
  const line = await rl.question('> ');
  await terminal.exec(line).catch((error) => {
    console.error(error);
  });
}
