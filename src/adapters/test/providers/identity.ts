import { DID } from 'dids';
import { PeerId } from '@libp2p/interfaces/peer-id';
import { CID } from 'multiformats';
import { IridiumIdentityProvider } from '../../../core/identity/interface';
import { IridiumDocument, IridiumLogger } from '../../../types';
import type Iridium from '../../../iridium';
const textEncoder = new TextEncoder();
export class IridiumTestIdentity<DocumentType = IridiumDocument>
  implements IridiumIdentityProvider<DocumentType>
{
  private iridium?: Iridium;
  private _document?: IridiumDocument;
  private _cid?: CID;

  constructor(
    public readonly did: DID,
    private logger: IridiumLogger = console
  ) {}

  async start(iridium: Iridium) {}

  async resolve(): Promise<CID> {
    if (!this._cid) {
      this._cid = CID.asCID(this.did.toString()) || undefined;
      if (!this._cid) {
        throw new Error(
          'ipfs/identity/getRootCID: failed to resolve DID -> IPNS'
        );
      }
    }

    return this._cid;
  }

  async set(cid: CID | string): Promise<void> {
    this._cid = typeof cid === 'string' ? CID.parse(cid) : cid;
  }

  async getDocument<T = DocumentType>(): Promise<T> {
    const cid = await this.resolve();
    if (!cid) {
      throw new Error(
        'ipfs/identity/getDocument: failed to resolve DID -> CID'
      );
    }
    const result = await this.iridium?.dag.get<T>(cid);
    if (!result) {
      throw new Error(
        'ipfs/identity/getDocument: failed to get document from CID'
      );
    }
    return result;
  }
}
