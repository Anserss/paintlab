import { z } from 'zod';
import { DEFAULT_SETTINGS } from './types';

/** 唯一真相：运行时校验 + TS 类型同源（spec 6.1 / 3.7.4） */

export const HexSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '色值必须是 #RRGGBB');

export const IdSchema = z.string().min(1).max(64);

export const nameSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, '不能为空')
    .max(max, '最多 ' + max + ' 字');

export const SolventSchema = z.enum(['oil', 'water', 'na']);
export const ResinTypeSchema = z.enum(['lacquer', 'acrylic', 'enamel']);
export const PaintClassSchema = z.enum(['solid', 'clear', 'aux']);
export const PaintCategorySchema = z.enum([
  'color',
  'varnish',
  'matte',
  'thinner',
  'retarder',
  'primer',
  'surfacer',
  'wash',
  'effect',
  'other',
]);
export const PackagingSchema = z.enum(['dropper', 'pot', 'jar', 'tinlet', 'bottle']);
export const PaintStateSchema = z.enum(['neat', 'thinned']);
export const OriginSchema = z.enum(['seed', 'custom', 'import', 'mixed']);
export const LevelModeSchema = z.enum(['baseline', 'capacity']);
export const FinishSchema = z.enum([
  'gloss',
  'semiGloss',
  'matte',
  'metal',
  'pearl',
  'clear',
  'fluorescent',
  'primer',
  'additive',
  'wash',
  'ink',
  'other',
]);

export const RatioNSchema = z.number().min(0, '比例不能小于 0').max(10, '比例不能大于 10');

export const BrandSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  nameZh: z.string().min(1),
  shortName: z.string().min(1).max(12),
  aliases: z.array(z.string()).default([]),
  accentHex: HexSchema,
  country: z.string().default(''),
  sort: z.number().int().default(0),
  displayAlias: z.string().max(16, '别名最多 16 字').optional(),
});

export const PaintLineSchema = z.object({
  id: IdSchema,
  brandId: IdSchema,
  name: z.string().min(1),
  nameZh: z.string().optional(),
  packaging: PackagingSchema,
  defaultVolumeMl: z.number().min(0.5).max(2500),
  kind: z.enum(['acrylic', 'enamel', 'lacquer', 'auxiliary']),
  resin: ResinTypeSchema,
  solvent: SolventSchema,
  defaultFinish: FinishSchema,
  thinnerFamily: z.string().optional(),
  defaultRatioN: RatioNSchema.optional(),
});

export const PaintSchema = z.object({
  id: IdSchema,
  lineId: IdSchema,
  brandId: IdSchema,
  code: z.string().max(24).optional(),
  name: z.string().min(1),
  nameZh: z.string().optional(),
  hex: HexSchema,
  paintClass: PaintClassSchema,
  category: PaintCategorySchema,
  finish: FinishSchema.optional(),
  opacityOverride: z.number().min(0).max(1).optional(),
  sourceUrl: z.string().url().optional(),
  verifiedAt: z.string().optional(),
  origin: OriginSchema,
});

export const StockItemSchema = z
  .object({
    id: IdSchema,
    paintId: IdSchema,
    volumeMl: z.number().min(0),
    initialMl: z.number().min(0.5, '规格至少 0.5 ml').max(2500, '规格最多 2500 ml'),
    state: PaintStateSchema,
    ratioN: RatioNSchema.optional(),
    groupId: z.string().nullable(),
    note: z.string().max(120, '备注最多 120 字').optional(),
    origin: OriginSchema,
    createdAt: z.number(),
    openedAt: z.number().optional(),
  })
  .refine((v) => v.volumeMl <= v.initialMl + 1e-6, {
    message: '余量不能超过初始量',
    path: ['volumeMl'],
  })
  .refine((v) => v.state !== 'thinned' || typeof v.ratioN === 'number', {
    message: '稀释状态必须填写比例',
    path: ['ratioN'],
  });

export const GroupSchema = z.object({
  id: IdSchema,
  name: nameSchema(16),
  parentId: z.string().nullable(),
  depth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sort: z.number().int(),
  system: z.boolean().optional(),
});

export const BottleComponentSchema = z.object({
  stockItemId: IdSchema,
  paintId: IdSchema,
  neatMl: z.number().min(0),
  brandId: IdSchema,
  code: z.string().optional(),
  name: z.string().min(1),
  hex: HexSchema,
  paintClass: PaintClassSchema,
});

export const BottleSchema = z
  .object({
    id: IdSchema,
    name: nameSchema(16),
    capacityMl: z.number().int().min(5, '容量至少 5 ml').max(250, '容量最多 250 ml'),
    baselineMl: z.number().min(0),
    remainingMl: z.number().min(0),
    ratioN: RatioNSchema,
    paintClass: PaintClassSchema,
    hex: HexSchema,
    components: z.array(BottleComponentSchema),
    labelBrandId: IdSchema.optional(),
    labelCode: z.string().optional(),
    levelMode: LevelModeSchema,
    updatedAt: z.number(),
  })
  .refine((v) => v.remainingMl <= v.baselineMl + 1e-6, {
    message: '余量不能超过基准量',
    path: ['remainingMl'],
  })
  .refine((v) => v.baselineMl <= v.capacityMl + 1e-6, {
    message: '基准量不能超过瓶容量',
    path: ['baselineMl'],
  });

export const WorkstationSchema = z.object({
  id: IdSchema,
  name: nameSchema(16),
  note: z.string().max(60, '备注最多 60 字').optional(),
  accent: z.string().min(1),
  sort: z.number().int(),
  createdAt: z.number(),
});

export const WorkstationItemSchema = z.object({
  id: IdSchema,
  workstationId: IdSchema,
  refType: z.enum(['stock', 'bottle']),
  refId: IdSchema,
  plannedUseMl: z.number().min(0).max(2500),
  addedAt: z.number(),
});

export const MixRecordSchema = z.object({
  id: IdSchema,
  bottleId: IdSchema,
  neatMl: z.number().min(0),
  thinnerMl: z.number().min(0),
  ratioN: RatioNSchema,
  totalMl: z.number().min(0),
  filledToMl: z.number().min(0),
  at: z.number(),
});

export const UsageRecordSchema = z.object({
  id: IdSchema,
  targetType: z.enum(['stock', 'bottle', 'workstation']),
  targetId: IdSchema,
  amountMl: z.number().min(0),
  reason: z.enum(['paint', 'return', 'spill', 'evaporate', 'manual']).optional(),
  at: z.number(),
});

export const LedgerEntrySchema = z.object({
  id: IdSchema,
  type: z.enum(['purchase', 'mix', 'use', 'adjust', 'group', 'station', 'archive']),
  deltaMl: z.number().optional(),
  refId: IdSchema,
  at: z.number(),
  meta: z.record(z.unknown()).optional(),
});

export const SettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'auto']),
  density: z.enum(['compact', 'normal', 'comfy']),
  levelMode: LevelModeSchema,
  showTicks: z.boolean(),
  trackThinner: z.boolean(),
  defaultRatio: RatioNSchema,
  defaultBottleMl: z.number().int().min(5).max(250),
  neatStockWarn: z.boolean(),
  mlPerKit: z.number().min(0.5).max(10),
  undoDepth: z.number().int().min(3).max(20),
  confirmDestructive: z.boolean(),
  catalogMirror: z.string().min(1),
});

export const SettingsPartialSchema = SettingsSchema.partial();

export const DEFAULT_SETTINGS_VALIDATED = SettingsSchema.parse(DEFAULT_SETTINGS);

/* ------------------------------------------------------------------ */
/* 结构化校验结果（3.7.4：失败返回结构化错误而不是抛异常）              */
/* ------------------------------------------------------------------ */

export interface FieldError {
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: FieldError[] };

export function parseOrErrors<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}
