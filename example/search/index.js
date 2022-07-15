import Iridium from '../../dist/index.js';

const client = await Iridium.fromSeedString('search user seed', {
  config: {
    syncNodes: [],
    ipfs: {
      config: {
        Addresses: {
          Swarm: [],
        },
      },
    },
  },
});
