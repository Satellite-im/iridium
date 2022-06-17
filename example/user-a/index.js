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
    ipfs: {
      config: {
        Addresses: {
          Swarm: ['/ip4/127.0.0.1/tcp/9000', '/ip4/127.0.0.1/tcp/9001/ws'],
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
