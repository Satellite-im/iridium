import { IridiumDocument, IridiumLogger } from '../../../types';
import type { IridiumDAGProvider } from '../../../core/dag/interface';
import { CID } from 'multiformats';
import { toCID } from '../../../core/encoding';

// TODO: logging

export class TestDAGProvider<DocumentType = IridiumDocument>
  implements IridiumDAGProvider<DocumentType>
{
  cache: { [key: string]: any } = {};
  constructor(logger: IridiumLogger = console) {
    this.cache = {};
  }

  async start() {}
  async stop() {}

  async put<T = DocumentType>(doc: T) {
    const cid = await toCID(doc);
    this.cache[cid.toString()] = doc;
    return cid;
  }

  async get<T = DocumentType>(cid: CID) {
    return this.cache[cid.toString()] as T;
  }
}
