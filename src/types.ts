import { CreateJWEOptions, CreateJWSOptions, DecryptJWEOptions } from 'dids';
import * as json from 'multiformats/codecs/json';
import { CID } from 'multiformats/cid';
import type { GeneralJWS } from 'dids';
import type { PeerId } from 'ipfs-core/ipns';
import type { IPFSConfig } from 'ipfs-core/dist/src/components/network';
import { JWE } from 'did-jwt';
import type { IPFS } from 'ipfs-core';
import { RecursivePartial } from '@libp2p/interfaces';
import { Libp2pInit } from 'libp2p';

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

export type IridiumResolveOptions = IridiumRequestOptions & {
  nocache?: boolean;
  recursive?: boolean;
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
  to: string | string[];
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
};

export type IridiumPayloadBody = GeneralJWS | JWE | IridiumDocument | string;
export type IridiumPayloadJWE = {
  type: 'jwe';
  body: JWE;
};
export type IridiumPayloadJWS = {
  type: 'jws';
  body: GeneralJWS;
};
export type IridiumPayloadJSON = {
  type: 'json';
  body: IridiumDocument;
};
export type IridiumPayloadText = {
  type: 'text';
  body: string;
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

export type IridiumMessage = {
  from: PeerId;
  to?: string | PeerId | string[];
};

export type IridiumChannelEvent<B = IridiumPayload> = IridiumPayloadEvent<B> & {
  channel: string;
  data?: IridiumDocument | string;
};

export type IridiumErrorEvent = {
  error: Error;
  message?: string;
};

export type IridiumPubsubEvent<B = IridiumPayload> = IridiumMessage & {
  topic: string;
} & { data: json.ByteView<B> };

export type IridiumPeerMessage<T = IridiumDocument | string> =
  IridiumMessage & {
    topic: string;
    payload: T;
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
  ipfs?: IPFSConfig;
  libp2p?: RecursivePartial<Libp2pInit>;
};

export type IridiumSeedConfig = {
  config?: IridiumConfig;
  ipfs?: IPFS;
  peerId?: PeerId;
  logger?: IridiumLogger;
};

export type IridiumDocument = {
  [key: string]: any;
};

export type IridiumPeer = {
  id: string;
  did: string;
  channel: string;
  meta: any;
  seen: number;
};

export type IridiumPublishOptions = IridiumRequestOptions & {
  resolve?: boolean;
  lifetime?: string;
  ttl?: string;
  key?: string;
  allowOffline?: boolean;
};
