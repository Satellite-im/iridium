import { KeyPair } from '@stablelib/ed25519';
import { DID } from 'dids';
import { IridiumEd25519Provider } from 'src/core/identity/did/provider';
import resolver from 'src/core/identity/did/resolver';

/**
 * Create a DID for a given keypair
 * @param keypair - Ed25519 keypair
 * @returns DID
 */
export async function createDID(keypair: KeyPair): Promise<DID> {
  const provider = new IridiumEd25519Provider(
    keypair.publicKey,
    keypair.secretKey
  );
  const did = new DID({
    provider,
    resolver,
    resolverOptions: {
      cache: true,
    },
  });
  await did.authenticate({
    aud: 'iridium',
  });
  return did;
}
