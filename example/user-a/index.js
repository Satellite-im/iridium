import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

import Iridium from '../../dist/index.js';
import IridiumTerminal from '../../dist/readline-adapter';

const client = await Iridium.fromSeedString('user a seed', {
  config: {
    followedPeers: ['12D3KooWJANMEJ97LJzLFH6N5Wgz63v8Qrv5rvyTm1iHu7asPasp'],
  },
});

await client.ipfs.bootstrap.add(
  `/ip4/127.0.0.1/tcp/4001/ipfs/${client.peerId}`
);
await client.ipfs.bootstrap.add(
  `/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star/ipfs/${client.peerId}`
);
// add pinata pinning service
const pins = await client.ipfs.pin.ls();
console.info(`Pins: ${pins?.length || 0}`);
console.info(`----+----`);
for await (const pin of pins) {
  console.info(`    | ${pin.cid}`);
}

const terminal = new IridiumTerminal(client);
await client.start();
await terminal.exec('whoami');

while (true) {
  const line = await rl.question('> ');
  await terminal.exec(line).catch((error) => {
    console.error(error);
  });
}
