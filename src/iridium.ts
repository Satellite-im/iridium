import { DagJWS, DecryptJWEOptions, DID } from 'dids';
import { IridiumEd25519Provider, encodeDID } from './did-provider';
import KeyDIDResolver from 'key-did-resolver';
import { peerIdFromString } from '@libp2p/peer-id';
import * as json from 'multiformats/codecs/json';
import { base58btc } from 'multiformats/bases/base58';
import { CID } from 'multiformats/cid';
import type { IPFS } from 'ipfs-core';
import { sha256 } from 'multiformats/hashes/sha2';
import set from 'lodash.set';
import get from 'lodash.get';
import pRetry from 'p-retry';
import { ipfsNodeFromKey } from './ipfs';
import type { PeerId } from 'ipfs-core/ipns';
import Emitter from './emitter';
import { keys } from '@libp2p/crypto';
import { Await } from 'multiformats/hashes/hasher';
import { getPublicKey, getSharedSecret } from '@noble/ed25519';
import { EventHandler } from '@libp2p/interfaces/dist/src/events';
import { Message } from '@libp2p/interfaces/dist/src/pubsub/index';
import {
  IridiumConfig,
  IridiumDagOptions,
  IridiumDocument,
  IridiumGetOptions,
  IridiumLoadOptions,
  IridiumMessage,
  IridiumPayload,
  IridiumPeer,
  IridiumPubsubEvent,
  IridiumRequestOptions,
  IridiumSendOptions,
  IridiumSetOptions,
  IridiumWriteOptions,
} from './types';

const resolver = KeyDIDResolver.getResolver();
const textEncoder = new TextEncoder();

const DEFAULT_REQUEST_OPTIONS = { timeout: 3000 };
const DEFAULT_RESOLVE_OPTIONS = {
  ...DEFAULT_REQUEST_OPTIONS,
  nocache: false,
  recursive: true,
};
const DEFAULT_LOAD_OPTIONS = {
  ...DEFAULT_REQUEST_OPTIONS,
  localResolve: true,
  depth: 0,
};
const DEFAULT_GET_OPTIONS = {
  load: DEFAULT_LOAD_OPTIONS,
  resolve: DEFAULT_RESOLVE_OPTIONS,
};
const DEFAULT_PUBLISH_OPTIONS = {
  ...DEFAULT_REQUEST_OPTIONS,
  resolve: false,
  allowOffline: true,
};

export default class Iridium extends Emitter<
  IridiumDocument | IridiumMessage | IridiumPubsubEvent
> {
  private _cid?: CID; // CID of the active root IPNS document
  private _cache?: { [key: string]: any }; // the active root IPNS document
  private _timers: { [key: string]: any } = {};
  private _peers: { [key: string]: IridiumPeer } = {};
  private _followedPeers: string[] = [];

  public listenersReady = false;

  constructor(
    private readonly _ipfs: IPFS,
    private readonly _peerId: PeerId,
    private readonly _did: DID
  ) {
    super();
  }

  /**
   * Initialize an Iridium instance from seed bytes
   * @param seed - bytes of seed data to initialize with
   * @param config - configuration options
   * @returns
   */
  static async fromSeed(
    seed: Uint8Array,
    {
      config = {},
      ipfs = undefined,
      peerId = undefined,
    }: {
      config?: IridiumConfig;
      ipfs?: any;
      peerId?: PeerId;
    } = {}
  ): Promise<Iridium> {
    const key = await keys.supportedKeys.ed25519.generateKeyPairFromSeed(seed);
    const provider = new IridiumEd25519Provider(
      key.bytes.slice(4),
      key.public.bytes.slice(4)
    );
    const did = new DID({
      provider,
      resolver,
      resolverOptions: {
        cache: true,
      },
    });
    await did.authenticate({
      aud: 'iridium',
    });
    if (!ipfs) {
      const init = await ipfsNodeFromKey(key, config);
      ipfs = init.ipfs;
      peerId = init.peerId;
    }
    if (!peerId) {
      throw new Error('peerId is required');
    }

    const client = new Iridium(ipfs, peerId, did);
    if (config.followedPeers) {
      client.followPeers(config.followedPeers);
    }

    return client;
  }

  /**
   * Initialize an Iridium instance from seed string
   * @param seed - string to initialize with
   * @param config - configuration options
   * @returns
   */
  static async fromSeedString(
    seed: string,
    {
      config = {},
      ipfs = undefined,
      peerId = undefined,
    }: {
      config?: IridiumConfig;
      ipfs?: IPFS;
      peerId?: PeerId;
    } = {}
  ): Promise<Iridium> {
    const seedBytes = await sha256.encode(textEncoder.encode(seed));
    return Iridium.fromSeed(seedBytes, { config, ipfs, peerId });
  }

  /**
   * Create a DID key from a public key
   * @param config
   * @returns
   */
  static didFromPublicKey(publicKey: Uint8Array) {
    return encodeDID(publicKey);
  }

  /**
   * Create a DID from a peerId string
   * @param peerId - peerId to create DID from
   */
  static didFromPeerId(peerId: PeerId | string): string {
    const pid = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId;
    if (!pid || !pid.publicKey) {
      throw new Error('invalid peerId');
    }

    return this.didFromPublicKey(pid.publicKey.slice(4));
  }

  static sha256(data: any): Await<Uint8Array> {
    const encoded = json.encode(data);
    return sha256.encode(encoded);
  }

  static hash(data: any): string {
    return sha256.encode(json.encode(data)).toString();
  }

  async start() {
    this.ipfs.pubsub.setMaxListeners?.(1024);
    await this.initializeListeners();

    // if node, stop on sigint
    if (typeof process !== 'undefined') {
      process?.on('SIGINT', async () => {
        await this.stop();
      });
    }
    if (typeof window !== 'undefined') {
      // if browser, stop on unload
      window?.addEventListener('unload', async () => {
        await this.stop();
      });
    }

    return this.emit('ready', {});
  }

  /**
   * Stop the Iridium instance
   * @returns
   */
  async stop() {
    const channels = await this.ipfs.pubsub.ls();
    for (const channel of channels) {
      await this.ipfs.pubsub.unsubscribe(channel, undefined, {
        timeout: 0,
      });
    }
    Object.values(this._timers).forEach((timer) => {
      clearInterval(timer);
      clearTimeout(timer);
    });
    this._peers = {};
    await this.ipfs.repo.gc();
    await this.ipfs.stop();
  }

  /**
   * get the IPFS instance
   */
  get ipfs(): IPFS & { libp2p: any } {
    return this._ipfs as IPFS & { libp2p: any };
  }

  /**
   * get the DID instance
   */
  get did(): DID {
    return this._did;
  }

  /**
   * get the DID identifier for this instance
   */
  get id(): string {
    return this.did.id;
  }

  /**
   * get the PeerId identifier for this instance
   */
  get peerId(): string {
    return this._peerId.toString();
  }

  /**
   * Listen for broadcast messages from from the given peer Id
   * @param peerId - peerId to follow
   */
  async followPeer(peerId: string) {
    if (this._followedPeers.includes(peerId)) {
      return;
    }
    this._followedPeers.push(peerId);
  }

  /**
   * Stop listening for broadcast messages from from the given peer Id
   * @param peerId - peerId to stop following
   */
  async unfollowPeer(peerId: string) {
    if (!this._followedPeers.includes(peerId)) {
      return;
    }

    this._followedPeers = this._followedPeers.filter((id) => id !== peerId);

    if (this._peers[peerId]) {
      await this.ipfs.pubsub
        .unsubscribe(this._peers[peerId].channel)
        .catch(() => {});
    }
  }

  /**
   * Listen for broadcast messages from from the given peer Ids
   * @param peerIds - peerIds to follow
   * @returns
   */
  followPeers(peerIds: string[]) {
    return Promise.all(peerIds.map((peerId) => this.followPeer(peerId)));
  }

  /**
   * Stop listening for broadcast messages from from the given peer Ids
   * @param peerIds - peerIds to stop following
   */
  unfollowPeers(peerIds: string[] = this._followedPeers) {
    return Promise.all(peerIds.map((peerId) => this.unfollowPeer(peerId)));
  }

  /**
   * Listen for direct messages from other DIDs
   */
  async initializeListeners() {
    if (this.listenersReady) {
      return;
    }

    // find out who's already connected (if applicable)
    const peers = await this.ipfs.swarm.peers();
    for (const peer of peers
      .filter((p) => this._followedPeers.includes(p.peer.toString()))
      .map((p) => p.peer)) {
      console.info(`found pre-connected peer ${peer.toString()}`);
      await this.onPeerConnect({ detail: { remotePeer: peer } });
    }

    this.ipfs.libp2p.connectionManager.addEventListener(
      'peer:connect',
      this.onPeerConnect.bind(this)
    );

    this.ipfs.libp2p.connectionManager.addEventListener(
      'peer:disconnect',
      async (event: any) => {
        const peerId = event.detail.remotePeer.toString();
        if (this._peers[peerId]) {
          console.info(`[iridium] peer disconnected, waiting 10s: ${peerId}`);
          let disconnectTime = Date.now();
          setTimeout(async () => {
            console.info(`[iridium] peer removed after timeout: ${peerId}`);
            if (
              !this._peers[peerId] ||
              this._peers[peerId].seen >= disconnectTime
            )
              return;
            await this.ipfs.pubsub.unsubscribe(
              this._peers[peerId].channel,
              undefined
            );
            delete this._peers[peerId];
          }, 10000);
        }
      }
    );

    this.ipfs.libp2p.addEventListener('peer:discovery', async (event: any) => {
      if (this._followedPeers.includes(event.detail.id.toString())) {
        // manually connect to the peer
        await this.ipfs.swarm.connect(event.detail.id);
      }
    });

    this.listenersReady = true;
  }

  async onPeerConnect(event: any) {
    const remotePeerId = event.detail.remotePeer.toString();
    if (this._peers[remotePeerId]) {
      return;
    }
    if (this._followedPeers.includes(remotePeerId)) {
      console.info('[iridium] peer connected', remotePeerId);
      const remotePeerDID = Iridium.didFromPeerId(event.detail.remotePeer);
      if (!this._peerId.privateKey) {
        throw new Error('no private key available');
      }

      const sharedSecret = await getSharedSecret(
        this._peerId.privateKey.slice(4, 36),
        event.detail.remotePeer.publicKey.slice(4, 36)
      );
      const publicKey = await getPublicKey(sharedSecret);
      const channel = `/iridium/${base58btc.encode(publicKey)}`;
      this._peers[remotePeerId] = {
        id: remotePeerId,
        did: remotePeerDID,
        channel,
        meta: {},
        seen: Date.now(),
      };
      console.info(`[iridium] listening on ${channel} (${remotePeerId})`);
      await this.ipfs.pubsub
        .subscribe(channel, this.onPeerMessage.bind(this), {
          onError: (err) => {
            console.info('pubsub error', err);
          },
        })
        .catch((err) => {
          console.info('pubsub error', err);
        });
    }
  }

  async decodePayload<T = IridiumDocument | string>(
    payload: IridiumPayload
  ): Promise<T> {
    if (payload.type === 'jwe') {
      return this.decrypt<T>(payload.body);
    }

    if (payload.type === 'jws') {
      return this.verifySigned<T>(payload.body);
    }

    return payload.body as T;
  }

  async encodePayload(
    payload: IridiumDocument | string,
    options: IridiumWriteOptions
  ) {
    if (options.dag) {
      const cid = await this.store(payload, options);
      return json.encode({ type: 'dag', body: cid });
    } else if (options.encrypt) {
      return json.encode({
        type: 'jwe',
        body: await this.did.createJWE(
          json.encode(payload),
          options.encrypt.recipients || [this.id],
          options.encrypt.options
        ),
      });
    } else if (options.sign) {
      return json.encode({
        type: 'jws',
        body: await this.did.createJWS(
          payload,
          options.sign === true ? undefined : options.sign.options
        ),
      });
    }
    return json.encode({ type: 'text', body: payload });
  }

  async onPeerMessage(message: IridiumPubsubEvent) {
    if (message.from.toString() === this.peerId) {
      return;
    }
    console.info('[iridium] onPeerMessage', message);
    const { from, data, topic } = message;
    const payload = json.decode(data);
    const decoded = await this.decodePayload(payload);

    this.emit(topic, { from, payload: decoded });
  }

  /**
   * Send a payload to a list of DIDs
   * @param payload
   * @param dids
   * @returns
   */
  async send(payload: string | IridiumDocument, options: IridiumSendOptions) {
    return Promise.all(
      arrayLike(options.to).map(async (peerId) => {
        const channel = this._peers[peerId]?.channel;
        if (channel) {
          await this.broadcast(channel, payload, options);
        } else {
          console.warn(`[iridium] no channel for ${peerId}`);
        }
      })
    )
      .catch((err) => {
        console.error('[iridium] failed to send message', err);
        return false;
      })
      .then(() => {
        return true;
      });
  }

  /**
   * Broadcast a payload to all peers
   */
  async broadcast(
    channel: string,
    payload: string | IridiumDocument,
    options: IridiumWriteOptions = {}
  ) {
    console.info('[iridium] broadcast', { channel, payload });
    const encoded = await this.encodePayload(payload, options);
    return this.ipfs.pubsub.publish(channel, encoded).catch((err) => {
      console.error('[iridium] failed to publish message', err);
    });
  }

  /**
   * Subscribe to broadcasted messages on a given channel
   * @param channel
   * @returns
   */
  async subscribe(channel: string, options: IridiumRequestOptions = {}) {
    console.info('[iridium] subscribe', channel);
    return this.ipfs.pubsub.subscribe(
      `/iridium${channel.startsWith('/') ? channel : `/${channel}`}`,
      this.onPeerMessage.bind(this),
      {
        ...options,
        onError: (error) => {
          this.emit('error', { type: 'error', error });
        },
      }
    );
  }

  async unsubscribe(channel: string, handler?: EventHandler<Message>) {
    console.info('[iridium] unsubscribe', channel);
    return this.ipfs.pubsub.unsubscribe(
      `/iridium${channel.startsWith('/') ? channel : `/${channel}`}`,
      handler
    );
  }

  /**
   * Verify a signed payload
   * @param payload
   * @param signer
   * @returns
   */
  async verifySigned<T>(payload: any) {
    const verify = await this.did.verifyJWS(payload);
    if (!verify) {
      throw new Error('invalid signature');
    }
    return verify.payload as T;
  }

  /**
   * Verify a signed payload
   * @param payload
   * @param signer
   * @returns
   */
  async verifySigner(payload: any, signer: string) {
    const verify = await this.did.verifyJWS(payload);
    if (!verify) {
      return false;
    }
    return verify.kid === signer;
  }

  /**
   * Store a plaintext payload in the IPFS DAG
   * @param payload - payload to store
   * @returns
   */
  async store(payload: any, config: IridiumWriteOptions = {}) {
    let encoded;
    let defaultDagOptions: IridiumDagOptions = {};
    if (config.encrypt) {
      encoded = await this.did.createJWE(
        payload,
        config.encrypt.recipients || [this.id],
        config.encrypt.options
      );
      defaultDagOptions.storeCodec = 'dag-jose';
      defaultDagOptions.hashAlg = 'sha2-256';
    } else if (config.sign) {
      encoded = await this.did.createJWS(
        payload,
        config.sign === true ? undefined : config.sign.options
      );
    } else {
      encoded = json.encode(payload);
    }

    const hash = await this.ipfs.dag.put(encoded, config.dag);
    return hash;
  }

  /**
   * Load a payload from the IPFS DAG
   * @param cid
   * @param options
   * @returns
   */
  async load(cid: CID | string, options: IridiumLoadOptions = {}) {
    if (typeof cid === 'string') {
      cid = CID.parse(cid);
    }

    const doc = await this.ipfs.dag
      .get(cid, Object.assign({}, DEFAULT_LOAD_OPTIONS, options))
      .catch(() => undefined);

    let object = doc?.value || ({} as IridiumDocument);
    if (options.decrypt) {
      object = await this.decrypt(object, options.decryptOptions);
    } else if (options.verifySignature) {
      const jws = (await this.load(cid, options)) as DagJWS;
      if (!(await this.did.verifyJWS(jws))) {
        throw new Error('invalid signature');
      }
      object = jws.payload;
    }

    if (object._links && options.depth) {
      object = await this.resolveDocumentLinks(object, {
        depth: (options.depth || 0) - 1,
      });
    }

    return object;
  }

  /**
   * Resolve links in a document and load the linked fragments
   * @param doc
   * @param options
   * @returns IridiumDocument
   */
  async resolveDocumentLinks(
    doc: IridiumDocument,
    options: { depth?: number }
  ) {
    if (options.depth && doc._links) {
      let depth = options.depth - 1;
      await Promise.all(
        Object.keys(doc._links).map(async (key) => {
          const cid = doc._links[key];
          try {
            const child = await this.load(cid, { depth, ...options });
            doc[key] = child;
          } catch (e) {
            console.warn(`failed to load linked data: ${cid}`);
          }
        })
      );
      delete doc._links;
    }
    return doc;
  }

  /**
   * Decrypt a signed and encrypted payload
   * @param jwe
   * @param options
   * @returns
   */
  async decrypt<T = IridiumDocument>(jwe: any, options?: DecryptJWEOptions) {
    const encoded = await this.did.decryptJWE(jwe, options);
    return json.decode<T>(encoded);
  }

  /**
   * Read from the root document on the IPNS record associated with our PeerId
   * @returns
   */
  async get(path = '/', config: IridiumGetOptions = DEFAULT_GET_OPTIONS) {
    if (this._cache && this._cid && !config.resolve?.nocache) {
      if (path === '/') return this._cache;
      return get(this._cache, convertPath(path));
    }

    // load and decrypt JWE from IPNS

    let _root: IridiumDocument = {};
    try {
      for await (const cidStr of this.ipfs.name.resolve(
        this.peerId,
        Object.assign({}, DEFAULT_RESOLVE_OPTIONS, config.resolve)
      )) {
        if (cidStr) {
          const cid = CID.parse(cidStr.substring(6));
          this._cid = cid;
          try {
            const doc = await this.load(
              cid,
              Object.assign({}, DEFAULT_LOAD_OPTIONS, config.load)
            );
            if (doc) {
              _root = doc;
            }
          } catch (_) {
            console.error('failed to load encrypted document', _);
          }
        }
      }
    } catch (error) {
      console.warn(`[iridium] failed to resolve IPNS record: ${error}`);
    }

    if (path === '/') {
      this._cache = _root;
      return this._cache;
    }

    // update the root doc in memory
    if (this._cache) {
      set(this._cache, convertPath(path), _root);
    }

    return _root;
  }

  /**
   * Update the root document on the IPNS record associated with our PeerId
   * @param object
   * @returns
   */
  async set(path = '/', object: any, options: IridiumSetOptions = {}) {
    if (!this._cid || !this._cache) {
      await this.get('/');
    }

    const prev = this._cache || {};
    const next = path === '/' ? object : { ...prev };
    if (path !== '/') {
      set(next, convertPath(path), object);
    }

    const cid = await this.store(next, options.store);
    await this.ipfs.name
      .publish(`/ipfs/${cid}`, options.publish)
      .catch(() => {});
    this._cid = cid;
    this._cache = next;
    return cid;
  }

  waitForTopicPeer(
    topic: string,
    peer: PeerId | string,
    retryOptions: any = {}
  ) {
    const peerIdString = typeof peer !== 'string' ? peer.toString() : peer;
    return pRetry(async () => {
      const peers = await this.ipfs.pubsub.peers(topic);
      const peerIds = peers.map((p) => p.toString());

      if (!peerIds.includes(peerIdString)) {
        throw new Error(
          `Could not find peer ${peerIdString} in topic ${topic}`
        );
      }
    }, retryOptions);
  }
}

function convertPath(prev: string) {
  return (prev.startsWith('/') ? prev.substring(1) : prev).split('/').join('.');
}

function arrayLike<T = string>(thing: T | T[]): T[] {
  return Array.isArray(thing) ? thing : [thing];
}
