import { generateKeyPairFromSeed, KeyPair } from '@stablelib/ed25519';
import { sha512 } from 'multiformats/hashes/sha2';

export type Keypair = {
  publicKey: Uint8Array[32];
  privateKey: Uint8Array[32];
};

const textEncoder = new TextEncoder();

export async function keypairFromSeed(seed: string): Promise<KeyPair> {
  const hash = await sha512.encode(textEncoder.encode(seed));
  return generateKeyPairFromSeed(hash);
}
