import { IPFS } from 'ipfs-core';
import { PeerId } from '@libp2p/interfaces/peer-id';
import Iridium from '../../iridium';
import { IridiumConfig, IridiumLogger } from '../../types';
import { ipfsNodeFromKey } from './config';
import { createDID } from '../../core/identity/did/create';
import { keypairFromSeed } from '../../core/crypto/ed25519';
import { keys } from '@libp2p/crypto';
import { ipfsProviders } from './providers';
import { Config } from 'ipfs-core-types/config';
import { IPFSWithLibP2P } from './types';
import { sha256 } from 'multiformats/hashes/sha2';

export type IPFSSeedConfig = {
  config?: IridiumConfig & { ipfs?: Config };
  ipfs?: IPFS;
  peerId?: PeerId;
  logger?: IridiumLogger;
};

export type IridiumIPFS = Iridium & { ipfs: IPFS };

const textEncoder = new TextEncoder();

/**
 * Initialize an Iridium instance from seed bytes
 * @param seed - bytes of seed data to initialize with
 * @param config - configuration options
 * @returns
 */
export async function createIridiumIPFS(
  seed: string,
  { config = {}, logger = console }: IPFSSeedConfig = {}
): Promise<IridiumIPFS> {
  const seedBytes = await sha256.encode(textEncoder.encode(seed));
  const key = await keys.supportedKeys.ed25519.generateKeyPairFromSeed(
    seedBytes
  );
  const did = await createDID(key.bytes.slice(4), key.public.bytes.slice(4));
  const { ipfs, peerId } = await ipfsNodeFromKey(key, config);
  // TODO: if user-provided IPFS we should check that it matches the keypair
  if (!ipfs) {
    throw new Error('IPFS node not provided');
  }
  if (!peerId) {
    throw new Error('peerId is required');
  }

  const providers = await ipfsProviders(
    ipfs as IPFSWithLibP2P,
    peerId,
    did,
    logger
  );
  const client: IridiumIPFS = Object.assign(new Iridium(providers), { ipfs });
  if (config.followedPeers) {
    logger.info('iridium/init', 'followed peers', config.syncNodes);
    config.followedPeers.forEach((peerId) => client.p2p.connect(peerId));
  }

  client.ipfs = ipfs;

  return client;
}
