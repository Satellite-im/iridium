import { KeyPair } from '@stablelib/ed25519';
import { DID } from 'dids';
import { IridiumEd25519Provider } from '../../../core/identity/did/provider';
import resolver from '../../../core/identity/did/resolver';

/**
 * Create a DID for a given keypair
 * @param keypair - Ed25519 keypair
 * @returns DID
 */
export async function createDID(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Promise<DID> {
  const provider = new IridiumEd25519Provider(privateKey, publicKey);
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
