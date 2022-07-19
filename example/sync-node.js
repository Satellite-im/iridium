import { createIridiumIPFS } from '../dist/index.js';
import SyncNode from '../dist/sync.js';

const client = await createIridiumIPFS('sync node a seed', {
  config: {
    ipfs: {
      config: {
        Addresses: {
          Swarm: ['/ip4/127.0.0.1/tcp/4007', '/ip4/127.0.0.1/tcp/4008/ws'],
        },
      },
    },
  },
});

const node = new SyncNode(client);
await node.start();
