# Iridium Protocol

Iridium is a loosely defined protocol for peer to peer communication and storage for user application data (profile, friends, messages, files, etc...) leveraging IPFS and dag-jose.

## Create an Iridium Instance

```js
const iridum = Iridium.fromSeed(
  uint8SeedBytes,
  // IridiumConfig options
  { config: { bootstrap: bootstrapUrls, swarm: swarmUrls } }
);
```

## Send a Message

```js
// messages are automatically signed and encrypted with a shared key
await iridium.send(someOtherDID, 'friend:request', {
  displayName,
  profilePicture,
});
```

## Read Data

```js
// fetch the root level IPNS document
const profileData = await iridium.loadIPNS();

// fetch a specific value from the root document using a string path
const doc = await iridium.loadEncrypted(someCID);

// read a value from a document
const numFriends = await iridium.loadEncrypted(profileCID, {
  path: 'friends/count',
});
const cid = await iridum.loadEncrypted(profileCID, { path: 'profile/0' });
```
