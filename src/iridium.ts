import { DecryptJWEOptions, DID } from 'dids';
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
import { multiaddr } from 'ipfs-http-client';
import {
  IridiumSeedConfig,
  IridiumDocument,
  IridiumLoadOptions,
  IridiumLogger,
  IridiumMessage,
  IridiumPayload,
  IridiumPeer,
  IridiumPubsubEvent,
  IridiumRequestOptions,
  IridiumSendOptions,
  IridiumSetOptions,
  IridiumWriteOptions,
  IridiumGetOptions,
  IridiumSyncNodeConfig,
} from './types';
import { createFromPubKey } from '@libp2p/peer-id-factory';

const resolver = KeyDIDResolver.getResolver();
const textEncoder = new TextEncoder();

const DEFAULT_REQUEST_OPTIONS = { timeout: 3000 };
const DEFAULT_RESOLVE_OPTIONS = {
  ...DEFAULT_REQUEST_OPTIONS,
  stream: false,
};
const DEFAULT_DAG_GET_OPTIONS = {
  ...DEFAULT_REQUEST_OPTIONS,
  localResolve: true,
};
const DEFAULT_DAG_PUT_OPTIONS = {
  pin: true,
  storeCodec: 'dag-jose',
  hashAlg: 'sha2-256',
};
const DEFAULT_LOAD_OPTIONS = {
  depth: 2,
  dag: DEFAULT_DAG_GET_OPTIONS,
  decrypt: true,
};
const DEFAULT_GET_OPTIONS = {
  load: DEFAULT_LOAD_OPTIONS,
  resolve: DEFAULT_RESOLVE_OPTIONS,
};
const DEFAULT_IPNS_PUBLISH_OPTIONS = {
  ...DEFAULT_REQUEST_OPTIONS,
  resolve: false,
  key: 'self',
};

export default class Iridium extends Emitter<
  IridiumDocument | IridiumMessage | IridiumPubsubEvent
> {
  private _cid?: CID; // CID of the active root IPNS document
  private _cache?: { [key: string]: any }; // the active root IPNS document
  private _timers: { [key: string]: any } = {};
  private _peers: { [key: string]: IridiumPeer } = {};
  private _dialing: string[] = [];
  private _followedPeers: string[] = [];
  private _syncNodes: IridiumSyncNodeConfig[] = [];

  private readonly _ipfs: IPFS;
  private readonly _peerId: PeerId;
  private readonly _did: DID;

  private readonly logger: IridiumLogger;

  public listenersReady = false;

  constructor({
    ipfs,
    peerId,
    did,
    logger = console,
  }: {
    ipfs: IPFS;
    peerId: PeerId;
    did: DID;
    logger: IridiumLogger;
  }) {
    super();
    this._ipfs = ipfs;
    this._peerId = peerId;
    this._did = did;
    this.logger = logger || console;
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
      logger = console,
    }: IridiumSeedConfig = {}
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
    if (!ipfs) {
      throw new Error('IPFS node not provided');
    }
    if (!peerId) {
      throw new Error('peerId is required');
    }

    const client = new Iridium({ ipfs, peerId, did, logger });
    if (config.followedPeers) {
      logger.info('iridium/init', 'followed peers', config.syncNodes);
      client.followPeers(config.followedPeers);
    }

    if (config.syncNodes) {
      logger.info('iridium/init', 'sync nodes', config.syncNodes);
      client.addSyncNodes(config.syncNodes);
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
    }: IridiumSeedConfig = {}
  ): Promise<Iridium> {
    const seedBytes = await sha256.encode(textEncoder.encode(seed));
    return Iridium.fromSeed(seedBytes, { config, ipfs, peerId });
  }

  /**
   * Create a DID key from a public key
   * @param config
   * @returns
   */
  static publicKeyToDID(publicKey: Uint8Array) {
    return encodeDID(publicKey);
  }

  /**
   * Create a DID from a peerId string
   * @param peerId - peerId to create DID from
   */
  static peerIdToDID(peerId: PeerId | string): string {
    const pid = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId;
    if (!pid || !pid.publicKey) {
      throw new Error('invalid peerId');
    }

    return this.publicKeyToDID(pid.publicKey.slice(4));
  }

  /**
   * Create a PeerId from a DID
   * @param did - DID to create PeerId from
   */
  static DIDToPeerId(did: string): Promise<PeerId> {
    const multibase = did.substring('did:key:'.length);
    const publicKeyBytes = base58btc.decode(multibase);
    const publicKey = keys.supportedKeys.ed25519.unmarshalEd25519PublicKey(
      publicKeyBytes.slice(2)
    );
    return createFromPubKey(publicKey);
  }

  static sha256(data: any): Await<Uint8Array> {
    const encoded = json.encode(data);
    return sha256.encode(encoded);
  }

  static hash(data: any): string {
    return sha256.encode(json.encode(data)).toString();
  }

  async start() {
    await this.initializeListeners();

    // if node, stop on sigint
    if (typeof process !== 'undefined') {
      process?.on('SIGINT', async () => {
        await this.stop();
      });
    }
    if (typeof window !== 'undefined') {
      // if browser, stop on unload
      window.onbeforeunload = async () => {
        await this.stop();
      };
    }

    const addresses = await this.ipfs.swarm.localAddrs();
    this.logger.info('iridium/start', 'started', {
      did: this.id,
      peerId: this.peerId,
      addresses: addresses.map((a) => a.toString()),
    });

    const pins = await this.ipfs.pin.ls();
    const pinned = [];
    for await (const pin of pins) {
      pinned.push(pin.cid);
    }
    this.logger.info('iridium/start', 'pinned', { pinned });

    return this.emit('ready', {});
  }

  /**
   * Stop the Iridium instance
   * @returns
   */
  async stop() {
    const channels = await this.ipfs.pubsub.ls();
    for (const channel of channels) {
      this.logger.info('iridium/stop', 'unsubscribing from channel', {
        channel,
      });
      await this.ipfs.pubsub.unsubscribe(channel);
    }
    Object.values(this._timers).forEach((timer) => {
      clearInterval(timer);
      clearTimeout(timer);
    });
    this._peers = {};
    // await this.ipfs.repo.gc();
    await this.ipfs.stop();
  }

  async attemptPeerConnection(peerId: string) {}

  hasPeer(peerId: string) {
    return this._peers[peerId] !== undefined;
  }

  getPeer(peerId: string) {
    return this._peers[peerId];
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

  get knownPeerIds(): string[] {
    return [
      ...this._followedPeers,
      ...this._syncNodes.map((node) => node.peerId),
    ];
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

  async addSyncNode(node: IridiumSyncNodeConfig) {
    if (this._syncNodes.includes(node)) {
      return;
    }

    this._syncNodes.push(node);
  }

  async connectToSyncNode(node: IridiumSyncNodeConfig) {
    if (!node.multiaddr) {
      this.logger.warn('iridium/connect', 'no multiaddr for sync node', node);
      return;
    }

    if (this._dialing.includes(node.peerId)) {
      this.logger.warn('iridium/connect', 'already dialing', node);
      return;
    }

    this._dialing.push(node.peerId);
    this.logger.warn('iridium/connect', 'dialing sync node', node);
    await this.ipfs.swarm
      .connect(new multiaddr(node.multiaddr))
      .catch(() => {});
    this._dialing = this._dialing.filter((id) => id !== node.peerId);
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

  async removeSyncNode(peerId: string) {
    this._syncNodes = this._syncNodes.filter((node) => node.peerId !== peerId);
  }

  /**
   * Listen for broadcast messages from from the given peer Ids
   * @param peerIds - peerIds to follow
   * @returns
   */
  followPeers(peerIds: string[]) {
    return Promise.all(peerIds.map((peerId) => this.followPeer(peerId)));
  }

  addSyncNodes(nodes: IridiumSyncNodeConfig[]) {
    return Promise.all(
      nodes.map((node) => {
        this.addSyncNode(node);
      })
    );
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
      .filter((p) => this.knownPeerIds.includes(p.peer.toString()))
      .map((p) => p.peer)) {
      this.logger.info(
        'iridium/listeners',
        `found pre-connected peer ${peer.toString()}`
      );
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
          this.logger.info(
            'iridium/listeners',
            `peer disconnected, waiting 10s: ${peerId}`
          );
          let disconnectTime = Date.now();
          setTimeout(async () => {
            if (
              !this._peers[peerId] ||
              this._peers[peerId].seen >= disconnectTime
            )
              return;
            this.logger.info('iridium/listeners', `peer timed out: ${peerId}`);
            await this.ipfs.pubsub.unsubscribe(
              this._peers[peerId].channel,
              undefined
            );
            delete this._peers[peerId];
          }, 30000);
        }
      }
    );

    this.ipfs.libp2p.addEventListener('peer:discovery', async (event: any) => {
      const remotePeerId = event.detail.id.toString();
      if (this.knownPeerIds.includes(remotePeerId)) {
        // manually connect to the peer
        await this.ipfs.swarm.connect(event.detail.id);
      }
      this.emit('peer:discovery', {
        peerId: remotePeerId,
      });
    });

    // attempt to connect to sync nodes on an interval
    // const dialSyncNodes = async () => {
    //   for (const node of this._syncNodes) {
    //     if (this._peers[node.peerId] || this._dialing.includes(node.peerId)) {
    //       return;
    //     }
    //     this.logger.debug(
    //       'iridium/timers',
    //       `connecting to sync node "${node.label}"`
    //     );
    //     await this.connectToSyncNode(node);
    //   }
    // };
    // if (this._timers.syncNodes == undefined) {
    //   this._timers.syncNodes = setInterval(dialSyncNodes, 30000);
    // }
    // await dialSyncNodes();

    this.listenersReady = true;
  }

  async onPeerConnect(event: any) {
    const remotePeerId = event.detail.remotePeer.toString();
    this.logger.debug(
      'iridium/onPeerConnect',
      `remote peer connected: ${remotePeerId}`
    );
    this._dialing = this._dialing.filter((id) => id !== remotePeerId);
    if (this._peers[remotePeerId]) {
      this.logger.debug(
        'iridium/onPeerConnect',
        `remote peer already exists: ${remotePeerId}`
      );
      return;
    }
    if (this.knownPeerIds.includes(remotePeerId)) {
      const isSyncNode = this._syncNodes
        .map((n) => n.peerId)
        .includes(remotePeerId);
      const did = Iridium.peerIdToDID(event.detail.remotePeer);

      if (isSyncNode) {
        this.logger.info(
          'iridium/onPeerConnect',
          `sync node connected: ${did}, broadcasting presence`
        );
        const channel = `sync/${did}`;
        await this.ipfs.pubsub.subscribe(
          channel,
          this.onSyncNodeMessage.bind(this)
        );
        await this.waitForTopicPeer(channel, remotePeerId);
        const payload = { type: 'init', at: Date.now() };
        await this.broadcast(channel, payload, { sign: true });
        this.emit('sync:connect', {
          peerId: remotePeerId,
          did,
        });
      }

      this.logger.info(
        'iridium/onPeerConnect',
        `connected to ${remotePeerId}`,
        { isSyncNode, did }
      );

      if (!this._peerId.privateKey) {
        throw new Error('no local private key available for secure connection');
      }
      const sharedSecret = await getSharedSecret(
        this._peerId.privateKey.slice(4, 36),
        event.detail.remotePeer.publicKey.slice(4, 36)
      );
      const publicKey = await getPublicKey(sharedSecret);
      const channel = `/peer/${base58btc.encode(publicKey)}`;
      this._peers[remotePeerId] = {
        id: remotePeerId,
        did,
        channel,
        meta: {},
        seen: Date.now(),
      };
      this.logger.info('iridium/onPeerConnect', `subscribing to ${channel}`, {
        did,
      });
      await this.ipfs.pubsub.subscribe(channel, this.onPeerMessage.bind(this));
      // await this.waitForTopicPeer(channel, remotePeerId);
      this.emit('peer:connect', {
        peerId: remotePeerId,
        did,
      });
    }
  }

  async onSyncNodeMessage(message: any) {
    const { type, payload } = message;
    this.logger.info('iridium/onSyncNodePeerMessage', `received ${type}`, {
      type,
      payload,
    });
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
    options: IridiumWriteOptions & { link?: boolean } = {}
  ) {
    if (options.encrypt) {
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
          options.sign === true ? undefined : options.sign
        ),
      });
    }
    const encoded = json.encode({ type: 'text', body: payload });

    if (options.link) {
      const cid = await this.store(encoded, options);
      return json.encode({ type: 'dag', body: cid });
    }
    return encoded;
  }

  async onPeerMessage(message: IridiumPubsubEvent) {
    this.logger.info('iridium/onPeerMessage', message);
    if (message.from.toString() === this.peerId) {
      return;
    }
    const { from, data, topic } = message;
    const payload = json.decode(data);
    const decoded = await this.decodePayload<IridiumDocument>(payload);

    this.emit(topic, {
      from,
      payload: decoded,
      type: payload.type,
    });
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
          this.logger.warn('iridium/send', `no channel for ${peerId}`);
        }
      })
    )
      .catch((err) => {
        this.logger.error('iridium/send', `error sending message`, err);
        return false;
      })
      .then(() => {
        return true;
      });
  }

  /**
   * Broadcast a payload on a given channel
   */
  async broadcast(
    channel: string,
    payload: string | IridiumDocument,
    options: IridiumWriteOptions = {}
  ) {
    this.logger.info(
      'iridium/broadcast',
      `broadcasting on ${channel}`,
      payload
    );
    const encoded = await this.encodePayload(payload, options);
    console.info('broadcasting', encoded, channel);
    return this.ipfs.pubsub.publish(channel, encoded);
  }

  /**
   * Subscribe to broadcasted messages on a given channel
   * @param channel
   * @returns
   */
  async subscribe(channel: string, options: IridiumRequestOptions = {}) {
    this.logger.info('iridium/subscribe', `subscribing to ${channel}`);
    return this.ipfs.pubsub.subscribe(channel, this.onPeerMessage.bind(this));
  }

  async unsubscribe(channel: string) {
    this.logger.info('iridium/unsubscribe', `unsubscribing from ${channel}`);
    return this.ipfs.pubsub.unsubscribe(channel);
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

  async store(payload: any, config: IridiumWriteOptions = {}): Promise<CID> {
    this.logger.debug('iridium/store', 'storing payload', payload, config);
    const putOptions = Object.assign({}, DEFAULT_DAG_PUT_OPTIONS, config.dag);
    if (config.sign) {
      const jws = await this.did.createDagJWS(
        payload,
        config.sign === true ? undefined : config.sign
      );
      const cid = await this.ipfs.dag.put(jws, putOptions);
      this.logger.debug('iridium/store', 'stored signed payload', { cid });
      return cid;
    }

    if (config.encrypt === false) {
      const cid = await this.ipfs.dag.put(payload, putOptions);
      this.logger.debug('iridium/store', 'stored payload', { cid });
      return cid;
    }

    const jwe = await this.did.createDagJWE(
      payload,
      config.encrypt?.recipients || [this.id],
      config.encrypt?.options
    );
    const cid = await this.ipfs.dag.put(jwe, putOptions);
    this.logger.debug('iridium/store', 'stored encrypted payload', {
      jwe,
      cid,
      putOptions,
    });
    return cid;
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

    this.logger.info('iridium/load', 'loading payload', {
      cid,
      options,
    });

    const doc = await this.ipfs.dag
      .get(cid, Object.assign({}, DEFAULT_DAG_GET_OPTIONS, options.dag))
      .catch(() => undefined);

    console.info('iridium/load', 'loaded payload', { doc, cid });
    let object = doc?.value || ({} as IridiumDocument);

    if (options.decrypt !== false) {
      console.debug('iridium/load', 'decrypting payload', object);
      object = await this.did.decryptDagJWE(object);
      console.debug('iridium/load', 'decrypted payload', object);
    } else if (options.verifySignature) {
      console.debug('iridium/load', 'verifying payload', object);
      object = await this.verifySigned(object);
      console.debug('iridium/load', 'verified payload', object);
    } else {
      console.debug('iridium/load', 'decoding payload', object);
      object = json.decode(object);
      console.debug('iridium/load', 'decoded payload', object);
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

    let _root: IridiumDocument = {};
    let _rootCID: CID | undefined = undefined;
    const resolve = Object.assign({}, DEFAULT_RESOLVE_OPTIONS, config.resolve);
    this.logger.info('iridium/get', 'loading IPNS document', {
      peerId: this.peerId,
      resolve,
    });
    try {
      const results = this.ipfs.name.resolve(this._peerId, resolve);
      for await (const cid of results) {
        if (cid) {
          this.logger.debug(
            'iridium/get',
            'resolved IPNS document, loading...',
            {
              cid,
            }
          );
          const _cid = CID.parse(cid.substring(6));
          try {
            const doc = await this.load(
              _cid,
              Object.assign({}, DEFAULT_LOAD_OPTIONS, config.load)
            );
            this.logger.debug('iridium/get', 'loaded IPNS document', {
              cid,
              doc,
            });
            if (doc) {
              _root = doc;
              _rootCID = _cid;
            }
          } catch (_) {
            this.logger.error(
              'iridium/get',
              'failed to load document resolved from IPNS',
              _
            );
          }
        }
      }
    } catch (e) {
      this.logger.error('iridium/get', 'failed to resolve IPNS document', e);
    }

    if (path === '/') {
      this._cache = _root;
      this._cid = _rootCID;
      return this._cache;
    }

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
    const prev = this._cache || {};
    const next = path === '/' ? object : { ...prev };
    if (path !== '/') {
      set(next, convertPath(path), object);
    }

    console.info('set', path, next);
    const cid = await this.store(
      next,
      options.store || { encrypt: { recipients: [this.id] } }
    );
    this.logger.info('iridium/set', 'stored document', { cid });
    // clear previous ipns pin
    if (this._cid) {
      this.logger.info('iridium/set', 'removing previous IPNS pin', {
        cid: this._cid,
      });
      await this.ipfs.pin.rm(this._cid);
    }

    this.logger.debug('iridium/set', 'publishing to ipns', options.publish);
    await this.ipfs.name
      .publish(
        cid,
        Object.assign({}, DEFAULT_IPNS_PUBLISH_OPTIONS, options.publish)
      )
      .catch((error) => {
        this.logger.error('iridium/set', 'failed to publish to ipns', error);
      })
      .then((res) => {
        this.logger.debug('iridium/set', 'published to ipns', res);
      });

    this.logger.debug('iridium/set', 'state:changed', { path, value: next });
    this.emit('state:changed', {
      path,
      value: next,
    });
    this._cid = cid;
    this._cache = next;
    return cid;
  }

  waitForTopicPeer(topic: string, peer?: PeerId | string, retryOptions?: any) {
    return pRetry(async () => {
      const peers = await this.ipfs.pubsub.peers(topic);
      if (!peer) {
        if (peers.length) return;
        throw new Error(`No peers found for topic ${topic}`);
      }
      const peerIdString = typeof peer !== 'string' ? peer.toString() : peer;
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
