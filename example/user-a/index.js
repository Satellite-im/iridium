import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
dotenv.config({
  path: '../../.env',
});

console.info('relay peer', process.env.IRIDIUM_LOCAL_RELAY);

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
console.info('sending message');
await client.ipfs.repo.gc();
// await client.send(
//   'testing',
//   '12D3KooWJANMEJ97LJzLFH6N5Wgz63v8Qrv5rvyTm1iHu7asPasp'
// );
// console.info('exiting');
// await client.stop();
// process.exit(0);
await terminal.exec('whoami');
await terminal.exec('pins');

while (true) {
  const line = await rl.question('> ');
  await terminal.exec(line).catch((error) => {
    console.error(error);
  });
}
