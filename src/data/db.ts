import Dexie, { type Table } from 'dexie';
import type {
  Bottle,
  Brand,
  Command,
  Group,
  LedgerEntry,
  MixRecord,
  Paint,
  StockItem,
  UsageRecord,
  Workbench,
  WorkbenchItem,
} from '@/core/model/types';

/** settings 表行：key 为主键，value 为白名单设置项的值（spec 3.9） */
export interface SettingsRow {
  key: string;
  value: unknown;
}

export interface SnapshotRow {
  id: string;
  at: number;
  payload: unknown;
}

/** 与 spec 5.4 完全一致的表清单 */
export type TableName =
  | 'brands'
  | 'paints'
  | 'stockItems'
  | 'groups'
  | 'bottles'
  | 'workbenches'
  | 'workbenchItems'
  | 'mixRecords'
  | 'usageRecords'
  | 'ledger'
  | 'commands'
  | 'settings'
  | 'snapshots';

export const TABLE_NAMES: TableName[] = [
  'brands',
  'paints',
  'stockItems',
  'groups',
  'bottles',
  'workbenches',
  'workbenchItems',
  'mixRecords',
  'usageRecords',
  'ledger',
  'commands',
  'settings',
  'snapshots',
];

/** 用户数据表（导出 / 重置 / 导入的作用范围） */
export const USER_TABLE_NAMES: TableName[] = [
  'stockItems',
  'groups',
  'bottles',
  'workbenches',
  'workbenchItems',
  'mixRecords',
  'usageRecords',
  'ledger',
  'commands',
];

/**
 * 仓储层只依赖这个最小表接口，便于在无 IndexedDB 的环境（jsdom / 单测）
 * 用内存实现验证事务语义；生产实现由 Dexie 提供。
 */
export interface TableLike<T> {
  get(key: string): Promise<T | undefined>;
  put(value: T): Promise<string>;
  bulkPut(values: T[]): Promise<unknown>;
  delete(key: string): Promise<void>;
  toArray(): Promise<T[]>;
  clear(): Promise<void>;
}

export interface DepotStore {
  brands: TableLike<Brand>;
  paints: TableLike<Paint>;
  stockItems: TableLike<StockItem>;
  groups: TableLike<Group>;
  bottles: TableLike<Bottle>;
  workbenches: TableLike<Workbench>;
  workbenchItems: TableLike<WorkbenchItem>;
  mixRecords: TableLike<MixRecord>;
  usageRecords: TableLike<UsageRecord>;
  ledger: TableLike<LedgerEntry>;
  commands: TableLike<Command>;
  settings: TableLike<SettingsRow>;
  snapshots: TableLike<SnapshotRow>;
  transaction<T>(mode: 'r' | 'rw', tables: TableName[], scope: () => Promise<T>): Promise<T>;
}

/** spec 5.4 的 Dexie 表结构 */
export class DepotDB extends Dexie {
  brands!: Table<Brand, string>;
  paints!: Table<Paint, string>;
  stockItems!: Table<StockItem, string>;
  groups!: Table<Group, string>;
  bottles!: Table<Bottle, string>;
  workbenches!: Table<Workbench, string>;
  workbenchItems!: Table<WorkbenchItem, string>;
  mixRecords!: Table<MixRecord, string>;
  usageRecords!: Table<UsageRecord, string>;
  ledger!: Table<LedgerEntry, string>;
  commands!: Table<Command, string>;
  settings!: Table<SettingsRow, string>;
  snapshots!: Table<SnapshotRow, string>;

  constructor(name = 'pigment-depot') {
    super(name);
    this.version(1).stores({
      brands: 'id, name',
      paints: 'id, lineId, brandId, code, paintClass, hex',
      stockItems: 'id, paintId, groupId, volumeMl, state, origin, openedAt',
      groups: 'id, parentId, depth, sort',
      bottles: 'id, updatedAt',
      workbenches: 'id, sort',
      workbenchItems: 'id, workbenchId, refType, refId',
      mixRecords: 'id, bottleId, at',
      usageRecords: 'id, targetId, at',
      ledger: 'id, at, type',
      commands: 'id, at',
      settings: 'key',
      snapshots: 'id, at',
    });
    /**
     * v2 · 数据换代（2026-11）：目录换成 paintlab 的郡士 / 匠域合并表（617 条），
     * 旧目录（4 品牌 267 条）与旧用户数据（库存 / 分组 / 调漆瓶 / 工作台 / 记录 / 撤销栈）
     * 全部作废，避免新旧 SKU 串号。升级时清空所有表 —— 这就是「原有数据清除」。
     */
    this.version(2)
      .stores({
        brands: 'id, name',
        paints: 'id, lineId, brandId, code, paintClass, hex',
        stockItems: 'id, paintId, groupId, volumeMl, state, origin, openedAt',
        groups: 'id, parentId, depth, sort',
        bottles: 'id, updatedAt',
        workbenches: 'id, sort',
        workbenchItems: 'id, workbenchId, refType, refId',
        mixRecords: 'id, bottleId, at',
        usageRecords: 'id, targetId, at',
        ledger: 'id, at, type',
        commands: 'id, at',
        settings: 'key',
        snapshots: 'id, at',
      })
      .upgrade(async (tx) => {
        for (const table of TABLE_NAMES) {
          await tx.table(table).clear();
        }
      });
  }
}

export const db = new DepotDB();

function createDexieStore(): DepotStore {
  const table = <T>(name: TableName): TableLike<T> => db.table(name) as unknown as TableLike<T>;
  return {
    brands: table<Brand>('brands'),
    paints: table<Paint>('paints'),
    stockItems: table<StockItem>('stockItems'),
    groups: table<Group>('groups'),
    bottles: table<Bottle>('bottles'),
    workbenches: table<Workbench>('workbenches'),
    workbenchItems: table<WorkbenchItem>('workbenchItems'),
    mixRecords: table<MixRecord>('mixRecords'),
    usageRecords: table<UsageRecord>('usageRecords'),
    ledger: table<LedgerEntry>('ledger'),
    commands: table<Command>('commands'),
    settings: table<SettingsRow>('settings'),
    snapshots: table<SnapshotRow>('snapshots'),
    transaction<T>(mode: 'r' | 'rw', tables: TableName[], scope: () => Promise<T>): Promise<T> {
      return db.transaction(mode, tables, scope);
    },
  };
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function rowKey(doc: unknown): string {
  if (typeof doc !== 'object' || doc === null) throw new Error('记录必须是对象');
  const rec = doc as { id?: unknown; key?: unknown };
  const key = typeof rec.id === 'string' ? rec.id : typeof rec.key === 'string' ? rec.key : '';
  if (!key) throw new Error('记录缺少主键 id/key');
  return key;
}

/** 内存实现：与 Dexie 实现共用同一套仓储代码，单测用它验证事务与回滚语义 */
export class MemoryStore implements DepotStore {
  private data: Record<TableName, Map<string, unknown>> = {} as Record<TableName, Map<string, unknown>>;

  brands: TableLike<Brand>;
  paints: TableLike<Paint>;
  stockItems: TableLike<StockItem>;
  groups: TableLike<Group>;
  bottles: TableLike<Bottle>;
  workbenches: TableLike<Workbench>;
  workbenchItems: TableLike<WorkbenchItem>;
  mixRecords: TableLike<MixRecord>;
  usageRecords: TableLike<UsageRecord>;
  ledger: TableLike<LedgerEntry>;
  commands: TableLike<Command>;
  settings: TableLike<SettingsRow>;
  snapshots: TableLike<SnapshotRow>;

  /** transaction 嵌套层数：内层事务不单独快照 */
  private depth = 0;

  constructor() {
    for (const name of TABLE_NAMES) this.data[name] = new Map<string, unknown>();
    this.brands = this.makeTable<Brand>('brands');
    this.paints = this.makeTable<Paint>('paints');
    this.stockItems = this.makeTable<StockItem>('stockItems');
    this.groups = this.makeTable<Group>('groups');
    this.bottles = this.makeTable<Bottle>('bottles');
    this.workbenches = this.makeTable<Workbench>('workbenches');
    this.workbenchItems = this.makeTable<WorkbenchItem>('workbenchItems');
    this.mixRecords = this.makeTable<MixRecord>('mixRecords');
    this.usageRecords = this.makeTable<UsageRecord>('usageRecords');
    this.ledger = this.makeTable<LedgerEntry>('ledger');
    this.commands = this.makeTable<Command>('commands');
    this.settings = this.makeTable<SettingsRow>('settings');
    this.snapshots = this.makeTable<SnapshotRow>('snapshots');
  }

  private makeTable<T>(name: TableName): TableLike<T> {
    const map = (): Map<string, unknown> => this.data[name];
    return {
      get: async (key: string) => {
        const value = map().get(key);
        return value === undefined ? undefined : cloneJson(value as T);
      },
      put: async (value: T) => {
        const key = rowKey(value);
        map().set(key, cloneJson(value));
        return key;
      },
      bulkPut: async (values: T[]) => {
        for (const value of values) map().set(rowKey(value), cloneJson(value));
      },
      delete: async (key: string) => {
        map().delete(key);
      },
      toArray: async () => Array.from(map().values()).map((value) => cloneJson(value as T)),
      clear: async () => {
        map().clear();
      },
    };
  }

  async transaction<T>(_mode: 'r' | 'rw', tables: TableName[], scope: () => Promise<T>): Promise<T> {
    const outer = this.depth === 0;
    const snapshot = outer ? tables.map((name) => [name, Array.from(this.data[name].entries())] as const) : [];
    this.depth += 1;
    try {
      return await scope();
    } catch (error) {
      if (outer) {
        for (const [name, rows] of snapshot) {
          const map = this.data[name];
          map.clear();
          for (const [key, value] of rows) map.set(key, value);
        }
      }
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  /** 级联快照：仅测试断言用 */
  snapshotOf(name: TableName): unknown[] {
    return Array.from(this.data[name].values());
  }
}

export function createMemoryStore(): DepotStore {
  return new MemoryStore();
}

let active: DepotStore | null = null;

/** 仓储层取得当前存储实现（生产：Dexie；无 IndexedDB 环境：内存实现） */
export function getStore(): DepotStore {
  if (!active) {
    active = typeof indexedDB === 'undefined' ? createMemoryStore() : createDexieStore();
  }
  return active;
}

export function setStore(next: DepotStore): void {
  active = next;
}

export function resetStore(): void {
  active = null;
}
