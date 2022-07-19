import { DID } from 'dids';
import { IridiumLogger } from '../../types';
import { IridiumTestIdentity } from './providers/identity';
import { TestDAGProvider } from './providers/dag';
import { TestPubsubProvider } from './providers/pubsub';
import { TestP2PProvider } from './providers/p2p';

export async function testProviders(did: DID, logger: IridiumLogger = console) {
  const identity = new IridiumTestIdentity(did, logger);
  const p2p = new TestP2PProvider();
  const dag = new TestDAGProvider(logger);
  const pubsub = new TestPubsubProvider(logger);
  return { identity, p2p, dag, pubsub };
}
