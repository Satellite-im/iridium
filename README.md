# Iridium Protocol

Iridium is a loosely defined protocol for peer to peer communication and storage for user application data (profile, friends, messages, files, etc...) leveraging IPFS and dag-jose.

## Developing with Iridium

Iridium comes with support for developing with a local `@libp2p/webrtc-star-signalling-server` and `libp2p-relay-server`.
To enable this support, first run the `bootstrap:init` command:

```sh
pnpm bootstrap:init
```

Then, start the local relay servers with `bootstrap`:

```sh
pnpm bootstrap
```

The relay servers are used in place of public IPFS nodes to deliver messages between peers during local development.

In another tab start the build and watch the source files for changes:

```sh
pnpm watch
```

Now you can link Iridium in a local project:

```sh
# from the iridium directory:
pnpm link . --global
# OR
yarn link

# from the other project directory:
pnpm link @satellite-im/iridium --global
# OR
yarn link @satellite-im/iridium
```

## Create an Iridium Instance

```js
const client = await Iridium.fromSeedString('user a seed', {
  config: {
    // peerIds to automatically establish a connection with
    followedPeers: ['12D3KooWJANMEJ97LJzLFH6N5Wgz63v8Qrv5rvyTm1iHu7asPasp'],
    // ipfs node config
    ipfs: {
      config: {
        Addresses: {
          // addresses to LISTEN ON
          Swarm: ['/ip4/127.0.0.1/tcp/9000', '/ip4/127.0.0.1/tcp/9001/ws'],
        },
        Boostrap: [
          // addresses to CONNECT TO
        ],
      },
      libp2p: {
        // p2p configuration
      },
    },
  },
});
```

## Direct Communication

```js
await iridium.send(someOtherDID, {
  type: 'friend:request',
  displayName,
  profilePicture,
});

await iridium.sendSigned(someOtherDID, {
  type: 'signed:message',
  data,
});

await iridium.sendEncrypted(someOtherDID, {
  type: 'secret:message',
  data,
});

iridium.on('message', ({ from, payload }) => {
  const { type } = payload;
  if (type === 'friend:request') {
    /* ... */
  } else if (type === 'signed:message') {
    /* ... */
  } else if (type === 'secret:message') {
    /* ... */
  }
});
```

## Pubsub

```js
// user-b
iridium.followPeer(userAPeerId);
iridium.on('peer:channel_name', ({ from, payload }) => {
  if (from === userAPeerId) {
    // do a thing
  }
});

// user-a
await iridium.broadcast('channel_name', payload);
```

## Managing User Documents

```js
// fetch the root level IPNS document
const userData = await iridium.get('/');
await iridium.set('/profile', {
  name: 'foo bar',
  friends: [
    {
      id: 1,
      name: 'bar baz',
    },
  ],
});
const friend = await iridium.get('/profile/friends/0');
await iridium.set('/profile/friends/0', {
  ...friend,
  profilePicture,
});
```

## Managing Other Documents

```js
// plaintext
const cid = await iridium.store(document);
const doc = await iridium.load(cid);

// signed (JWS)
const cid = await iridium.storeSigned(document, arrayOfTargetDIDs);
const doc = await iridium.loadSigned(cid); // throws if signature invalid

const cid = await iridium.storeEncrypted(document, arrayOfTargetDIDs);
const doc = await iridiumloadEncrypted(document); // throws if signature/encryption invalid
```
