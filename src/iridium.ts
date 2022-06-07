import { DagJWS, DID } from 'dids';
import { Ed25519Provider } from 'key-did-provider-ed25519';
import KeyDIDResolver from 'key-did-resolver';
import * as json from 'multiformats/codecs/json';
import { CID } from 'multiformats';
import type { IPFS } from 'ipfs-core';
import type { GeneralJWS } from 'dids';
import EventEmitter from 'events';
import { ipfsNodeFromSeed } from './ipfs';

export type IridiumMessage = {
  jws?: GeneralJWS;
  jwe?: any;
};

export type IPFSEvent = {
  from: string;
  [key: string]: any;
};

export type IridiumConfig = {
  repo?: string;
  version?: string;
  swarm?: string[];
  bootstrap?: string[];
};

export default class Iridium extends EventEmitter {
  constructor(private readonly _ipfs: IPFS, private readonly _did: DID) {
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
    }: {
      config?: IridiumConfig;
      ipfs?: IPFS;
    }
  ): Promise<Iridium> {
    const resolver = KeyDIDResolver.getResolver();
    const provider = new Ed25519Provider(seed);
    const did = new DID({
      provider,
      resolver,
    });
    await did.authenticate();
    const node = ipfs || (await ipfsNodeFromSeed(seed, config));
    const client = new Iridium(node, did);
    await client.listenForDirectMessages();
    return client;
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
   * Listen for direct messages from other DIDs
   */
  async listenForDirectMessages() {
    console.info('listening for direct messages on ' + this.id);
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
   * Send an unsigned & unencrypted payload to a list of DIDs
   * @param payload
   * @param dids
   * @returns
   */
  send(payload: any, dids: string[] | string) {
    return Promise.all(
      (Array.isArray(dids) ? dids : [dids]).map(async (did) => {
        console.info('sending to ' + did);
        await this.ipfs.pubsub.publish(did, json.encode(payload));
      })
    );
  }

  /**
   * Send a signed payload to a list of DIDs
   * @param payload
   * @param dids
   * @returns
   */
  sendSigned(payload: any, dids: string[]) {
    const jws = this.did.createJWS(payload);
    return this.send({ jws }, Array.isArray(dids) ? dids : [dids]);
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
    if (!this.did.verifyJWS(jws)) {
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
  async storeEncrypted(document: any, dids = [this.did.id]) {
    const jwe = await this.did.createDagJWE(document, dids);
    return this.ipfs.dag.put(jwe, {
      storeCodec: 'dag-jose',
      hashAlg: 'sha2-256',
    });
  }

  /**
   * Send a signed and encrypted payload to a list of DIDs
   * @param payload
   * @param dids
   * @param options
   * @returns
   */
  async sendEncrypted(payload: any, dids: string[], options = {}) {
    const encoded = json.encode(payload);
    const jwe = await this.did.createJWE(encoded, dids, options);
    return this.send({ jwe }, Array.isArray(dids) ? dids : [dids]);
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
   * Load the IPNS record associated with our PeerId
   * @returns
   */
  async loadIPNS() {
    // load and decrypt JWE from IPNS
    let _root;
    for await (const record of this.ipfs.name.resolve(this.id)) {
      const doc = await this.ipfs.get(record);
      try {
        _root = this.decrypt(doc);
      } catch (_) {
        _root = doc;
      }
    }
    return _root;
  }

  /**
   * Encrypt a document and store it in the IPFS DAG, setting the IPNS record to point to it
   * @param object
   * @returns
   */
  async setIPNS(object: any) {
    const jwe = await this.storeEncrypted(object);
    const cid = await this.ipfs.dag.put(jwe, {
      storeCodec: 'dag-jose',
      hashAlg: 'sha2-256',
    });
    await this.ipfs.name.publish(cid);
    return cid;
  }
}
