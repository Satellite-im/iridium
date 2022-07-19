import { DID } from 'dids';
import { PeerId } from '@libp2p/interfaces/peer-id';
import { CID } from 'multiformats';
import { IridiumIdentityProvider } from '../../../core/identity/interface';
import { IridiumDocument, IridiumLogger } from '../../../types';
import { DIDToPeerId } from '../../../core/identity/did/utils';
import { IPFS } from 'ipfs-core-types';
import type Iridium from '../../../iridium';
import { DEFAULT_IPNS_PUBLISH_OPTIONS } from './dag';
import { ResolveOptions } from 'ipfs-core-types/root';

const DEFAULT_RESOLVE_OPTIONS: ResolveOptions = {};

export class IridiumIPFSIdentity implements IridiumIdentityProvider {
  private iridium?: Iridium;
  private _peerId?: PeerId;
  private _document?: IridiumDocument;
  private _cid?: CID;

  constructor(
    public readonly did: DID,
    private ipfs: IPFS,
    private logger: IridiumLogger = console
  ) {}

  async start(iridium: Iridium) {
    this._peerId = await DIDToPeerId(this.did);
  }

  get peerId(): string {
    if (!this._peerId) {
      throw new Error('iridium/ipfs/identity not initialized');
    }

    return this._peerId?.toString();
  }

  async resolve(force = false): Promise<CID> {
    if (force || !this._cid) {
      await this._ipnsResolve();
    }

    if (!this._cid) {
      throw new Error(
        'ipfs/identity/getRootCID: failed to resolve DID -> IPNS'
      );
    }

    return this._cid;
  }

  async set(cid: CID | string): Promise<void> {
    this.logger.debug('iridium/set', 'publishing root CID to ipns');
    await this.ipfs.name
      .publish(cid, DEFAULT_IPNS_PUBLISH_OPTIONS)
      .catch((error) => {
        this.logger.error('iridium/set', 'failed to publish to ipns', error);
      })
      .then((res) => {
        this.logger.debug('iridium/set', 'published to ipns', res);
      });

    // clear previous ipns pin
    if (this._cid) {
      this.logger.info('ipfs/setRootCID', 'removing previous IPNS pin', {
        cid: this._cid,
      });
      await this.ipfs.pin.rm(this._cid).catch(() => {});
    }

    this._cid = typeof cid === 'string' ? CID.parse(cid) : cid;
  }

  async getDocument<T>(): Promise<T> {
    if (!this._document) {
      throw new Error(
        'ipfs/identity/getRootDocument: failed to resolve DID -> IPNS'
      );
    }
    return this._document as T;
  }

  async _ipnsResolve() {
    this.logger.info('iridium/get', 'loading IPNS document', {
      peerId: this.peerId,
    });
    try {
      const results = this.ipfs.name.resolve(
        this.peerId,
        DEFAULT_RESOLVE_OPTIONS
      );
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
            const doc = await this.iridium?.load(_cid);
            this.logger.debug('iridium/get', 'loaded IPNS document', {
              cid,
              doc,
            });
            if (doc) {
              this._document = doc;
              this._cid = _cid;
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
      this.logger.error(
        'iridium/ipfs/getRootCID',
        'failed to resolve IPNS document',
        e
      );
    }

    if (!this._cid) {
      throw new Error('ipfs/identity/getRootCID: CID not found');
    }
  }
}
