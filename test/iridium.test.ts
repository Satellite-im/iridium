import test from 'ava';
import { CID } from 'multiformats';

import { sha256 } from 'multiformats/hashes/sha2';
import Iridium from '../src/iridium';

const te = new TextEncoder();

const profile = {
  name: 'John Doe',
  friends: [
    {
      id: 1,
      name: 'Jane Doe',
    },
    {
      id: 2,
      name: 'John Smith',
    },
  ],
};

let a: Iridium;
let b: Iridium;
test.before(async (t) => {
  a = await Iridium.fromSeed(await sha256.encode(te.encode('user a')), {
    config: {
      swarm: ['/ip4/127.0.0.1/tcp/9001/ws'],
      bootstrap: ['/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star'],
    },
  });

  b = await Iridium.fromSeed(await sha256.encode(te.encode('user b')), {
    config: {
      swarm: ['/ip4/127.0.0.1/tcp/9002/ws'],
      bootstrap: [
        '/ip4/127.0.0.1/tcp/9090/ws',
        '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWJBPqWozfB6Drp8BVVmRQc51x5Bz5GJ5cH2b3LtdrLRnw',
      ],
    },
  });
});

test.after(async () => {
  await a.ipfs.stop();
  await b.ipfs.stop();
});

test('it stores encrypted documents', async (t) => {
  const encrypted = await a.storeEncrypted(profile);
  t.assert(encrypted instanceof CID);
});

test('it retrieves and decrypts encrypted documents', async (t) => {
  const encrypted = await a.storeEncrypted(profile);
  const decrypted = await a.loadEncrypted(encrypted);
  t.deepEqual(decrypted, profile);
});

test('it cannot retrieve encrypted documents from other users', async (t) => {
  const encrypted = await a.storeEncrypted(profile);

  // expect loadEncrypted to throw with a timeout
  await t.throwsAsync(async () => {
    await b.loadEncrypted(encrypted, { timeout: 1000 });
  });
});

test('it sends and receives messages from other users', async (t) => {
  let received: any;
  a.on('message', (msg) => {
    console.info('received message', msg);
    received = msg;
  });

  const message = { from: b.id, payload: 'hello' };
  console.info('sending message');
  await b.send(message, [a.id]);

  t.deepEqual(received, message);
});
