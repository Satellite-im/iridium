import { DID } from 'dids';
import Emitter from 'src/core/emitter';
import type Iridium from 'src/iridium';
import {
  IridiumDocument,
  IridiumPubsubMessage,
  IridiumWriteOptions,
} from 'src/types';

export interface IridiumPubsubProvider<Payload = IridiumDocument>
  extends Emitter<IridiumPubsubMessage<Payload>> {
  start?(iridium: Iridium): Promise<void>;
  publish(
    topic: string,
    payload: Payload,
    options?: IridiumWriteOptions
  ): Promise<void>;
  subscribe(topic: string): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  subscriptions(): string[];
  waitForSubscriber(
    topic: string,
    options: { did?: DID | string; dids?: DID | string[]; timeout: number }
  ): Promise<void>;
  stop?(): Promise<void>;
}