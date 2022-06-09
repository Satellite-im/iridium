import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

import Iridium from '../dist/index.js';
import IridiumTerminal from '../dist/readline-adapter';

const client = await Iridium.fromSeedString('user a seed', {
  config: {
    ipfs: {
      config: {
        Addresses: {
          Swarm: ['/ip4/127.0.0.1/tcp/4003', '/ip4/127.0.0.1/tcp/4004/ws'],
        },
      },
    },
  },
});

const terminal = new IridiumTerminal(client);
await client.start();

while (true) {
  const line = await rl.question('> ');

  if (line === 'exit') {
    console.info('exiting');
    await client.ipfs.stop();
    break;
  }

  await terminal.exec(line).catch((error) => {
    console.error(error);
  });
}
