import { CID } from 'multiformats';
import type Iridium from 'src/iridium';

export interface IridiumDAGProvider<
  Payload = any,
  GetOptions = any,
  PutOptions = any
> {
  start(iridium: Iridium): Promise<void>;
  get(id: CID, options: GetOptions): Promise<Payload>;
  put(data: Payload, options: PutOptions): Promise<CID>;
  stop(): Promise<void>;
}
