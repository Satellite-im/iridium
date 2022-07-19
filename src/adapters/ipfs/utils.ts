import { PeerId } from '@libp2p/interfaces/peer-id';
import { peerIdFromString } from '@libp2p/peer-id';
import { publicKeyToDID } from '../../core/identity/did/utils';

/**
 * Create a DID from a peerId string
 * @param peerId - peerId to create DID from
 */
export function peerIdToDID(peerId: PeerId | string): string {
  const pid = typeof peerId === 'string' ? peerIdFromString(peerId) : peerId;
  if (!pid || !pid.publicKey) {
    throw new Error('invalid peerId');
  }

  return publicKeyToDID(pid.publicKey.slice(4));
}
