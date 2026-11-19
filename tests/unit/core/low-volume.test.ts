import { describe, expect, it } from 'vitest';
import {
  collectLowVolume,
  isLowVolume,
  isVolumeEmpty,
  LOW_VOLUME_LABEL,
  LOW_VOLUME_MESSAGE,
  LOW_VOLUME_ML,
  LOW_VOLUME_RATIO,
  lowVolumeNoticeOf,
} from '@/core/rules/low-volume';

describe('2.2 容量偏低规则：20% 或 10 ml', () => {
  it('常量与文案符合需求原文', () => {
    expect(LOW_VOLUME_RATIO).toBe(0.2);
    expect(LOW_VOLUME_ML).toBe(10);
    expect(LOW_VOLUME_LABEL).toBe('容量偏低');
    expect(LOW_VOLUME_MESSAGE).toBe('此操作后容量偏低，为防止影响你的涂装请注意。');
  });

  it('低于原有容量 20% 触发；恰好 20% 不触发', () => {
    expect(isLowVolume(12, 60)).toBe(false);
    expect(isLowVolume(11.9, 60)).toBe(true);
    expect(isLowVolume(50, 250)).toBe(false);
    expect(isLowVolume(49.9, 250)).toBe(true);
  });

  it('低于 10 ml 触发（即使占比很高）', () => {
    expect(isLowVolume(10, 40)).toBe(false);
    expect(isLowVolume(9.9, 40)).toBe(true);
    expect(isLowVolume(9.9, 10)).toBe(true);
  });

  it('0 ml 不算“偏低”：按 2.2 规则直接删除', () => {
    expect(isLowVolume(0, 60)).toBe(false);
    expect(isVolumeEmpty(0)).toBe(true);
    expect(isVolumeEmpty(0.1)).toBe(false);
  });

  it('lowVolumeNoticeOf / collectLowVolume 去重', () => {
    const notice = lowVolumeNoticeOf({ id: 's1', volumeMl: 5, initialMl: 60 });
    expect(notice).toEqual({ itemId: 's1', volumeMl: 5, initialMl: 60 });
    expect(lowVolumeNoticeOf({ id: 's2', volumeMl: 30, initialMl: 60 })).toBeNull();
    expect(collectLowVolume([notice, notice, null])).toEqual([notice]);
  });
});
