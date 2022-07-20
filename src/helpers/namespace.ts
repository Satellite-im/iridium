import { hash } from '../core/encoding';
import Emitter from '../core/emitter';
import Iridium from '../iridium';
import {
  IridiumDocument,
  IridiumGetOptions,
  IridiumMessage,
  IridiumPubsubMessage,
  IridiumSetOptions,
} from '../types';

export type IridiumNamespaceConfig = {
  name: string;
};

export type IridiumNamespaceRole = 'admin' | 'write' | 'read';

export class IridiumNamespace<P = IridiumDocument> extends Emitter {
  private _hash?: string;
  private _lock?: Promise<void>;
  private _lockCancel?: (reason?: any) => void;
  private _debounce?: any;
  constructor(
    private readonly _id: string,
    private readonly _instance: Iridium,
    private _members: string[] = [_instance.id],
    private _owner: string = _instance.id
  ) {
    super();
  }

  get id() {
    return this._id;
  }

  get hash() {
    return this._hash;
  }

  get root() {
    return this._instance;
  }

  async init() {
    this._hash = await hash({ id: this._id, owner: this._owner });
    if (!this.hash) {
      throw new Error('failed to generate hash');
    }
    await this._instance.subscribe(this.hash, {
      handler: this.onMessage.bind(this),
    });
  }

  async send(payload: P & { type: string }) {
    if (!this.hash) {
      throw new Error('invalid hash');
    }
    await this._instance.publish(this.hash, payload);
    await this.emit(`send/${payload.type}`, payload);
  }

  async onMessage(message: IridiumPubsubMessage) {
    this.emit(message.payload.body.type || 'message', message.payload);
  }

  async set<T = IridiumDocument>(
    path: string,
    value: T,
    config?: IridiumSetOptions
  ) {
    const cid = await this._instance.set(`/${this.id}${path}`, value, config);
    await this.emit(`set${path}`, { value, cid });
    return cid;
  }

  async get<T = IridiumDocument>(
    path: string = '',
    config?: IridiumGetOptions
  ) {
    const data = await this._instance.get<T>(`/${this.id}${path}`, config);
    await this.emit(`get${path}`, { data });
    return data;
  }

  get members() {
    return this._members;
  }

  // TODO: roles & permissions
  async addMember(did: string) {
    if (this._members.includes(did)) {
      throw new Error(`member ${did} already exists`);
    }

    this._members.push(did);
    // tell the peer they were granted access to this namespace
    await this._instance.p2p.send(did, {
      type: 'namespace/granted',
      namespace: this._id,
      owner: this._owner,
    });
    this.scheduleHeaderUpdate();
    this.emit('member/add', { did });
  }

  removeMember(did: string) {
    this._members = this._members.filter((m) => m !== did);
    this.scheduleHeaderUpdate();
    this.emit('member/remove', { did });
  }

  async lock(fn: () => Promise<void>) {
    if (this._lock) {
      await this._lock;
    }
    // make the lock cancelable
    this._lock = new Promise((resolve, reject) => {
      this._lockCancel = reject;
      return fn().then(resolve).catch(reject);
    });
    return this._lock;
  }

  scheduleHeaderUpdate(debounce = 1000) {
    clearTimeout(this._debounce);
    this._debounce = setTimeout(async () => this.updateHeaders(), debounce);
  }

  async updateHeaders() {
    await this.lock(async () => {
      // TODO: update JWE headers
      // unroll document links, decrypt key, append header for new members, delete headers for removed members, unpin old & pin new
    });
  }
}
