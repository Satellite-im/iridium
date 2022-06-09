import * as json from 'multiformats/codecs/json';
import minimist from 'minimist';
import Iridium from './iridium';
import type { IridiumMessage } from './iridium';
import Emitter from './emitter';

export type IridiumTerminalCommands = {
  [key: string]: (...args: any[]) => any;
};

const textEncoder = new TextEncoder();

export default class IridiumTerminal extends Emitter<IridiumMessage> {
  private _commands: IridiumTerminalCommands;
  private _help: IridiumTerminalCommands;

  constructor(
    instance: Iridium,
    customCommands: IridiumTerminalCommands,
    help: IridiumTerminalCommands = {}
  ) {
    super();
    instance.on('*', (event: IridiumMessage) => {
      console.info(
        `[iridium] ${event.channel} ${event.from ? `(${event.from}):` : ''} ${
          event.payload ? JSON.stringify(event.payload, null, 2) : ''
        }`
      );
      this.emit(event.channel as string, event);
    });
    this._commands = {
      send: instance.send.bind(instance),
      sendSigned: instance.sendSigned.bind(instance),
      sendEncrypted: instance.sendEncrypted.bind(instance),
      broadcast: instance.broadcast.bind(instance),
      broadcastSigned: instance.broadcastSigned.bind(instance),
      load: instance.load.bind(instance),
      loadSigned: instance.loadSigned.bind(instance),
      loadEncrypted: instance.loadEncrypted.bind(instance),
      get: instance.get.bind(instance),
      set: instance.set.bind(instance),
      help: this.help.bind(this),
      whoami: () => {
        return { peerId: instance.peerId, did: instance.id };
      },
      clear: () => {
        console.clear();
      },
      ...customCommands,
    };
    this._help = help;
  }

  async exec(line: string) {
    const {
      _: [cmd, ...args],
      ...props
    } = minimist(line.split(' '));
    const command = this.command(cmd);
    const input = args.map((arg) =>
      arg.startsWith('enc:')
        ? textEncoder.encode(arg.substring(4))
        : arg.startsWith('json:')
        ? JSON.parse(arg.substring(5))
        : arg
    );
    try {
      const result = await command(...input);
      console.info(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(e);
    }
  }

  command(cmd: string) {
    return this._commands[cmd] || this._commands.help.bind(this, cmd);
  }

  help(cmd: string, ...args: any[]) {
    if (cmd) {
      return `${cmd} - ${
        this._help[cmd](...args) || 'No help available for this command'
      }`;
    } else {
      return 'Available commands: ' + Object.keys(this._commands).join(', ');
    }
  }
}
