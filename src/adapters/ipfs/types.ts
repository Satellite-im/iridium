import type { Libp2p } from 'libp2p';
import type { IPFSConfig } from 'ipfs-core/components/network';
import { ProtocolStream } from '@libp2p/interfaces/connection';
import { PeerId } from '@libp2p/interfaces/peer-id';
import type { IPFS, Options } from 'ipfs-core';
import { LibP2PConfig } from '../../adapters/ipfs/libp2p/types';
import { IridiumConfig, IridiumPeer, IridiumLogger } from '../../types';
import type Iridium from '../../iridium';

export type IPFSSeedConfig = {
  config?: IridiumConfig & { ipfs?: Options };
  ipfs?: IPFS;
  peerId?: PeerId;
  logger?: IridiumLogger;
};

export type IridiumIPFS = Iridium & { ipfs: IPFS; peerId: PeerId };

export type IPFSWithLibP2P = IPFS & { libp2p: Libp2p };

export type IridiumIPFSConfig = IridiumConfig & {
  ipfs?: IPFSConfig;
  libp2p?: LibP2PConfig;
};

export type IridiumIPFSPeer = IridiumPeer & {
  peerId: PeerId;
  protocol?: ProtocolStream;
};
