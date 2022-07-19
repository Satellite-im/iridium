import { DID } from 'dids';
import Emitter from '../../../core/emitter';
import { IridiumPubsubProvider } from '../../../core/pubsub/interface';
import type Iridium from '../../../iridium';
import {
  IridiumDocument,
  IridiumLogger,
  IridiumPubsubMessage,
  IridiumWriteOptions,
} from '../../../types';

export class TestPubsubProvider<Payload = IridiumDocument>
  extends Emitter<IridiumPubsubMessage<Payload>>
  implements IridiumPubsubProvider<Payload>
{
  constructor(private readonly logger: IridiumLogger) {
    super();
  }
  async start?(iridium: Iridium): Promise<void> {}
  async publish(
    topic: string,
    payload: Payload,
    options?: IridiumWriteOptions
  ): Promise<void> {
    this.emit(topic, payload);
  }
  async subscribe(topic: string): Promise<void> {}
  async unsubscribe(topic: string): Promise<void> {
    this.off(topic);
  }
  subscriptions(): Array<string> {
    return [];
  }
  async waitForSubscriber(
    topic: string,
    options: { did?: DID | string; dids?: DID | string[]; timeout: number }
  ): Promise<void> {}
  async stop?(): Promise<void> {}
}
