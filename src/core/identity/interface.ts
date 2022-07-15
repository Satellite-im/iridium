import { DID } from 'dids';
import { CID } from 'multiformats';
import type Iridium from 'src/iridium';

export type IridiumIdentityProvider = {
  did: DID;
  start?(iridium: Iridium): Promise<void>;
  getRootCID(): Promise<CID>;
  setRootCID(cid: CID | string): Promise<void>;
  getRootDocument<T>(): Promise<T>;
  stop?(): Promise<void>;
};
