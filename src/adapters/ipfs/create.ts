import { IPFS } from 'ipfs-core';
import { PeerId } from '@libp2p/interfaces/peer-id';
import Iridium from 'src/iridium';
import { IridiumConfig, IridiumLogger } from 'src/types';
import { ipfsNodeFromKey } from './config';
import { createDID } from 'src/core/identity/did/create';
import { keypairFromSeed } from 'src/core/crypto/ed25519';
import { unmarshalEd25519PrivateKey } from '@libp2p/crypto/dist/src/keys/ed25519-class';
import { ipfsProviders } from './providers';
import { Config } from 'ipfs-core-types/config';
import { IPFSWithLibP2P } from './types';

export type IPFSSeedConfig = {
  config?: IridiumConfig & { ipfs?: Config };
  ipfs?: IPFS;
  peerId?: PeerId;
  logger?: IridiumLogger;
};

/**
 * Initialize an Iridium instance from seed bytes
 * @param seed - bytes of seed data to initialize with
 * @param config - configuration options
 * @returns
 */
export async function createIridiumIPFS(
  seed: string,
  {
    config = {},
    ipfs = undefined,
    peerId = undefined,
    logger = console,
  }: IPFSSeedConfig = {}
): Promise<Iridium> {
  const keypair = await keypairFromSeed(seed);
  const did = await createDID(keypair);
  if (!ipfs) {
    const key = await unmarshalEd25519PrivateKey(keypair.secretKey);
    const init = await ipfsNodeFromKey(key, config);
    ipfs = init.ipfs;
    peerId = init.peerId;
  }
  // TODO: if user-provided IPFS we should check that it matches the keypair
  if (!ipfs) {
    throw new Error('IPFS node not provided');
  }
  if (!peerId) {
    throw new Error('peerId is required');
  }

  const providers = await ipfsProviders(ipfs as IPFSWithLibP2P, did);
  const client = new Iridium(providers);
  if (config.followedPeers) {
    logger.info('iridium/init', 'followed peers', config.syncNodes);
    client.p2p.(config.followedPeers);
  }

  return client;
}
