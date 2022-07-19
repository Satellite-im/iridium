import Iridium from '../../iridium';
import type { IridiumConfig, IridiumLogger } from '../../types';
import { createDID } from '../../core/identity/did/create';
import { keypairFromSeed } from '../../core/crypto/ed25519';
import { IridiumP2PProvider } from '../../core/p2p/interface';
import { testProviders } from './providers';

export type TestSeedConfig = IridiumConfig & {
  logger?: IridiumLogger;
  config?: IridiumConfig;
  providers?: {
    p2p: IridiumP2PProvider;
  };
};

/**
 * Initialize an Iridium instance from seed bytes
 * @param seed - bytes of seed data to initialize with
 * @param config - configuration options
 * @returns
 */
export async function createTestIridium(
  seed: string,
  { logger = console, ...config }: TestSeedConfig = {}
): Promise<Iridium> {
  const keypair = await keypairFromSeed(seed);
  const did = await createDID(keypair.secretKey, keypair.publicKey);
  const providers = await testProviders(did);
  const client = new Iridium(providers);
  if (config.followedPeers) {
    logger.info('iridium/init', 'followed peers', config.syncNodes);
    config.followedPeers.forEach((peerId) => client.p2p.connect(peerId));
  }

  return client;
}
