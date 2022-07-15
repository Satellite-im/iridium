import { DID } from 'dids';
import { IridiumLogger, IridiumPeer, IridiumSyncNodeConfig } from 'src/types';
import { IridiumIPFSIdentity } from './providers/identity';
import { IPFSWithLibP2P } from './types';
import { IPFSDagProvider } from './providers/dag';
import { IPFSPubsubProvider } from './providers/pubsub';
import { IPFSP2PProvider } from './providers/p2p';

export async function ipfsProviders(
  ipfs: IPFSWithLibP2P,
  did: DID,
  logger: IridiumLogger = console
) {
  const identity = new IridiumIPFSIdentity(did, ipfs, logger);
  const p2p = new IPFSP2PProvider(ipfs, logger);
  const dag = new IPFSDagProvider(ipfs, logger);
  const pubsub = new IPFSPubsubProvider(ipfs, logger);
  return { identity, p2p, dag, pubsub };
}
