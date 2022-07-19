import type { IPFS } from 'ipfs-core-types';
import type { Libp2p } from 'libp2p';
import type { IPFSConfig } from 'ipfs-core/components/network';
import { IridiumConfig, IridiumPeer } from '../../types';
import { LibP2PConfig } from '../../adapters/ipfs/libp2p/types';
import { PeerId } from '@libp2p/interfaces/peer-id';
import { ProtocolStream } from '@libp2p/interfaces/connection';

export type IPFSWithLibP2P = IPFS & { libp2p: Libp2p };

export type IridiumIPFSConfig = IridiumConfig & {
  ipfs?: IPFSConfig;
  libp2p?: LibP2PConfig;
};

export type IridiumIPFSPeer = IridiumPeer & {
  peerId: PeerId;
  protocol?: ProtocolStream;
};
