import type Iridium from '../../../iridium';
import { IridiumPeer, IridiumPeerIdentifier } from '../../../types';
import { IridiumIPFSPeer } from '../../ipfs/types';

export class TestP2PProvider<
  Address = string,
  Payload = any,
  ID = IridiumPeerIdentifier
> {
  start?(iridium: Iridium): Promise<void>;
  async listenAddresses() {
    return [];
  }
  async connect(to: Address | ID) {}
  async disconnect(from: Address | ID) {}
  async send(to: IridiumPeerIdentifier, payload: Payload) {}
  async addPeer(peer: IridiumIPFSPeer): Promise<void> {}
  hasPeer(did: string): boolean {
    return false;
  }
  getPeer(did: ID): IridiumPeer {
    throw new Error('getPeer not implemented');
  }
  async stop?(): Promise<void> {}
}
