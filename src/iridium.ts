import { DID } from 'dids';
import * as json from 'multiformats/codecs/json';
import { CID } from 'multiformats/cid';
import set from 'lodash.set';
import get from 'lodash.get';
import Emitter from './core/emitter';
import {
  IridiumDocument,
  IridiumLoadOptions,
  IridiumLogger,
  IridiumMessage,
  IridiumPubsubMessage,
  IridiumSetOptions,
  IridiumWriteOptions,
  IridiumGetOptions,
  IridiumSubscribeOptions,
  IridiumPeerIdentifier,
} from './types';
import { IridiumP2PProvider } from './core/p2p/interface';
import { IridiumDAGProvider } from './core/dag/interface';
import { IridiumPubsubProvider } from './core/pubsub/interface';
import { IridiumIdentityProvider } from './core/identity/interface';
import { verifySigned } from './core/identity/did/utils';
import { resolveDocumentLinks } from './core/dag/utils';
import { encodePayload } from './core/encoding';

const DEFAULT_LOAD_OPTIONS = {
  depth: 2,
  dag: {},
  decrypt: true,
};

export type IridiumConstructorOptions = {
  identity: IridiumIdentityProvider;
  dag: IridiumDAGProvider;
  p2p: IridiumP2PProvider;
  pubsub: IridiumPubsubProvider;
  logger?: IridiumLogger;
};

export default class Iridium extends Emitter<
  IridiumDocument | IridiumMessage | IridiumPubsubMessage
> {
  private _cid?: CID; // CID of the active root IPNS document
  private _cache?: { [key: string]: any }; // the active root IPNS document

  private readonly identity: IridiumIdentityProvider;
  public readonly dag: IridiumDAGProvider;
  public readonly p2p: IridiumP2PProvider;
  public readonly pubsub: IridiumPubsubProvider;
  public readonly logger: IridiumLogger;

  public listenersReady = false;

  constructor({
    identity,
    dag,
    p2p,
    pubsub,
    logger,
  }: IridiumConstructorOptions) {
    super();
    this.identity = identity;
    this.dag = dag;
    this.p2p = p2p;
    this.pubsub = pubsub;
    this.logger = logger || console;
    if (!this.identity.did) {
      console.info(this.identity);
      throw new Error('iridium/constructor: DID not provided');
    }
  }

  async start() {
    // if node, stop on sigint
    if (typeof process !== 'undefined') {
      process?.on('SIGINT', async () => {
        await this.stop();
      });
    }
    if (typeof window !== 'undefined') {
      // if browser, stop on unload
      window.onunload = async () => {
        await this.stop();
      };
    }

    await this.identity.start?.(this);
    await this.p2p.start?.(this);
    await this.pubsub.start?.(this);
    await this.dag.start?.(this);

    const addresses = await this.p2p.listenAddresses();
    this.logger.info('iridium/start', 'started', {
      did: this.id,
      addresses: addresses.map((a: any) => a.toString()),
    });

    return this.emit('ready', {});
  }

  /**
   * Stop the Iridium instance
   * @returns
   */
  async stop() {
    await this.identity.stop?.();
    await this.p2p.stop?.();
    await this.pubsub.stop?.();
    await this.dag.stop?.();
  }

  /**
   * get the DID instance
   */
  get did(): DID {
    return this.identity.did;
  }

  /**
   * get the DID identifier for this instance
   */
  get id(): string {
    return this.did.id;
  }

  /**
   * Store a payload in the DAG
   * @param payload - payload to store
   * @returns
   */
  async store(payload: any, config: IridiumWriteOptions = {}): Promise<CID> {
    this.logger.debug('iridium/store', 'storing payload', payload, config);
    try {
      if (config.sign) {
        const jws = await this.did.createDagJWS(
          payload,
          config.sign === true ? undefined : config.sign
        );
        const cid = await this.dag.put(jws, config.dag);
        this.logger.debug('iridium/store', 'stored signed payload', { cid });
        return cid;
      }

      if (config.encrypt === false) {
        const cid = await this.dag.put(payload, config.dag);
        this.logger.debug('iridium/store', 'stored payload', { cid });
        return cid;
      }

      const jwe = await this.did.createDagJWE(
        payload,
        config.encrypt?.recipients || [this.id],
        config.encrypt?.options
      );
      const cid = await this.dag.put(jwe, config.dag);

      this.logger.debug('iridium/store', 'stored encrypted payload', {
        jwe,
        cid,
        dag: config.dag,
      });
      return cid;
    } catch (error) {
      this.logger.error('iridium/store', 'error storing payload');
      console.error(error);
      throw error;
    }
  }

  /**
   * Load a payload from the DAG
   * @param cid
   * @param options
   * @returns
   */
  async load(
    cid: CID | string,
    options: IridiumLoadOptions = DEFAULT_LOAD_OPTIONS
  ) {
    if (typeof cid === 'string') {
      cid = CID.parse(cid);
    }

    this.logger.info('iridium/load', 'loading payload', {
      cid,
      options,
    });

    const doc = await this.dag
      .get(cid, Object.assign({}, options.dag))
      .catch(() => undefined);

    console.info('iridium/load', 'loaded payload', { doc, cid });
    let object = doc?.value || ({} as IridiumDocument);

    if (options.decrypt !== false) {
      console.debug('iridium/load', 'decrypting payload', object);
      object = await this.did.decryptDagJWE(object);
      console.debug('iridium/load', 'decrypted payload', object);
    } else if (options.verifySignature) {
      console.debug('iridium/load', 'verifying payload', object);
      object = await verifySigned(object, this.did);
      console.debug('iridium/load', 'verified payload', object);
    } else {
      console.debug('iridium/load', 'decoding payload', object);
      object = json.decode(object);
      console.debug('iridium/load', 'decoded payload', object);
    }

    if (object._links && options.depth) {
      object = await resolveDocumentLinks(object, this, {
        depth: (options.depth || 0) - 1,
      });
    }

    return object;
  }

  /**
   * Read from the root document on the IPNS record associated with our PeerId
   * @returns
   */
  async get<T = IridiumDocument>(
    path = '/',
    config: IridiumGetOptions = {}
  ): Promise<T> {
    if (this._cache && this._cid && !config.resolve?.nocache) {
      if (path === '/') return this._cache as T;
      return get(this._cache, convertPath(path));
    }

    const _rootCID = await this.identity.resolve().catch(() => undefined);
    const _root = _rootCID
      ? await this.dag.get(_rootCID, config.load?.dag)
      : undefined;

    if (path === '/') {
      this._cache = _root;
      this._cid = _rootCID;
      return this._cache as T;
    }

    if (this._cache) {
      set(this._cache, convertPath(path), _root);
    }

    return _root as T;
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

    const cid = await this.store(
      next,
      options.store || { encrypt: { recipients: [this.id] } }
    );
    await this.identity.set(cid);
    this.logger.info('iridium/set', 'stored document', { cid });
    this.emit('changed', {
      path,
      value: next,
    });
    this._cid = cid;
    this._cache = next;
    return cid;
  }

  /**
   * Broadcast a payload on a given channel
   */
  async publish(
    channel: string,
    payload: string | IridiumDocument,
    options: IridiumWriteOptions = {}
  ) {
    const encoded = await encodePayload(payload, this.did, options);
    this.logger.info('iridium/publish', `publishing on ${channel}`, {
      payload,
      encoded,
      options,
    });
    return this.pubsub.publish(channel, encoded, options);
  }

  /**
   * Subscribe to a given channel
   */
  async subscribe(channel: string, options?: IridiumSubscribeOptions) {
    if (options?.handler) {
      this.pubsub.on(channel, options.handler);
    }
    if (this.pubsub.subscriptions().includes(channel)) {
      return;
    }
    await this.pubsub.subscribe(channel);
    this.logger.info('iridium/subscribe', `subscribed to ${channel}`);
    if (options?.waitForSubscriber)
      await this.pubsub.waitForSubscriber(channel, {
        timeout: options.waitForSubscriber,
      });
  }

  /**
   * Send a message to the given DID
   * @param did
   */
  async send(did: string | string[], payload: any) {
    return Array.isArray(did)
      ? did.map((id: IridiumPeerIdentifier) => this.p2p.send(id, payload))
      : this.p2p.send(did, payload);
  }
}

function convertPath(prev: string) {
  return (prev.startsWith('/') ? prev.substring(1) : prev).split('/').join('.');
}
