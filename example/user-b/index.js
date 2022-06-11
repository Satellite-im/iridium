import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

import Iridium from '../../dist/index.js';
import IridiumTerminal from '../../dist/readline-adapter';

const client = await Iridium.fromSeedString('user b seed', {
  config: {
    followedPeers: ['12D3KooWJ1KLJy1UiNZWGe96WPgsRjWKnZQQ6erbc5KebT5sne6e'],
  },
});

const terminal = new IridiumTerminal(client);
await client.start();
await terminal.exec('whoami');

while (true) {
  const line = await rl.question('> ');
  await terminal.exec(line).catch((error) => {
    console.error(error);
  });
}
