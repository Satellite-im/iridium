import Emitter from '../core/emitter';
import Minisearch, { Options } from 'minisearch';
import { IridiumNamespace } from '../helpers/namespace';
import { IridiumDocument } from '../types';
import { CID } from 'multiformats';
import { hash } from '../core/encoding';

export type IridiumSchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'object'
  | 'array';

export type IridiumTableAggregate =
  | 'sum'
  | 'min'
  | 'max'
  | 'avg'
  | 'count'
  | 'distinct'
  | 'count_distinct'
  | 'range';

export type IridiumTableIndex = {
  fields: string[];
  unique?: boolean;
};

export type IridiumTableIndexes = {
  [name: string]: IridiumTableIndex;
};

export type IridiumTableRollup = {
  count: number;
};

export type IridiumTableAggregates = {
  [key: string]: IridiumTableAggregate[];
};

export type IridiumAggregateValues = {
  sum?: number;
  min?: number;
  max?: number;
  avg?: number;
  count?: number;
  distinct?: string[];
  count_distinct?: number;
  range?: [number, number];
};

export type IridiumTableSchema = {
  name: string;
  hash?: string;
  search: Options;
  aggregates?: IridiumTableAggregates;
  rollup?: IridiumTableRollup;
  indexes?: IridiumTableIndexes;
  migrator?: IridiumMigrationHandler;
};

export type IridiumMigrationHandler<T = IridiumDocument> = (
  prevSchema: IridiumTableSchema,
  prevData: T | T[]
) => Promise<void>;

export type IridiumTableMetadata = {
  updatedAt: number;
  blockIndex: number;
  recordIndex: number;
  lastRollupIndex: number;
  lastRollupAt: number;
};

export type IridiumDBBlock = {
  index: number;
  search: Minisearch;
  aggregates: IridiumAggregateValues;
  records: IridiumDocument[];
  prevBlock?: CID;
};

export class IridiumDBTable extends Emitter {
  private readonly name: string;
  private readonly indexes?: IridiumTableIndexes;
  private readonly search: Options;
  private readonly rollup: IridiumTableRollup;
  private readonly aggregates: IridiumTableAggregates;
  private metadata: IridiumTableMetadata;
  private hash?: string;
  private blocks: CID[] = [];
  private currentBlock: IridiumDBBlock;

  constructor(
    schema: IridiumTableSchema,
    private readonly namespace: IridiumNamespace,
    private readonly migrator?: IridiumMigrationHandler
  ) {
    super();
    this.name = schema.name;
    this.indexes = schema.indexes;
    this.search = schema.search;
    this.aggregates = schema.aggregates || {};
    this.rollup = schema.rollup || { count: 10000 };
    this.migrator = schema.migrator?.bind(this);
    this.metadata = {
      blockIndex: 0,
      recordIndex: 0,
      updatedAt: 0,
      lastRollupIndex: 0,
      lastRollupAt: 0,
    };
    this.currentBlock = {
      index: 0,
      search: new Minisearch(this.search),
      aggregates: {},
      records: [],
    };
  }

  async init() {
    this.hash = await hash(this.schema);
    this.metadata = await this.loadMetadata();
    const prevSchema = await this.loadSchema();
    const event = {
      hash: this.hash,
      schema: this.schema,
      prevSchema,
      migrated: false,
      restored: true,
      created: false,
    };

    if (prevSchema?.hash !== event.hash) {
      await this.migrate(prevSchema);
      event.migrated = true;
    }

    if (!prevSchema) {
      event.restored = false;
      event.created = true;
      await this.namespace.set(`/db/${this.name}`, {
        schema: this.schema,
        metadata: this.metadata,
        currentBlock: this.currentBlock,
        blocks: this.blocks,
      });
      return this.emit('ready', event);
    }

    // we have a schema, load blocks and currentBlock
    this.blocks =
      (await this.namespace.get<CID[]>(`/db/${this.name}/blocks`)) ||
      this.blocks;
    this.currentBlock =
      (await this.namespace.get<IridiumDBBlock>(
        `/db/${this.name}/currentBlock`
      )) || this.currentBlock;

    return this.emit('ready', event);
  }

  async migrate(prevSchema: IridiumTableSchema) {
    if (this.migrator) {
      const previousData = await this.namespace.get(
        `/db/${prevSchema.hash}/records`
      );
      await this.migrator(prevSchema, previousData);
    }
    // TODO: generic migration handler
  }

  async saveSchema() {
    await this.namespace.set(`/db/${this.name}/schema`, this.schema);
  }

  async loadSchema() {
    return this.namespace.get<IridiumTableSchema>(`/db/${this.name}/schema`);
  }

  async saveMetadata() {
    // do we need to rollup here?
    if (this.currentBlock.records.length >= this.rollup.count) {
      await this.executeRollup();
    }

    await this.namespace.set(`/db/${this.name}/metadata`, this.metadata);
  }

  async loadMetadata() {
    return this.namespace.get<IridiumTableMetadata>(
      `/db/${this.name}/metadata`
    );
  }

  async executeRollup() {
    // TODO: iterate records array, fetch docs, and create a search index & aggregate, min/max/sum/count/distinct
    const currentBlock = await this.namespace.get(
      `/db/${this.name}/currentBlock`
    );
    const documents = await Promise.all(
      currentBlock.map((cid: string) => this.namespace.root.load(cid))
    );
    const search = new Minisearch(this.search);
    await search.addAllAsync(documents);

    const aggregates: any = {};
    for (const [field, aggregate] of Object.entries(this.aggregates)) {
      const fieldAggregate: any = {};
      if (
        aggregate.includes('distinct') ||
        aggregate.includes('count_distinct')
      ) {
        const distinct: any[] = [];
        documents.forEach((doc) => {
          if (!distinct.includes(doc[field])) {
            distinct.push(doc[field]);
          }
        });
        if (aggregate.includes('distinct')) {
          fieldAggregate.distinct = distinct;
        }
        if (aggregate.includes('count_distinct')) {
          fieldAggregate.count_distinct = distinct.length;
        }
      }

      if (aggregate.includes('count')) {
        fieldAggregate.count = documents.filter(
          (doc) => ![undefined, null, false, 0].includes(doc[field])
        ).length;
      }

      if (aggregate.includes('sum')) {
        fieldAggregate.sum = documents.reduce(
          (acc, doc) => acc + doc[field],
          0
        );
      }

      let min, max;
      if (aggregate.includes('range') || aggregate.includes('min')) {
        min = documents.reduce(
          (acc, doc) => Math.min(acc, doc[field]),
          Infinity
        );
      }
      if (aggregate.includes('range') || aggregate.includes('max')) {
        max = documents.reduce(
          (acc, doc) => Math.max(acc, doc[field]),
          -Infinity
        );
      }

      if (aggregate.includes('min')) {
        fieldAggregate.min = min;
      }

      if (aggregate.includes('max')) {
        fieldAggregate.max = max;
      }

      if (aggregate.includes('range')) {
        fieldAggregate.range = [min, max];
      }

      if (aggregate.includes('avg')) {
        fieldAggregate.avg =
          documents.reduce((acc, doc) => acc + doc[field], 0) /
          documents.length;
      }

      aggregates[field] = fieldAggregate;
    }
    const index = this.metadata.blockIndex + 1;
    const block = {
      search,
      aggregates,
      records: currentBlock,
      prevBlock: this.metadata.blockIndex,
    };
    const blockCID = await this.namespace.set(
      `/db/${this.name}/blocks/${index}`,
      block
    );
    this.blocks.push(blockCID);
    this.metadata.blockIndex = index;
    this.metadata.lastRollupIndex = this.metadata.blockIndex;
    this.metadata.lastRollupAt = Date.now();
    await this.saveMetadata();
    return this.emit('rollup', {
      index,
      cid: blockCID,
    });
  }

  async getById(id: string) {
    return this.namespace.get(`/db/${this.hash}/records/${id}`);
  }

  async getByIndex(name: string, value: string | string[]) {
    const index = this.indexes?.[name];
    if (!index) {
      throw new Error(`iridium/db/table/${this.name}: index ${name} not found`);
    }

    const match = await this.namespace.get<string | string[]>(
      `/db/indexes/${index.fields.join('/')}/${
        Array.isArray(value) ? value.join('/') : value
      }`
    );
    return Array.isArray(match)
      ? match.map((id) => this.getById(id))
      : this.getById(match);
  }

  async insert(record: IridiumDocument) {
    let cid;
    await this.namespace.lock(async () => {
      await this.assertUniqueIndexes(record);
      this.assertSchemaConstraints(record);
      record.id = this.metadata.recordIndex + 0;
      record.createdAt = Date.now();
      const existing = await this.getById(record.id);
      if (existing) {
        throw new Error(
          `${this.name}: id collision on insert. (id: ${record.id})`
        );
      }
      cid = await this.namespace.root.store(record, {
        encrypt: {
          recipients: this.namespace.members,
        },
      });
      await this.namespace.set(
        `/db/${this.name}/records/${this.currentBlock.records.length}`,
        cid
      );
      await this.namespace.set(
        `/db/${this.name}/currentBlock/${this.currentBlock.records.length}`,
        cid
      );
      this.metadata.recordIndex++;
      await this.writeIndexes(record);
      await this.saveMetadata();
    });
  }

  async assertUniqueIndexes(record: IridiumDocument) {
    await Promise.all(
      Object.values(this.indexes || {}).map(async (index) => {
        await Promise.all(
          Object.values(index.fields).map(async (field) => {
            const exists = await this.getByIndex(field, record[field]);
            if (exists) {
              throw new Error(
                `${this.name}: table index violation. ${field} with value ${record[field]} already exists.`
              );
            }
          })
        );
      })
    );
  }

  async writeIndexes(record: IridiumDocument) {
    return Promise.all(
      Object.values(this.indexes || {}).map(async (index) => {
        const values = index.fields.map((field) => record[field]);
        await this.namespace.set(
          `/db/indexes/${index.fields.join('/')}/${values.join('/')}`,
          record.id
        );
      })
    );
  }

  assertSchemaConstraints(record: IridiumDocument) {
    // TODO: throw on type violations
  }

  get schema() {
    return {
      hash: this.hash,
      name: this.name,
      search: this.search,
      aggregates: this.aggregates,
      indexes: this.indexes,
      rollup: this.rollup,
    };
  }
}
