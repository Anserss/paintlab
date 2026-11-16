import { describe, expect, it } from 'vitest';
import {
  BOTTLE,
  fractionLabel,
  isEmptyBottle,
  isBelowOneTick,
  isLowStock,
  levelBubble,
  levelFraction,
  levelReading,
  liquidHeight,
  quantizeLevel,
  quantizedLiquidHeight,
} from '@/core/render/bottle';

/** spec 5.3 (1088-1114) / 3.4.4 (474-507) / 7.1 AC-03 */
describe('bottle · 几何常量', () => {
  it('内腔高度与刻度数符合 spec 5.3:1088', () => {
    expect(BOTTLE.innerHeight).toBe(212);
    expect(BOTTLE.ticks).toBe(12);
    expect(BOTTLE.innerBottom - BOTTLE.innerTop).toBe(212);
    expect(BOTTLE.infoBar).toBe(56);
    expect(BOTTLE.viewBox).toEqual({ width: 240, height: 380 });
  });
});

describe('bottle · levelFraction 两种模式（spec 3.4.4:482-497）', () => {
  it('baseline 模式：R/L = 40/60', () => {
    expect(levelFraction(40, 60, 60, 'baseline')).toBeCloseTo(2 / 3, 10);
  });

  it('capacity 模式：R/C = 40/100', () => {
    expect(levelFraction(40, 60, 100, 'capacity')).toBe(0.4);
  });

  it('L = C 时两模式完全一致（默认工作流常态）', () => {
    expect(levelFraction(40, 60, 60, 'baseline')).toBe(
      levelFraction(40, 60, 60, 'capacity'),
    );
  });

  it('clamp 到 [0,1]：过量余量与负余量', () => {
    expect(levelFraction(80, 60, 100, 'baseline')).toBe(1);
    expect(levelFraction(-5, 60, 100, 'baseline')).toBe(0);
    expect(levelFraction(0, 60, 100, 'baseline')).toBe(0);
  });

  it('baseline = 0 时不除零（分母取 0.1 下限）', () => {
    expect(levelFraction(10, 0, 100, 'baseline')).toBe(1);
    expect(levelFraction(0, 0, 100, 'baseline')).toBe(0);
  });

  it('capacity = 0 时返回 0 而不是 Infinity/NaN', () => {
    expect(levelFraction(10, 60, 0, 'capacity')).toBe(0);
  });
});

describe('bottle · quantizeLevel 吸附到 1/12', () => {
  it('quantizeLevel(0.6667) 吸附到 8/12', () => {
    expect(quantizeLevel(0.6667)).toBe(8 / 12);
    expect(quantizeLevel(0.6667)).toBeCloseTo(0.6667, 4);
  });

  it('端点与钳制', () => {
    expect(quantizeLevel(0)).toBe(0);
    expect(quantizeLevel(1)).toBe(1);
    expect(quantizeLevel(1.4)).toBe(1);
    expect(quantizeLevel(-0.5)).toBe(0);
  });

  it('吸附结果必为 1/12 的整数倍', () => {
    for (const f of [0.03, 0.1, 0.42, 0.75, 0.97]) {
      expect(quantizeLevel(f) * 12).toBeCloseTo(Math.round(quantizeLevel(f) * 12), 9);
    }
  });
});

describe('bottle · liquidHeight 液面像素高', () => {
  it('AC-03: liquidHeight(0.6667) === 141（round(0.6667 × 212)）', () => {
    expect(liquidHeight(0.6667)).toBe(141);
  });

  it('满液位 = 内腔高度，空 = 0', () => {
    expect(liquidHeight(0)).toBe(0);
    expect(liquidHeight(1)).toBe(212);
  });

  it('越界钳制到 [0, innerHeight]', () => {
    expect(liquidHeight(1.5)).toBe(212);
    expect(liquidHeight(-1)).toBe(0);
  });

  it('quantizedLiquidHeight 用吸附值绘制', () => {
    expect(quantizedLiquidHeight(0.6667)).toBe(141);
    expect(quantizedLiquidHeight(0.02)).toBe(0);
  });
});

describe('bottle · fractionLabel 分数读数（spec 5.3:1107-1114）', () => {
  it('0 / 1 / 1-2 / 5-12 全档', () => {
    expect(fractionLabel(0)).toBe('0');
    expect(fractionLabel(1)).toBe('1');
    expect(fractionLabel(0.5)).toBe('1/2');
    expect(fractionLabel(5 / 12)).toBe('5/12');
  });

  it('quantizeLevel 后的用户示例 = 2/3', () => {
    expect(fractionLabel(quantizeLevel(0.6667))).toBe('2/3');
    expect(fractionLabel(0.6667)).toBe('2/3');
  });

  it('常见刻度全部约分', () => {
    expect(fractionLabel(0.25)).toBe('1/4');
    expect(fractionLabel(0.75)).toBe('3/4');
    expect(fractionLabel(1 / 12)).toBe('1/12');
    expect(fractionLabel(7 / 12)).toBe('7/12');
  });

  it('接近 1 的值向上取整为满分', () => {
    expect(fractionLabel(0.9999)).toBe('1');
  });
});

describe('bottle · 读数文案（AC-03 与 3.4.4:488）', () => {
  it('AC-03: levelReading(2/3) === "≈ 2/3（67%）"', () => {
    expect(levelReading(2 / 3)).toBe('≈ 2/3（67%）');
  });

  it('空瓶与满瓶文案', () => {
    expect(levelReading(0)).toBe('≈ 0（0%）');
    expect(levelReading(1)).toBe('≈ 1（100%）');
  });

  it('气泡文案：≈67% · 40.0/60.0 ml', () => {
    expect(levelBubble(40, 60, 2 / 3)).toBe('≈67% · 40.0/60.0 ml');
  });
});

describe('bottle · 边界状态（3.4.4:501-505）', () => {
  it('isBelowOneTick 只在 (0, 1/12) 内为真', () => {
    expect(isBelowOneTick(0)).toBe(false);
    expect(isBelowOneTick(1 / 12)).toBe(false);
    expect(isBelowOneTick(0.05)).toBe(true);
    expect(isBelowOneTick(0.2)).toBe(false);
  });

  it('isEmptyBottle 以 0 为界', () => {
    expect(isEmptyBottle(0)).toBe(true);
    expect(isEmptyBottle(-1)).toBe(true);
    expect(isEmptyBottle(0.1)).toBe(false);
  });

  it('isLowStock 阈值为初值的 15%', () => {
    expect(isLowStock(8, 60)).toBe(true);
    expect(isLowStock(9, 60)).toBe(false);
    expect(isLowStock(0, 60)).toBe(true);
    expect(isLowStock(5, 0)).toBe(false);
  });
});
