import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
dotenv.config();

const rl = readline.createInterface({ input, output });

import Iridium from '../../dist/index.js';
import IridiumTerminal from '../../dist/readline-adapter';

const client = await Iridium.fromSeedString('user b seed', {
  config: {
    followedPeers: ['12D3KooWJ1KLJy1UiNZWGe96WPgsRjWKnZQQ6erbc5KebT5sne6e'],
    ipfs: {
      config: {
        Addresses: {
          Swarm: ['/ip4/127.0.0.1/tcp/9002', '/ip4/127.0.0.1/tcp/9003/ws'],
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
