import { CID } from 'multiformats';
import { GetOptions, PutOptions } from 'ipfs-core-types/dag';
import type { IridiumDAGProvider } from '../../../core/dag/interface';
import { IPFSWithLibP2P } from '../../../adapters/ipfs/types';
import { IridiumLogger } from '../../../types';

export const DEFAULT_RESOLVE_OPTIONS = {};
export const DEFAULT_DAG_GET_OPTIONS = {
  localResolve: true,
};
export const DEFAULT_DAG_PUT_OPTIONS = {
  pin: true,
  storeCodec: 'dag-jose',
  hashAlg: 'sha2-256',
};

export const DEFAULT_IPNS_PUBLISH_OPTIONS = {
  resolve: false,
  key: 'self',
};

// TODO: debug logs
export class IPFSDagProvider<Payload = any>
  implements IridiumDAGProvider<Payload>
{
  constructor(private ipfs: IPFSWithLibP2P, logger: IridiumLogger = console) {}
  async start() {}
  async get<T = Payload>(
    cid: CID,
    options: GetOptions = DEFAULT_DAG_GET_OPTIONS
  ): Promise<T> {
    const result = await this.ipfs.dag.get(cid, options);
    return result.value as T;
  }
  async put<T = Payload>(
    payload: T,
    options: PutOptions = DEFAULT_DAG_PUT_OPTIONS
  ): Promise<CID> {
    const result = await this.ipfs.dag.put(payload, options);
    return result;
  }
  async stop() {
    await this.ipfs.stop();
  }
}
