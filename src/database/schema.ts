import Iridium from 'src/iridium';

export type IridiumSchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'object'
  | 'array';

export type IridiumSchemaTable = {
  name: string;
  fields: {
    [name: string]: {
      type: IridiumSchemaFieldType;
      aggregate?:
        | 'sum'
        | 'min'
        | 'max'
        | 'range'
        | 'avg'
        | 'count'
        | 'distinct';
      encrypted?: boolean;
      signed?: boolean;
    };
  };
  indexes?: {
    [name: string]: {
      fields: string[];
      unique?: boolean;
    };
  };
  relations?: {
    [name: string]: {
      table: string;
      fields: string[];
      type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
    };
  };
  rollup?: {
    type: 'count' | 'date';
    fields: string[];
  };
};

export type IridiumSchemaJSON = {
  id: string;
  tables: {
    [tableName: string]: IridiumSchemaTable;
  };
};

export class IridiumSchema {
  constructor(
    private readonly schema: IridiumSchemaJSON,
    private readonly instance: Iridium
  ) {}
  async init() {}
}
