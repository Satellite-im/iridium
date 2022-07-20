import {
  CreateJWEOptions,
  CreateJWSOptions,
  DecryptJWEOptions,
  DID,
} from 'dids';
import * as json from 'multiformats/codecs/json';
import { CID } from 'multiformats/cid';
import type { GeneralJWS } from 'dids';
import { JWE } from 'did-jwt';
import { Multiaddr } from '@multiformats/multiaddr';
import { IridiumDecodedPayload } from './core/encoding';

export type IridiumLogger = {
  log: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
};

export type IridiumRequestOptions = {
  timeout?: number;
  signal?: AbortSignal;
};

export type IridiumSubscribeOptions = IridiumRequestOptions & {
  waitForSubscriber?: number;
  handler?: (message: IridiumPubsubMessage) => Promise<void> | void;
};

export type IridiumResolveOptions = IridiumRequestOptions & {
  nocache?: boolean;
  recursive?: boolean;
  stream?: boolean;
};

export type IridiumReadOptions = {
  decrypt?: boolean;
  decryptOptions?: DecryptJWEOptions;
  verifySignature?: boolean;
};

export type IridiumDagGetOptions = IridiumResolveOptions & {
  path?: string;
  localResolve?: boolean;
};

export type IridiumLoadOptions = IridiumReadOptions & {
  depth?: number;
  dag?: IridiumDagGetOptions;
};

export type IridiumGetOptions = {
  load?: IridiumLoadOptions;
  resolve?: IridiumResolveOptions;
};

export type IridiumWriteOptions = IridiumRequestOptions & {
  encrypt?: IridiumEncryptOptions;
  sign?: boolean | CreateJWSOptions;
  dag?: IridiumDagPutOptions;
};

export type IridiumSendOptions = IridiumWriteOptions & {
  sign?: boolean;
  encode?: boolean;
};

export type IridiumSetOptions = {
  store?: IridiumWriteOptions;
  publish?: IridiumPublishOptions;
};

export type IridiumDagPutOptions = IridiumRequestOptions & {
  storeCodec?: string;
  inputCodec?: string;
  hashAlg?: string;
  cid?: CID | string;
  pin?: boolean;
};

export type IridiumEncryptOptions = {
  recipients?: string[];
  options?: CreateJWEOptions;
  dag?: boolean;
};

export type IridiumPayloadBody = GeneralJWS | JWE | IridiumDocument | string;
export type IridiumPayloadJWE = {
  encoding: 'jwe';
  body: JWE;
};
export type IridiumPayloadJWS = {
  encoding: 'jws';
  body: GeneralJWS;
};
export type IridiumPayloadJSON = {
  encoding: 'json';
  body: IridiumDocument;
};
export type IridiumPayloadText = {
  encoding: 'raw';
  body: string | Uint8Array;
};
export type IridiumPayload =
  | IridiumPayloadJWE
  | IridiumPayloadJWS
  | IridiumPayloadJSON
  | IridiumPayloadText;

export type IridiumPayloadBytes = json.ByteView<IridiumPayload>;

export type IridiumPayloadEvent<B = IridiumPayload> = {
  payload: B;
};

export type IridiumMessage<P = IridiumDocument> = {
  from: IridiumPeerIdentifier;
  to?: IridiumPeerIdentifier | IridiumPeerIdentifier[];
  payload: IridiumDecodedPayload<P>;
};

export type IridiumPubsubMessage<P = IridiumDocument> = IridiumMessage<P> & {
  topic: string;
};

export type IridiumSyncNodeConfig = {
  label?: string;
  peerId: string;
  multiaddr?: string;
};

export type IridiumConfig = {
  repo?: string;
  version?: string;
  followedPeers?: string[];
  syncNodes?: IridiumSyncNodeConfig[];
};

export type IridiumDocument = {
  [key: string]: any;
};

export type IridiumPeer = {
  did: string;
  type: 'peer' | 'node';
  channel?: string;
  addr?: Multiaddr;
  meta?: any;
  seen?: number;
};

export type IridiumPublishOptions = IridiumRequestOptions & {
  resolve?: boolean;
  lifetime?: string;
  ttl?: string;
  key?: string;
  allowOffline?: boolean;
};

export type IridiumPeerIdentifier = string | DID;
