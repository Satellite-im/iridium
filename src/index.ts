export { default as Iridium, default } from './iridium';
export { createIridiumIPFS } from './adapters/ipfs/create';
export { peerIdToDID } from './adapters/ipfs/utils';
export { Emitter } from './core/emitter';
export type { EmitterCallback } from './core/emitter';
export * from './types';
export * as encoding from './core/encoding';
export * as didUtils from './core/identity/did/utils';
export * from './adapters/ipfs/types';
