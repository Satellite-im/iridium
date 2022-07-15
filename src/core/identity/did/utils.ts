import { keys } from '@libp2p/crypto';
import { PeerId } from '@libp2p/interfaces/peer-id';
import { createFromPubKey } from '@libp2p/peer-id-factory';
import { DID } from 'dids';
import { base58btc } from 'multiformats/bases/base58';
import { encodeDID } from './provider';

/**
 * Create a PeerId from a DID
 * @param did - DID to create PeerId from
 */
export function DIDToPeerId(did: string | DID): Promise<PeerId> {
  const multibase = did.toString().substring('did:key:'.length);
  const publicKeyBytes = base58btc.decode(multibase);
  const publicKey = keys.supportedKeys.ed25519.unmarshalEd25519PublicKey(
    publicKeyBytes.slice(2)
  );
  return createFromPubKey(publicKey);
}

/**
 * Create a DID key from a public key
 * @param config
 * @returns
 */
export function publicKeyToDID(publicKey: Uint8Array) {
  return encodeDID(publicKey);
}

/**
 * Verify a signed payload
 * @param payload
 * @param signer
 * @returns
 */
export async function verifySigned<T>(payload: any, did: DID) {
  const verify = await did.verifyJWS(payload);
  if (!verify) {
    throw new Error('invalid signature');
  }
  return verify.payload as T;
}

/**
 * Verify a signed payload
 * @param payload
 * @param signer
 * @returns
 */
export async function verifySigner(payload: any, signer: string, did: DID) {
  const verify = await did.verifyJWS(payload);
  if (!verify) {
    return false;
  }
  return verify.kid === signer;
}
