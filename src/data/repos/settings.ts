import { z } from 'zod';
import {
  BottleSchema,
  GroupSchema,
  LedgerEntrySchema,
  MixRecordSchema,
  SettingsPartialSchema,
  SettingsSchema,
  StockItemSchema,
  UsageRecordSchema,
  WorkbenchItemSchema,
  WorkbenchSchema,
} from '@/core/model/schemas';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import type {
  Bottle,
  Command,
  Group,
  LedgerEntry,
  MixRecord,
  Settings,
  StockItem,
  UsageRecord,
  Workbench,
  WorkbenchItem,
} from '@/core/model/types';
import type { DepotStore, SettingsRow, TableName } from '../db';
import { USER_TABLE_NAMES } from '../db';
import { fail, ok, toFailure } from './patch';
import type { Failure, Result } from './patch';
import { clearHistory, REDO_KEY } from './history';

export const SETTINGS_KEYS: (keyof Settings)[] = [
  'theme',
  'density',
  'levelMode',
  'showTicks',
  'trackThinner',
  'defaultRatio',
  'defaultBottleMl',
  'neatStockWarn',
  'mlPerKit',
  'undoDepth',
  'confirmDestructive',
  'catalogMirror',
  'mixSeq',
  'recentBottleColors',
];

export const CATALOG_VERSION_KEY = '__catalog.version';
export const EXPORT_FORMAT = 'pigment-depot/v1';

export async function readSettings(s: DepotStore): Promise<Settings> {
  let rows: SettingsRow[] = [];
  try {
    rows = await s.settings.toArray();
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const candidate: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const shape = SettingsSchema.shape;
  for (const key of SETTINGS_KEYS) {
    const value = map.get(key);
    if (value === undefined) continue;
    const parsed = shape[key].safeParse(value);
    if (parsed.success) candidate[key] = parsed.data;
  }
  const checked = SettingsSchema.safeParse(candidate);
  if (!checked.success) return { ...DEFAULT_SETTINGS };
  return {
    ...checked.data,
    recentBottleColors: checked.data.recentBottleColors ?? [],
  };
}

export async function readSetting<K extends keyof Settings>(s: DepotStore, key: K): Promise<Settings[K]> {
  const settings = await readSettings(s);
  return settings[key];
}

export async function writeSettings(s: DepotStore, values: Partial<Settings>): Promise<Result<Settings>> {
  const parsed = SettingsPartialSchema.safeParse(values);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.map((issue) => issue.path.join('.') + '：' + issue.message).join('；'),
      'validation',
      {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    );
  }
  const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined) as [string, unknown][];
  try {
    await s.transaction('rw', ['settings'], async () => {
      for (const [key, value] of entries) await s.settings.put({ key, value });
    });
  } catch (error) {
    return toFailure(error);
  }
  return ok(await readSettings(s));
}

export async function writeSetting<K extends keyof Settings>(
  s: DepotStore,
  key: K,
  value: Settings[K],
): Promise<Result<Settings>> {
  const partial: Partial<Settings> = {};
  partial[key] = value;
  return writeSettings(s, partial);
}

export async function writeCatalogVersion(s: DepotStore, version: string): Promise<Result<string>> {
  try {
    await s.settings.put({ key: CATALOG_VERSION_KEY, value: version });
  } catch (error) {
    return toFailure(error);
  }
  return ok(version);
}

export async function readCatalogVersion(s: DepotStore): Promise<string> {
  try {
    const row = await s.settings.get(CATALOG_VERSION_KEY);
    return typeof row?.value === 'string' ? row.value : 'unknown';
  } catch {
    return 'unknown';
  }
}

/* ------------------------------------------------------------------ */
/* 导入 / 导出 / 重置（spec 3.8）                                       */
/* ------------------------------------------------------------------ */

export interface PigmentExport {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  catalogVersion: string;
  user: {
    stockItems: StockItem[];
    groups: Group[];
    bottles: Bottle[];
    workbenches: Workbench[];
    workbenchItems: WorkbenchItem[];
    records: { mix: MixRecord[]; usage: UsageRecord[]; ledger: LedgerEntry[] };
    commands: Command[];
  };
  settings: Settings;
}

export async function exportAll(s: DepotStore): Promise<Result<PigmentExport>> {
  try {
    const [stockItems, groups, bottles, workbenches, workbenchItems, mix, usage, ledger, commands] =
      await Promise.all([
        s.stockItems.toArray(),
        s.groups.toArray(),
        s.bottles.toArray(),
        s.workbenches.toArray(),
        s.workbenchItems.toArray(),
        s.mixRecords.toArray(),
        s.usageRecords.toArray(),
        s.ledger.toArray(),
        s.commands.toArray(),
      ]);
    return ok({
      format: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      catalogVersion: await readCatalogVersion(s),
      user: {
        stockItems,
        groups,
        bottles,
        workbenches,
        workbenchItems,
        records: { mix, usage, ledger },
        commands,
      },
      settings: await readSettings(s),
    });
  } catch (error) {
    return toFailure(error);
  }
}

const ImportSchema = z.object({
  format: z.string(),
  catalogVersion: z.string().optional(),
  user: z
    .object({
      stockItems: z.array(z.unknown()).optional(),
      groups: z.array(z.unknown()).optional(),
      bottles: z.array(z.unknown()).optional(),
      workbenches: z.array(z.unknown()).optional(),
      workbenchItems: z.array(z.unknown()).optional(),
      records: z
        .object({
          mix: z.array(z.unknown()).optional(),
          usage: z.array(z.unknown()).optional(),
          ledger: z.array(z.unknown()).optional(),
        })
        .optional(),
      commands: z.array(z.unknown()).optional(),
    })
    .optional(),
  settings: z.record(z.unknown()).optional(),
});

export type ImportMode = 'replace' | 'merge' | 'skip';

export interface ImportCounts {
  added: number;
  updated: number;
  skipped: number;
  invalid: number;
}

interface TableImportPlan {
  table: TableName;
  values: unknown[];
  schema: z.ZodTypeAny | null;
  volumeAware: boolean;
}

export async function importAll(
  s: DepotStore,
  raw: unknown,
  mode: ImportMode,
): Promise<Result<ImportCounts>> {
  const parsed = ImportSchema.safeParse(raw);
  if (!parsed.success) return fail('导入文件格式不正确', 'validation');
  if (parsed.data.format !== EXPORT_FORMAT) return fail('不支持的导入格式：' + parsed.data.format, 'validation');
  const user = parsed.data.user ?? {};
  const records = user.records ?? {};
  const counts: ImportCounts = { added: 0, updated: 0, skipped: 0, invalid: 0 };

  const plans: TableImportPlan[] = [
    { table: 'groups', values: user.groups ?? [], schema: GroupSchema, volumeAware: false },
    { table: 'stockItems', values: user.stockItems ?? [], schema: StockItemSchema, volumeAware: true },
    { table: 'bottles', values: user.bottles ?? [], schema: BottleSchema, volumeAware: true },
    { table: 'workbenches', values: user.workbenches ?? [], schema: WorkbenchSchema, volumeAware: false },
    { table: 'workbenchItems', values: user.workbenchItems ?? [], schema: WorkbenchItemSchema, volumeAware: false },
    { table: 'mixRecords', values: records.mix ?? [], schema: MixRecordSchema, volumeAware: false },
    { table: 'usageRecords', values: records.usage ?? [], schema: UsageRecordSchema, volumeAware: false },
    { table: 'ledger', values: records.ledger ?? [], schema: LedgerEntrySchema, volumeAware: false },
  ];

  try {
    await s.transaction('rw', [...USER_TABLE_NAMES, 'settings'], async () => {
      if (mode === 'replace') {
        for (const table of USER_TABLE_NAMES) await s[table].clear();
        await s.settings.put({ key: REDO_KEY, value: [] });
      }
      for (const plan of plans) {
        const table = s[plan.table] as unknown as {
          get(key: string): Promise<Record<string, unknown> | undefined>;
          put(value: Record<string, unknown>): Promise<string>;
        };
        for (const value of plan.values) {
          const checked = plan.schema ? plan.schema.safeParse(value) : { success: true as const, data: value };
          if (!checked.success) {
            counts.invalid += 1;
            continue;
          }
          const doc = checked.data as Record<string, unknown>;
          const id = typeof doc.id === 'string' ? doc.id : '';
          if (!id) {
            counts.invalid += 1;
            continue;
          }
          const existing = mode === 'replace' ? undefined : await table.get(id);
          if (existing) {
            if (mode === 'skip') {
              counts.skipped += 1;
              continue;
            }
            const incomingVolume = typeof doc.volumeMl === 'number' ? doc.volumeMl : typeof doc.remainingMl === 'number' ? doc.remainingMl : 0;
            const existingVolume =
              typeof existing.volumeMl === 'number' ? existing.volumeMl : typeof existing.remainingMl === 'number' ? existing.remainingMl : 0;
            if (plan.volumeAware && incomingVolume <= existingVolume) {
              counts.skipped += 1;
              continue;
            }
            await table.put(doc);
            counts.updated += 1;
            continue;
          }
          await table.put(doc);
          counts.added += 1;
        }
      }
      if (parsed.data.settings) {
        const shape = SettingsSchema.shape;
        for (const key of SETTINGS_KEYS) {
          const value = parsed.data.settings[key];
          if (value === undefined) continue;
          if (shape[key].safeParse(value).success) await s.settings.put({ key, value });
        }
      }
      if (parsed.data.catalogVersion) {
        await s.settings.put({ key: CATALOG_VERSION_KEY, value: parsed.data.catalogVersion });
      }
      // 混合序号：老备份没有 mixSeq 时按已导入批次的最大 seq 推导，避免下一支撞号
      let maxSeq = typeof parsed.data.settings?.mixSeq === 'number' ? parsed.data.settings.mixSeq : 0;
      for (const value of user.bottles ?? []) {
        const seq = (value as { seq?: unknown } | null)?.seq;
        if (typeof seq === 'number' && seq > maxSeq) maxSeq = seq;
      }
      if (mode === 'replace') {
        await s.settings.put({ key: 'mixSeq', value: maxSeq });
      } else if (maxSeq > 0) {
        const current = await s.settings.get('mixSeq');
        const currentSeq = typeof current?.value === 'number' ? current.value : 0;
        if (maxSeq > currentSeq) await s.settings.put({ key: 'mixSeq', value: maxSeq });
      }
    });
  } catch (error) {
    return toFailure(error) as Failure | Result<ImportCounts>;
  }

  if (mode === 'replace') await clearHistory(s);
  return ok(counts);
}

export async function resetAll(s: DepotStore): Promise<Result<true>> {
  try {
    await s.transaction('rw', [...USER_TABLE_NAMES, 'settings'], async () => {
      for (const table of USER_TABLE_NAMES) await s[table].clear();
      const rows = await s.settings.toArray();
      for (const row of rows) await s.settings.delete(row.key);
    });
    await clearHistory(s);
    const defaults = DEFAULT_SETTINGS;
    await writeSettings(s, defaults);
  } catch (error) {
    return toFailure(error);
  }
  return ok(true);
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  ratio: number;
  source: 'navigator' | 'tables';
}

/** 存储占用估算（spec 3.7.3：> 80% 提示） */
export async function estimateStorage(s: DepotStore): Promise<StorageEstimate> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (storage && typeof storage.estimate === 'function') {
    try {
      const estimate = await storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      return { usage, quota, ratio: quota > 0 ? usage / quota : 0, source: 'navigator' };
    } catch {
      /* fall through to table estimate */
    }
  }
  let bytes = 0;
  try {
    for (const table of USER_TABLE_NAMES) {
      const rows = await s[table].toArray();
      bytes += JSON.stringify(rows).length;
    }
  } catch {
    bytes = 0;
  }
  return { usage: bytes, quota: 0, ratio: 0, source: 'tables' };
}
