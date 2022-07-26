import { PeerId } from '@libp2p/interfaces/peer-id';
import type { ProtocolStream } from '@libp2p/interfaces/connection';
import { pipe } from 'it-pipe';

import { IridiumP2PProvider } from '../../../core/p2p/interface';
import { DIDToPeerId } from '../../../core/identity/did/utils';
import type Iridium from '../../../iridium';
import {
  IridiumLogger,
  IridiumPeerIdentifier,
  IridiumPubsubMessage,
} from '../../../types';
import Emitter from '../../../core/emitter';
import { IPFSWithLibP2P, IridiumIPFSPeer } from '../types';
import { peerIdToDID } from '../utils';
import { Multiaddr } from '@multiformats/multiaddr';
import { base58btc } from 'multiformats/bases/base58';

export class IPFSP2PProvider extends Emitter implements IridiumP2PProvider {
  private _dialing: string[] = [];
  private _peers: { [key: string]: IridiumIPFSPeer } = {};
  private _peerIdMap: { [key: string]: string } = {};
  private _protocols: { [key: string]: ProtocolStream } = {};
  private _timers: { [key: string]: any } = {};
  private _iridium?: Iridium;

  constructor(
    public ipfs: IPFSWithLibP2P,
    private _peerId: PeerId,
    private logger: IridiumLogger = console
  ) {
    super();
  }

  get peerId() {
    return this._peerId?.toString();
  }

  async start(iridium: Iridium) {
    this._iridium = iridium;

    this.ipfs.libp2p.connectionManager.addEventListener(
      'peer:connect',
      this.onPeerConnect.bind(this)
    );

    this.ipfs.libp2p.connectionManager.addEventListener(
      'peer:disconnect',
      this.onPeerDisconnect.bind(this)
    );

    this.ipfs.libp2p.addEventListener(
      'peer:discovery',
      this.onPeerDiscover.bind(this)
    );

    // dial all peers
    await Object.entries(this._peers).map(async ([did]) => {
      await this.connect(did);
    });
  }

  async stop() {
    Object.values(this._timers).forEach((timer) => {
      clearInterval(timer);
      clearTimeout(timer);
    });
    const peers = await this.ipfs.swarm.peers();
    for (const peer of peers) {
      await this.ipfs.swarm.disconnect(peer.peer);
      await this.ipfs.libp2p.peerStore.delete(peer.peer);
    }
    await this.ipfs.repo.gc();
    this.ipfs.libp2p.connectionManager.removeEventListener(
      'peer:connect',
      this.onPeerConnect
    );
    this.ipfs.libp2p.connectionManager.removeEventListener(
      'peer:disconnect',
      this.onPeerDisconnect
    );
    this.ipfs.libp2p.removeEventListener('peer:discovery', this.onPeerDiscover);
    return this.ipfs.stop();
  }

  async addPeer({
    did,
    peerId,
    type = 'peer',
    addr,
  }: IridiumIPFSPeer): Promise<void> {
    if (this.hasPeer(did)) {
      return;
    }

    this._peers[did] = { did, addr, peerId, type };
    await this.dial(did);
  }

  hasPeer(did: string) {
    return this._peers[did] !== undefined;
  }

  getPeer(did: IridiumPeerIdentifier) {
    return this._peers[did.toString()];
  }

  getPeerByPeerID(peerId: PeerId) {
    return this._peers[this._peerIdMap[peerId.toString()]];
  }

  async onPeerDiscover(event: any) {
    const peerId = event.detail.id;
    if (!event.detail.id.publicKey) {
      // ignore peer without public key
      return;
    }
    const did = peerIdToDID(peerId);
    this.emit('peer:discovery', {
      peerId,
      did,
    });
  }

  async onPeerConnect(event: any) {
    if (!this._iridium) return;
    if (!this._peerId?.privateKey) {
      this.logger.info('iridium/onPeerConnect', 'no private key', this._peerId);
      throw new Error('no local private key available for secure connection');
    }

    if (!event.detail.remotePeer.publicKey) {
      // this peer hasn't provided a public key, so we can't connect
      return;
    }
    const remotePeerId = event.detail.remotePeer.toString();
    const remotePeerDID = peerIdToDID(event.detail.remotePeer);

    const peer = this.getPeer(remotePeerDID);
    if (peer) {
      this.logger.debug(
        'iridium/onPeerConnect',
        `remote peer connected: ${remotePeerId}`,
        peer
      );
      await this.dial(remotePeerDID);
      this._dialing = this._dialing.filter((id) => id !== remotePeerId);

      // TODO: maybe create a DID from this keypair, an IPNS document that has a namespace per-peer for storage, etc...
      // const sharedSecret = await getSharedSecret(
      //   this._peerId.privateKey.slice(4, 36),
      //   event.detail.remotePeer.publicKey.slice(4, 36)
      // );
      // const publicKey = await getPublicKey(sharedSecret);
      // use it to source metadata i.e.
      // const relationshipID = createDIDFromKeypair(publicKey, privateKey)
      // peer.relationship = {
      // did: relationshipID,
      // meta: iridium.identityProvider.resolve(did),
      // }
      // peer.did = createDIDFromKeypair(publicKey, privateKey);
      // peer.meta = iridium.identityProvider.resolve()
      // const channel = `${peer.type}/${base58btc.encode(publicKey)}`;
      // peer.channel = channel;
      // peer.seen = Date.now();
      // this.logger.info('iridium/onPeerConnect', `subscribing to ${channel}`, {
      //   remotePeerDID,
      //   remotePeerId,
      // });
      // await this._iridium.subscribe(channel, {
      //   handler: this.onPeerMessage.bind(this),
      // });

      if (peer.type === 'node') {
        const payload = { type: 'sync-init', at: Date.now() };
        await this._iridium?.send(peer.did, payload);
      }

      this.emit(`${peer.type}/connect`, peer);
    }
  }

  async onPeerDisconnect(event: any) {
    const peerId = event.detail.remotePeer.toString();
    const peer = this.getPeer(peerId);
    if (!peer) return;
    if (peer.channel) {
      await this.ipfs.pubsub.unsubscribe(peer.channel, undefined, {});
    }
    this.logger.info('iridium/listeners', `peer disconnected: ${peerId}`);
    delete this._peers[peerId];
  }

  async onPeerMessage(message: IridiumPubsubMessage) {
    if (message.from.toString() === this._iridium?.id) {
      return;
    }
    this.logger.info('iridium/onPeerMessage', 'pubsub event received', message);
    this.logger.info('iridium/onPeerMessage', 'emitting message', message);
    this.emit(message.topic, message.payload);
    if (message.payload.type) this.emit(message.payload.type, message.payload);
  }

  async connect(to: Multiaddr | IridiumPeerIdentifier) {
    if (to instanceof Multiaddr) {
      return this.ipfs.swarm.connect(to).catch(() => {});
    }
    const peerId = await DIDToPeerId(to);
    await this.ipfs.swarm.connect(peerId).catch(() => {});
    await this.dial(to);
  }

  async disconnect(did: IridiumPeerIdentifier) {
    const peer = this.getPeer(did);
    await this.ipfs.swarm.disconnect(peer.peerId);
    await this.ipfs.libp2p.connectionManager.closeConnections(peer.peerId);
    await this.ipfs.libp2p.peerStore.addressBook.delete(peer.peerId);
  }

  async send(did: IridiumPeerIdentifier, data: Uint8Array) {
    const { stream } = await this.dial(did);
    if (!stream) return;
    await pipe([data], stream);
  }

  async dial(did: IridiumPeerIdentifier, type: 'peer' | 'node' = 'peer') {
    const peer = this.getPeer(did);
    if (!peer) {
      const peerId = await DIDToPeerId(did);
      await this.addPeer({ did: did.toString(), peerId, type });
    }
    if (!peer.channel) {
      await this.ipfs.swarm.connect(peer.addr || peer.peerId);
      if (peer.peerId.publicKey) {
        const channel = `peer/${base58btc.encode(peer.peerId.publicKey)}`;
        peer.channel = channel;
        this._peers[did.toString()] = peer;
        this.logger.info('iridium/dial', `peer added`, this._peers);
      }
    }
    if (peer.channel) {
      this.logger.info('iridium/dial', `subscribing to ${peer.channel}`);
      this.ipfs.pubsub.subscribe(peer.channel, this.onPeerConnect.bind(this));
    }
    // TODO: add message handler <------ !!!!!
    return peer.channel;
  }

  async listenAddresses() {
    return this.ipfs.swarm.localAddrs();
  }
}
