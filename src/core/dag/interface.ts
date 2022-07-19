import { CID } from 'multiformats';
import type Iridium from '../../iridium';

export interface IridiumDAGProvider<
  Payload = any,
  GetOptions = any,
  PutOptions = any
> {
  start(iridium: Iridium): Promise<void>;
  get<T = Payload>(id: CID, options?: GetOptions): Promise<T>;
  put<T = Payload>(data: T, options?: PutOptions): Promise<CID>;
  stop(): Promise<void>;
}
