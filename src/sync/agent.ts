import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import IridiumTerminal from '../helpers/readline-adapter';
import { createIridiumIPFS } from '../adapters/ipfs/create';
import { IridiumMessage } from '../types';
import { DIDToPeerId } from '../core/identity/did/utils';
import { IPFSSeedConfig, IridiumIPFS } from 'src/adapters/ipfs/types';

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
  server?: IPFSSeedConfig;
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
  server: {
    config: {
      ipfs: {
        config: {
          Addresses: {
            Swarm: ['/ip4/127.0.0.1/tcp/4002', '/ip4/127.0.0.1/tcp/4003/ws'],
          },
        },
      },
    },
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
    private readonly instance: IridiumIPFS,
    private config: IridiumSyncAgentConfig
  ) {
    this.instance.on('peer:connect', this.onPeerConnect.bind(this));
    this.instance.on(`sync/${this.instance.id}`, this.onSyncMessage.bind(this));
    this.instance.on('friends/announce', this.onFriendsAnnounce.bind(this));
  }

  async start() {
    const terminal = new IridiumTerminal(this.instance, {});
    await this.instance.start();
    await terminal.exec('whoami');

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
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
    const iridium = await createIridiumIPFS(seed, config.server);
    const agent = new IridiumSyncAgent(iridium, config);
    await agent.start();
    return agent;
  }

  onPeerConnect({ from }: { from: string }) {
    console.info('peer connected', from);
  }

  onFriendsAnnounce(message: any) {
    console.info('friends announce', message);
  }

  async onSyncMessage(message: IridiumMessage) {
    console.info('sync message', message);
    const { from, payload } = message;
    const { type } = payload;

    const did = from.toString();
    if (type === 'sync-init') {
      if (!payload.did) {
        console.error('sync-init message missing did');
        return;
      }
      const peerId = (await DIDToPeerId(payload.did)).toString();
      this._peers[did] = {
        did: from.toString(),
        peerId,
        seen: Date.now(),
        pins: payload?.pins || [],
      };
      await this.instance.send(from.toString(), {
        action: 'sync-init',
        data: {
          request: payload.request || undefined,
          success: true,
        },
      });
      return;
    }

    if (payload.type === 'sync-put') {
      if (!this._offline[did]) {
        this._offline[did] = [];
      }
      if (this._offline[did].length >= Number(this.config.sync?.limit)) {
        throw new Error('offline sync limit reached for peer: ' + did);
      }
      // pin the document until it can be delivered
      const cid = await this.instance.store(payload, {
        encrypt: { recipients: [this.instance.id, did, payload.to] },
        dag: { pin: true },
      });
      this._offline[did].push(cid.toString());
      await this.instance.send(did, {
        action: 'sync-put',
        data: {
          cid,
          request: payload.request || undefined,
          success: true,
        },
      });
    }

    if (payload.type === 'pin') {
      if (!this._pins[did]) {
        this._pins[did] = [];
      }

      if (this._pins[did].length >= Number(this.config.pins?.limit)) {
        throw new Error('pin limit reached for peer: ' + did);
      }

      try {
        const cid = payload.data;
        await this.instance.ipfs.pin.add(cid);
        await this.instance.send(did, {
          action: 'pin',
          data: {
            cid,
            request: payload.request || undefined,
            success: true,
          },
        });
      } catch (error) {
        console.error(error);
      }
    }

    console.warn('unhandled sync message', message);
  }
}
