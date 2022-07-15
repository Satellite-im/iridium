import type { DID } from 'dids';
import type { Multiaddr } from '@multiformats/multiaddr';
import type Iridium from 'src/iridium';
import {
  IridiumPeer,
  IridiumPeerIdentifier,
  IridiumSendOptions,
} from 'src/types';

export interface IridiumP2PProvider<
  Address = Multiaddr,
  Payload = any,
  ID = IridiumPeerIdentifier
> {
  start?(iridium: Iridium): Promise<void>;
  listenAddresses(): Promise<Address[]>;
  connect(to: Address | ID): Promise<void>;
  disconnect(from: Address | ID): Promise<void>;
  send(to: IridiumPeerIdentifier, payload: Payload): Promise<void>;
  addPeer(peer: IridiumPeer): Promise<void>;
  hasPeer(did: string): boolean;
  getPeer(did: ID): IridiumPeer;
  stop?(): Promise<void>;
}
