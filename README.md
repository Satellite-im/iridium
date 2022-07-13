# Iridium Protocol

Iridium is a loosely defined protocol for peer-to-peer communication and storage for user application data (profile, friends, messages, files, etc...) leveraging IPFS and dag-jose.

## Developing with Iridium

### Install Dependencies

```sh
# install npm dependencies:
pnpm i

# install libp2p-relay server _globally_:
volta install libp2p-relay-server
# or
pnpm i -g libp2p-relay-server

# install jq
brew install jq # https://github.com/stedolan/jq for other OS
```

### Set up your .env

The `bootstrap:init` script will create a peerId to be used for the development relay:

```sh
pnpm bootstrap:init
```

### Running Local Relay Servers

The relay servers are used in place of public IPFS nodes to deliver messages between peers during local development.
To start them, run the `bootstrap` script:

```sh
pnpm bootstrap
```

### Building & Watching for Changes

```sh
pnpm build
# or, to watch for changes:
pnpm watch
```

### Linking the module

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

## Creating an Iridium Instance

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
})
```

## Direct Peer Communication

```js
await iridium.send(
  someOtherDID,
  {
    type: 'friend:request',
    displayName,
    profilePicture,
  },
  { encrypt: true },
)

iridium.on('message', ({ from, payload }) => {
  const { type } = payload
  if (type === 'friend:request') {
    /* ... */
  } else if (type === 'signed:message') {
    /* ... */
  } else if (type === 'secret:message') {
    /* ... */
  }
})
```

## Pubsub

```js
// user-b
iridium.followPeer(userAPeerId)
iridium.on('peer:channel_name', ({ from, payload }) => {
  if (from === userAPeerId) {
    // do a thing
  }
})

// user-a
await iridium.broadcast('channel_name', payload)
```

## Managing User Documents

```js
// fetch the root level IPNS document
const userData = await iridium.get('/')
await iridium.set('/profile', {
  name: 'foo bar',
  friends: [
    {
      id: 1,
      name: 'bar baz',
    },
  ],
})
const friend = await iridium.get('/profile/friends/0')
await iridium.set('/profile/friends/0', {
  ...friend,
  profilePicture,
})
```

## Managing Other Documents

```js
// config can include `encrypt`, `sign`, `dag` options
const cid = await iridium.store(document, arrayOfTargetDIDs, config)
const doc = await iridium.load(cid) // throws if signature invalid
```
