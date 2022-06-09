import { DagJWS, DID, JWSSignature } from 'dids';
import { Ed25519Provider } from 'key-did-provider-ed25519';
import KeyDIDResolver from 'key-did-resolver';
import * as json from 'multiformats/codecs/json';
import { CID } from 'multiformats';
import type { IPFS } from 'ipfs-core';
import type { GeneralJWS } from 'dids';
import { sha256 } from 'multiformats/hashes/sha2';
import EventEmitter from 'events';
import set from 'lodash.set';
import get from 'lodash.get';
import pRetry from 'p-retry';
import { ipfsNodeFromSeed } from './ipfs';
import type { PeerId } from 'ipfs-core/ipns';

const resolver = KeyDIDResolver.getResolver();
const textEncoder = new TextEncoder();

export type IridiumStoreConfig = {
  linkKeys?: string[];
  [key: string]: any;
};

export type IridiumMessage = {
  jws?: GeneralJWS;
  jwe?: any;
};

export type IridiumConfig = {
  repo?: string;
  version?: string;
  ipfs?: {
    [key: string]: any;
  };
};

export type IridiumDocument = {
  [key: string]: any;
};

export default class Iridium extends EventEmitter {
  private _ipnsCID?: CID;
  private _ipnsDoc?: { [key: string]: any };
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
    const provider = new Ed25519Provider(seed);
    const did = new DID({
      provider,
      resolver,
    });
    await did.authenticate();
    if (!ipfs) {
      const init = await ipfsNodeFromSeed(seed, config);
      ipfs = init.ipfs;
      peerId = init.peerId;
    }
    if (!peerId) {
      throw new Error('peerId is required');
    }
    const client = new Iridium(ipfs, peerId, did);
    await client.listenForPeerAnnounce();
    await client.listenForDirectMessages();
    await client.announce();
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
   * get the IPFS instance
   */
  get ipfs(): IPFS {
    return this._ipfs;
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
   * Listen for announcements from other peers
   */
  async listenForPeerAnnounce() {
    await this.ipfs.pubsub.subscribe(
      'iridium:announce',
      async (message: any) => {
        const { from, data } = message;
        const { jws } = json.decode(data);
        if (!jws) {
          return this.emit('error', {
            message: 'failed to decode payload',
            from,
            data,
          });
        }

        const verification = await this.did.verifyJWS(jws as DagJWS);

        if (verification && verification.payload) {
          const { did, meta } = verification.payload;

          this.emit('peer', {
            id: from.toString(),
            did,
            meta,
          });
        }
      }
    );
  }

  /**
   * Listen for direct messages from other DIDs
   */
  async listenForDirectMessages() {
    await this.ipfs.pubsub.subscribe(this.id, async (message: any) => {
      const { from, payload } = message;
      const decoded = json.decode(payload) as IridiumMessage;
      if (decoded.jws) {
        if (!this.verifySigned(decoded.jws, from)) {
          return this.emit('error', { from, message: 'invalid signature' });
        }
        return this.emit('message', { from, payload: decoded.jws.payload });
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
    });
  }

  /**
   * Broadcast announce payload to all peers
   * @param payload
   * @param dids
   * @returns
   */
  announce(meta: any = {}) {
    return this.broadcastSigned('iridium:announce', {
      peerId: this.id,
      did: this.did.id,
      meta,
    });
  }

  /**
   * Send a payload to a list of DIDs
   * @param payload
   * @param dids
   * @returns
   */
  send(payload: any, dids: string[] | string, options: any = {}) {
    return Promise.all(
      (Array.isArray(dids) ? dids : [dids]).map(async (did) => {
        await this.ipfs.pubsub.publish(did, payload, options);
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
  async sendSigned(payload: any, dids: string[]) {
    const jws = await this.did.createJWS(payload);
    return this.send({ jws }, Array.isArray(dids) ? dids : [dids]);
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
  async verifySigned(payload: any, signer: string) {
    const verify = await this.did.verifyJWS(payload);
    if (!verify) {
      return false;
    }
    return verify.kid === signer;
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
   * Load and verify a signed payload from the IPFS DAG
   * @param cid
   * @param options
   * @returns
   */
  async loadSigned(cid: CID, options = {}) {
    const jws = (await this.ipfs.dag.get(cid, options)) as unknown as DagJWS;
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
    return this.ipfs.dag.put(jwe, {
      pin: true,
      storeCodec: 'dag-jose',
      hashAlg: 'sha2-256',
      ...options,
    });
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
    dids: string[],
    sendOptions = {},
    jweOptions = {}
  ) {
    const encoded = json.encode(payload);
    const jwe = await this.did.createJWE(encoded, dids, jweOptions);
    return this.send({ jwe }, Array.isArray(dids) ? dids : [dids], sendOptions);
  }

  /**
   * Read a signed and encrypted payload from the IPFS DAG
   * @param cid
   * @param options
   * @returns
   */
  async readEncrypted(cid: CID, options = {}) {
    const doc = await this.ipfs.dag.get(cid, options);
    if (!doc) {
      throw new Error('dag CID not found');
    }
    const jwe = doc.value;
    return this.did.decryptDagJWE(jwe);
  }

  /**
   * Decrypt a signed and encrypted payload, automatically unrolling linked data
   * @param cid
   * @param options
   */
  async loadEncrypted(cid: CID, options = {}, linkOptions = {}) {
    const object = await this.readEncrypted(cid, options);
    if (object._links) {
      await Promise.all(
        Object.keys(object._links).map(async (key) => {
          const cid = object._links[key];
          const child = await this.loadEncrypted(cid, linkOptions);
          object[key] = child;
        })
      );
      delete object._links;
    }
    return object;
  }

  /**
   * Decrypt a signed and encrypted payload
   * @param jwe
   * @param options
   * @returns
   */
  async decrypt(jwe: any, options = {}) {
    const encoded = await this.did.decryptJWE(jwe, options);
    return json.decode(encoded);
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

    let _root;
    for await (const cidStr of this.ipfs.name.resolve(this.peerId)) {
      if (cidStr) {
        const cid = CID.parse(cidStr.substring(6));
        this._ipnsCID = cid;
        try {
          const doc = await this.loadEncrypted(cid, options).catch(
            () => undefined
          );
          if (doc) {
            _root = doc;
          }
        } catch (_) {
          console.error('failed to load encrypted document');
        }
      }
    }
    this._ipnsDoc = _root || {};
    return this._ipnsDoc;
  }

  /**
   * Update the root document on the IPNS record associated with our PeerId
   * @param object
   * @returns
   */
  async set(path = '/', object: any, options = {}) {
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
    this.ipfs.name.publish(cid, {
      resolve: false,
      lifetime: '7d',
    });
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
