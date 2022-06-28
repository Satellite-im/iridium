import * as json from 'multiformats/codecs/json';
import Iridium from './iridium';
import { IridiumConfig, IridiumSeedConfig } from './types';
import IridiumTerminal from './readline-adapter';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export type IridiumSyncAgentConfig = {
  peers?: {
    limit?: number;
    timeout?: number;
    retry?: number;
  };
  sync?: {
    limit?: number;
    maxSize?: number;
    timeout?: number;
    retry?: number;
  };
  pins?: {
    limit?: number;
  };
  identity?: {
    limit?: number;
    maxSize?: number;
  };
  server?: IridiumSeedConfig;
};

const localRelay =
  process.env.IRIDIUM_LOCAL_RELAY ||
  process.env.NUXT_ENV_IRIDIUM_LOCAL_RELAY ||
  process.env.VITE_ENV_IRIDIUM_LOCAL_RELAY;
if (localRelay) {
  console.info(`Using local relay peer: ${localRelay}`);
}

const DEFAULT_CONFIG: IridiumSyncAgentConfig = {
  peers: {
    limit: 10000,
    timeout: 10000,
    retry: 3,
  },
  sync: {
    limit: 10000,
    timeout: 10000,
    maxSize: 256,
    retry: 3,
  },
  identity: {
    limit: 100000,
    maxSize: 256,
  },
};

type PeerData = {
  did: string;
  peerId: string;
  seen: number;
  pins: string[];
};

export default class IridiumSyncAgent {
  private _peers: { [key: string]: PeerData } = {};
  private _offline: { [key: string]: string[] } = {};
  private _pins: { [key: string]: string[] } = {};
  constructor(
    private readonly instance: Iridium,
    private config: IridiumSyncAgentConfig
  ) {
    this.instance.on('peer:connect', this.onPeerConnect.bind(this));
    this.instance.on(`sync/${this.instance.id}`, this.onSyncMessage.bind(this));
  }

  async start() {
    const terminal = new IridiumTerminal(this.instance, {});
    await this.instance.start();
    await terminal.exec('whoami');
    await terminal.exec('pins');
    await this.instance.subscribe(`sync/${this.instance.id}`);
    await this.instance.subscribe(`friends/announce`);

    const rl = readline.createInterface({ input, output });
    rl.setPrompt('> ');

    rl.on('line', async (line: string) => {
      await terminal.exec(line).catch((error) => {
        console.error(error);
      });
      rl.prompt();
    }).on('close', () => {
      console.info('bye');
      process.exit(0);
    });

    console.info('sync agent terminal starting');
    rl.prompt();
  }

  static async create(
    seed: string,
    config: IridiumSyncAgentConfig = DEFAULT_CONFIG
  ) {
    const iridium = await Iridium.fromSeedString(seed, config.server);
    const agent = new IridiumSyncAgent(iridium, config);
    await agent.start();
    return agent;
  }

  onPeerConnect({ peerId }: { peerId: string }) {
    console.info('peer connected', peerId);
  }

  async onSyncMessage(message: any) {
    console.info(message);
    const { from, payload, type } = message;

    if (!['jwe', 'jws'].includes(type)) {
      console.debug('ignoring unsigned sync message', message);
      return;
    }

    const remotePeerId = from.toString();
    const remoteDID = await Iridium.peerIdToDID(from);
    if (payload.type === 'sync-init') {
      this._peers[remotePeerId] = {
        did: remoteDID,
        peerId: remotePeerId,
        seen: Date.now(),
        pins: payload.data?.pins || [],
      };
      await this.instance.send(
        {
          action: 'sync-init',
          data: {
            request: payload.request || undefined,
            success: true,
          },
        },
        {
          to: remotePeerId,
          encrypt: { recipients: [remoteDID] },
        }
      );
      return;
    }

    if (payload.type === 'sync-put') {
      if (!this._offline[remotePeerId]) {
        this._offline[remotePeerId] = [];
      }
      if (
        this._offline[remotePeerId].length >= Number(this.config.sync?.limit)
      ) {
        throw new Error('offline sync limit reached for peer: ' + remotePeerId);
      }
      // pin the document until it can be delivered
      const cid = await this.instance.store(payload, {
        encrypt: { recipients: [this.instance.id, remoteDID, payload.to] },
        dag: { pin: true },
      });
      this._offline[remotePeerId].push(cid.toString());
      await this.instance.send(
        {
          action: 'sync-put',
          data: {
            cid,
            request: payload.request || undefined,
            success: true,
          },
        },
        {
          to: remotePeerId,
          encrypt: { recipients: [remoteDID] },
        }
      );
    }

    if (payload.type === 'pin') {
      if (!this._pins[remotePeerId]) {
        this._pins[remotePeerId] = [];
      }

      if (this._pins[remotePeerId].length >= Number(this.config.pins?.limit)) {
        throw new Error('pin limit reached for peer: ' + remotePeerId);
      }

      try {
        const cid = payload.data;
        await this.instance.ipfs.pin.add(cid);
        await this.instance.send(
          {
            action: 'pin',
            data: {
              cid,
              request: payload.request || undefined,
              success: true,
            },
          },
          {
            to: remotePeerId,
            encrypt: { recipients: [remoteDID] },
          }
        );
      } catch (error) {
        console.error(error);
      }
    }

    console.warn('unhandled sync message', message);
  }
}
