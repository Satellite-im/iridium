import { DID } from 'dids';
import { CID } from 'multiformats';
import type Iridium from '../../iridium';
import { IridiumDocument } from '../../types';

export type IridiumIdentityProvider<DocumentType = IridiumDocument> = {
  id: string;
  did: DID;
  start?(iridium: Iridium): Promise<void>;
  resolve(): Promise<CID>;
  set(cid: CID | string): Promise<void>;
  getDocument<T = IridiumDocument>(): Promise<T>;
  stop?(): Promise<void>;
};
