import { generateKeyPairFromSeed, KeyPair } from '@stablelib/ed25519';
import { sha256 } from 'multiformats/hashes/sha2';

export type Keypair = {
  publicKey: Uint8Array[32];
  privateKey: Uint8Array[32];
};

const textEncoder = new TextEncoder();

export async function keypairFromSeed(seed: string): Promise<KeyPair> {
  const hash = await sha256.encode(textEncoder.encode(seed));
  return generateKeyPairFromSeed(hash);
}
