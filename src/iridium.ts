import { DagJWS, DID } from 'dids';
import { IridiumEd25519Provider, encodeDID } from './did-provider';
import KeyDIDResolver from 'key-did-resolver';
import { peerIdFromString } from '@libp2p/peer-id';
import * as json from 'multiformats/codecs/json';
import { CID } from 'multiformats/cid';
import type { IPFS } from 'ipfs-core';
import type { GeneralJWS } from 'dids';
import { sha256 } from 'multiformats/hashes/sha2';
import set from 'lodash.set';
import get from 'lodash.get';
import pRetry from 'p-retry';
import { ipfsNodeFromKey } from './ipfs';
import type { PeerId } from 'ipfs-core/ipns';
import Emitter from './emitter';
import { keys } from '@libp2p/crypto';

const resolver = KeyDIDResolver.getResolver();
const textEncoder = new TextEncoder();

export type IridiumStoreConfig = {
  linkKeys?: string[];
  [key: string]: any;
};

export type IridiumMessage = {
  from?: string;
  to?: string;
  channel?: string;
  message?: string;
  payload?: any;
};

export type IridiumPayload = {
  jws?: GeneralJWS;
  jwe?: any;
  [key: string]: any;
};

export type IridiumConfig = {
  repo?: string;
  version?: string;
  followedPeers?: string[];
  ipfs?: {
    [key: string]: any;
  };
};

export type IridiumStartConfig = {
  listenForDirect?: boolean;
};

export type IridiumDocument = {
  [key: string]: any;
};

export type IridiumPeer = {
  id: string;
  did: string;
  meta: any;
  seen: number;
};
export default class Iridium extends Emitter<IridiumMessage> {
  private _ipnsCID?: CID;
  private _ipnsDoc?: { [key: string]: any };
  private _timers: { [key: string]: any } = {};
  private _peers: { [key: string]: IridiumPeer } = {};
  private _followedPeers: string[] = [];

  constructor(
    private readonly _ipfs: IPFS,
    private readonly _peerId: string,
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
      ipfs?: IPFS;
      peerId?: string;
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
      peerId?: string;
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
  static didFromPeerId(peerId: string | PeerId): string {
    const pid = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId;
    if (!pid || !pid.publicKey) {
      throw new Error('invalid peerId');
    }

    return this.didFromPublicKey(pid.publicKey.slice(4));
  }

  async start(
    config: IridiumStartConfig = {
      listenForDirect: true,
    }
  ) {
    if (config.listenForDirect) {
      await this.listenForDirectMessages();
    }

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
  stop() {
    Object.values(this._timers).forEach((timer) => {
      clearInterval(timer);
      clearTimeout(timer);
    });
    return this.ipfs.stop();
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
    await this.listenForPeerBroadcast(peerId);
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
    await this.ipfs.pubsub.unsubscribe(`${peerId}:broadcast`);
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
   * Listen for direct messages from other peerIds
   */
  async listenForPeerBroadcast(peerId: string) {
    await this.ipfs.pubsub.subscribe(
      `${peerId}:broadcast`,
      async (message: any) => {
        const { from, payload } = message as IridiumMessage;
        if (!payload) return;
        const decoded = json.decode(
          payload as json.ByteView<IridiumPayload>
        ) as IridiumPayload;
        if (decoded.jws) {
          const verified = await this.verifySigned(decoded.jws);
          if (!verified || verified.kid !== from) {
            return this.emit('peer:error', {
              from,
              message: 'invalid signature',
            });
          }

          const { type = 'message', ...data } = verified.payload as any;

          return this.emit(`peer:${type}`, {
            from,
            payload: data,
          });
        }

        if (decoded.jwe) {
          const decrypted = (await this.decrypt(decoded.jwe)) as any;
          if (!decrypted) {
            return this.emit('peer:error', {
              message: 'failed to decrypt payload',
              from,
            });
          }
          const { type = 'message', ...data } = decrypted;
          return this.emit(`peer:${type}`, { from, payload: data });
        }

        const { type = 'message', ...data } = decoded as any;
        return this.emit(`peer:${type}`, { from, payload: data });
      }
    );
  }

  /**
   * Listen for direct messages from other DIDs
   */
  async listenForDirectMessages() {
    this.ipfs.libp2p.connectionManager.addEventListener(
      'peer:connect',
      async (event: any) => {
        console.info(
          '[iridium] peer connected',
          event.detail.remotePeer.toString()
        );
      }
    );
    this.ipfs.libp2p.addEventListener('peer:discovery', async (event: any) => {
      const remotePeerId = event.detail.id.toString();
      if (this._followedPeers.includes(remotePeerId)) {
        const remotePeerDID = Iridium.didFromPeerId(event.detail.id);
        if (!this._peers[remotePeerId]) {
          this._peers[remotePeerId] = {
            id: remotePeerId,
            did: remotePeerDID,
            meta: {},
            seen: Date.now(),
          };
          // manually connect to the peer
          await this.ipfs.swarm.connect(event.detail.id);
        } else {
          this._peers[remotePeerId].seen = Date.now();
        }
      }
    });
    const result = await this.ipfs.pubsub.subscribe(
      `${this.peerId}:direct`,
      async (message: any) => {
        const { from, payload } = message as IridiumMessage;
        if (!payload || !from) return;
        const decoded = json.decode(
          payload as json.ByteView<IridiumPayload>
        ) as IridiumPayload;
        if (decoded.jws) {
          if (!this.verifySigner(decoded.jws, from)) {
            return this.emit('error', { from, message: 'invalid signature' });
          }
          if (decoded.jws.payload) {
            return this.emit('message', {
              from,
              payload: decoded.jws.payload,
            });
          }
        }

        if (decoded.jwe) {
          const decrypted = await this.decrypt(decoded.jwe);
          if (!decrypted) {
            return this.emit('error', {
              message: 'failed to decrypt payload',
              from,
            });
          }
          return this.emit('message', { from, payload: decrypted });
        }

        return this.emit('message', { from, payload: decoded });
      },
      {
        onError: (err: any) => {
          console.error('pubsub error', err);
        },
      }
    );
  }

  /**
   * Send a payload to a list of DIDs
   * @param payload
   * @param dids
   * @returns
   */
  send(payload: any, peerIds: string[] | string, options: any = {}) {
    return Promise.all(
      (Array.isArray(peerIds) ? peerIds : [peerIds]).map(async (peerId) => {
        return this.ipfs.pubsub.publish(
          `${peerId}:direct`,
          options.encoded ? payload : json.encode(payload)
        );
      })
    );
  }

  /**
   * Broadcast a payload to all peers
   */
  async broadcast(channel: string, payload: any, options: any = {}) {
    return this.ipfs.pubsub.publish(channel, json.encode(payload), options);
  }

  /**
   * Send a signed payload to a list of DIDs
   * @param payload
   * @param dids
   * @returns
   */
  async sendSigned(payload: any, peerIds: string[] | string) {
    const jws = await this.did.createJWS(payload);
    return this.send({ jws }, peerIds);
  }

  /**
   * Send a signed payload to a list of DIDs
   * @param payload
   * @param dids
   * @returns
   */
  async broadcastSigned(channel: string, payload: any, options: any = {}) {
    const jws = await this.did.createJWS(payload);
    return this.broadcast(channel, { jws }, options);
  }

  /**
   * Verify a signed payload
   * @param payload
   * @param signer
   * @returns
   */
  async verifySigned(payload: any) {
    return this.did.verifyJWS(payload);
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
  async store(payload: any) {
    const hash = await this.ipfs.dag.put(json.encode(payload));
    return hash;
  }

  /**
   * Store a signed payload in the IPFS DAG
   * @param payload
   * @returns
   */
  async storeSigned(payload: any) {
    const { jws, linkedBlock } = await this.did.createDagJWS(payload);
    const cid = await this.ipfs.dag.put(jws, {
      storeCodec: 'dag-jose',
      hashAlg: 'sha2-256',
    });
    await this.ipfs.block.put(linkedBlock, jws.link);
    return cid;
  }

  /**
   * Load a payload from the IPFS DAG
   * @param cid
   * @param options
   * @returns
   */
  async load(cid: CID | string, options: any = {}) {
    if (typeof cid === 'string') {
      cid = CID.parse(cid);
    }
    const doc = await this.ipfs.dag
      .get(cid, {
        localResolve: true,
        ...options,
      })
      .catch(() => undefined);
    return doc?.value || ({} as IridiumDocument);
  }

  /**
   * Load and verify a signed payload from the IPFS DAG
   * @param cid
   * @param options
   * @returns
   */
  async loadSigned(cid: CID, options = {}) {
    const jws = (await this.load(cid, options)) as DagJWS;
    if (!(await this.did.verifyJWS(jws))) {
      throw new Error('invalid signature');
    }
    return jws.payload;
  }

  /**
   * Store a signed and encrypted payload in the IPFS DAG
   * @param document
   * @param dids
   * @returns
   */
  async storeEncrypted(
    document: any,
    dids = [this.did.id],
    options: IridiumStoreConfig = {}
  ) {
    const stored = { ...document, _links: {} };
    await Promise.all(
      Object.keys(stored).map(async (key: string) => {
        // if the key is an object, store it as a linked block
        if (
          typeof stored[key] === 'object' &&
          ((stored[key]?.length && stored[key]?.length > 0) ||
            Object.keys(stored[key]).length > 3)
        ) {
          const linkedCID = await this.storeEncrypted(
            stored[key],
            dids,
            options
          );
          stored._links[key] = linkedCID;
          delete stored[key];
        }
      })
    );

    const jwe = await this.did.createDagJWE(stored, dids);
    const cid = await this.ipfs.dag.put(jwe, {
      storeCodec: 'dag-jose',
      hashAlg: 'sha2-256',
    });
    await this.ipfs.pin.add(cid);
    return cid;
  }

  /**
   * Send a signed and encrypted payload to a list of DIDs
   * @param payload
   * @param dids
   * @param options
   * @returns
   */
  async sendEncrypted(
    payload: any,
    peerIds: string[] | string,
    sendOptions = {},
    jweOptions = {}
  ) {
    const encoded = json.encode(payload);
    const jwe = await this.did.createJWE(
      encoded,
      (Array.isArray(peerIds) ? peerIds : [peerIds]).map(Iridium.didFromPeerId),
      jweOptions
    );
    return this.send({ jwe }, peerIds, sendOptions);
  }

  /**
   * Decrypt a signed and encrypted payload, automatically unrolling linked data
   * @param cid
   * @param options
   */
  async loadEncrypted(
    cid: CID,
    options = {},
    linkOptions = {}
  ): Promise<IridiumDocument> {
    const doc = await this.load(cid, options);
    try {
      const object = await this.decrypt(doc, options);
      if (object._links) {
        await Promise.all(
          Object.keys(object._links).map(async (key) => {
            const cid = object._links[key];
            try {
              const child = await this.loadEncrypted(cid, linkOptions);
              object[key] = child;
            } catch (e) {
              console.warn(`failed to load linked data: ${cid}`);
            }
          })
        );
        delete object._links;
      }
      return object;
    } catch (err) {
      console.error(err);
      return doc;
    }
  }

  /**
   * Decrypt a signed and encrypted payload
   * @param jwe
   * @param options
   * @returns
   */
  async decrypt(jwe: any, options = {}) {
    const encoded = await this.did.decryptJWE(jwe, options);
    return json.decode(encoded) as IridiumDocument;
  }

  /**
   * Read from the root document on the IPNS record associated with our PeerId
   * @returns
   */
  async get(path = '/', options: any = {}) {
    if (this._ipnsDoc && this._ipnsCID && !options.force) {
      if (path === '/') return this._ipnsDoc;
      return get(this._ipnsDoc, convertPath(path));
    }

    // load and decrypt JWE from IPNS
    if (path !== '/') {
      options.path = path;
    }

    let _root: IridiumDocument = {};
    for await (const cidStr of this.ipfs.name.resolve(this.peerId, {
      recursive: true,
      timeout: 3000,
      ...options,
    })) {
      if (cidStr) {
        const cid = CID.parse(cidStr.substring(6));
        this._ipnsCID = cid;
        try {
          const doc = await this.loadEncrypted(
            cid,
            {
              timeout: 3000,
              ...options,
            },
            {
              timeout: 3000,
              ...(options.links || {}),
            }
          );
          if (doc) {
            _root = doc;
          }
        } catch (_) {
          console.error('failed to load encrypted document', _);
        }
      }
    }
    this._ipnsDoc = _root;
    return this._ipnsDoc;
  }

  /**
   * Update the root document on the IPNS record associated with our PeerId
   * @param object
   * @returns
   */
  async set(path = '/', object: any, options: any = {}) {
    if (!this._ipnsCID || !this._ipnsDoc) {
      await this.get('/');
    }

    const prev = this._ipnsDoc || {};
    const next = path === '/' ? object : { ...prev };
    if (path !== '/') {
      set(next, convertPath(path), object);
    }
    const cid = await this.storeEncrypted(next, [this.did.id], {
      ...options,
      pin: true,
    });
    await this.ipfs.name
      .publish(`/ipfs/${cid}`, {
        allowOffline: true,
        ttl: options.ttl || 0,
        timeout: options.timeout || 3000,
        resolve: false,
      })
      .catch(() => {});
    this._ipnsCID = cid;
    this._ipnsDoc = next;
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
