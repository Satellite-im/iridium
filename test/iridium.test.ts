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

function makeClient(seed: string) {
  return Iridium.fromSeedString(seed);
}

test('it stores encrypted documents', async (t) => {
  const client = await makeClient('test 1');
  const encrypted = await client.storeEncrypted(profile);
  t.assert(encrypted instanceof CID);
  await client.ipfs.stop();
});

test('it retrieves and decrypts encrypted documents', async (t) => {
  const client = await makeClient('test 2');
  const encrypted = await client.storeEncrypted(profile);
  const decrypted = await client.loadEncrypted(encrypted);
  decrypted.friends = Object.values(decrypted.friends);
  t.deepEqual(decrypted, profile);
  await client.ipfs.stop();
});

test('it cannot retrieve encrypted documents from other users', async (t) => {
  const a = await makeClient('test 3-a');
  const b = await makeClient('test 3-b');
  const encrypted = await a.storeEncrypted(profile);

  // expect loadEncrypted to throw with a timeout
  await t.throwsAsync(async () => {
    await b.loadEncrypted(encrypted);
  });

  await a.ipfs.stop();
  await b.ipfs.stop();
});

test('it can be used to store and retrieve documents from the IPNS record', async (t) => {
  const client = await makeClient('test 4');
  const profile = {
    name: 'John Doe',
  };
  await client.set('/', profile);
  const stored = await client.get('/');
  t.deepEqual(stored, profile);

  await client.ipfs.stop();
});

test('it can be used to store and retrieve document fragments from the IPNS record', async (t) => {
  const client = await makeClient('test 5');
  const profile = {
    name: 'John Doe',
  };
  const friends = ['foo', 'bar'];
  const meta = { foo: { bar: { baz: true } } };
  await client.set('/profile', {
    ...profile,
    friends,
    meta,
  });
  const stored = await client.get('/profile');
  console.info('stored', stored);
  t.deepEqual(stored, {
    ...profile,
    friends,
    meta,
  });
  t.deepEqual(await client.get('/profile/friends'), friends);
  t.deepEqual(await client.get('/profile/friends/0'), friends[0]);
  t.deepEqual(await client.get('/profile/friends/1'), friends[1]);
  t.deepEqual(await client.get('/profile/meta'), meta);
  await client.ipfs.stop();
});

test('it sends and receives messages from other users', async (t) => {
  const a = await makeClient('test 6-a');
  const b = await makeClient('test 6-b');
  let received: any;
  a.on('message', (msg) => {
    console.info('received message', msg);
    received = msg;
  });

  console.info('waiting for a to be listening', a.id, a.peerId);
  await b.waitForTopicPeer(a.id, a.peerId);

  console.info('sending message');
  const message = { from: b.id, payload: 'hello' };
  await b.send(message, [a.id]);

  await new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });

  t.deepEqual(received, message);
  await a.ipfs.stop();
  await b.ipfs.stop();
});
