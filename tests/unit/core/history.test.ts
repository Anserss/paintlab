import { describe, expect, it } from 'vitest';
import { CommandHistory, DEFAULT_UNDO_DEPTH, MAX_UNDO_DEPTH, MIN_UNDO_DEPTH } from '@/core/history/history';
import { createCommand, mergeCommands, newId, patch } from '@/core/history/command';
import type { Command } from '@/core/model/types';

const cmd = (label: string): Command => createCommand('use', label, [], [], 1);
const labels = (list: Command[]): string[] => list.map((c) => c.label);

/** spec 5.3 (1140-1170) / 3.6 / 7.1 AC-10 / 7.2 history.test */
describe('history · 深度 3 丢最旧（3+3）', () => {
  it('连续 5 次操作后只保留最近 3 步', () => {
    const h = new CommandHistory(3);
    for (const label of ['c1', 'c2', 'c3', 'c4', 'c5']) h.record(cmd(label));
    expect(h.undoCount).toBe(3);
    expect(h.undoLabel).toBe('c5');
    expect(labels(h.peekUndo())).toEqual(['c5', 'c4', 'c3']);
  });

  it('默认深度为 3 且常量与 spec 2.4 I8 一致', () => {
    expect(DEFAULT_UNDO_DEPTH).toBe(3);
    expect(MIN_UNDO_DEPTH).toBe(3);
    expect(MAX_UNDO_DEPTH).toBe(20);
    expect(new CommandHistory().undoDepth).toBe(3);
    expect(new CommandHistory(1).undoDepth).toBe(3);
  });
});

describe('history · 新动作清空 redo', () => {
  it('undo 后 record 清空重做栈', () => {
    const h = new CommandHistory(3);
    h.record(cmd('c1'));
    h.record(cmd('c2'));
    expect(h.undo()).not.toBeNull();
    expect(h.redoCount).toBe(1);
    h.record(cmd('c3'));
    expect(h.redoCount).toBe(0);
    expect(h.undoCount).toBe(2);
    expect(h.redoLabel).toBeNull();
  });
});

describe('history · undo / redo 计数（AC-10）', () => {
  it('AC-10：撤销 3 次后按钮禁用，反撤销 3 次完全恢复', () => {
    const h = new CommandHistory(3);
    for (const label of ['c1', 'c2', 'c3', 'c4', 'c5']) h.record(cmd(label));

    expect(h.undo()?.label).toBe('c5');
    expect(h.undo()?.label).toBe('c4');
    expect(h.undo()?.label).toBe('c3');
    expect(h.undoCount).toBe(0);
    expect(h.redoCount).toBe(3);
    expect(h.undo()).toBeNull();

    expect(h.redo()?.label).toBe('c3');
    expect(h.redo()?.label).toBe('c4');
    expect(h.redo()?.label).toBe('c5');
    expect(h.undoCount).toBe(3);
    expect(h.redoCount).toBe(0);
    expect(h.redo()).toBeNull();
  });

  it('空栈返回 null 且计数不变', () => {
    const h = new CommandHistory(3);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(h.undoCount).toBe(0);
    expect(h.redoCount).toBe(0);
    expect(h.undoLabel).toBeNull();
  });

  it('redo 把命令放回 undo 栈顶', () => {
    const h = new CommandHistory(3);
    h.record(cmd('c1'));
    h.undo();
    h.redo();
    expect(h.undoLabel).toBe('c1');
    expect(h.redoCount).toBe(0);
  });
});

describe('history · cancelUndo / cancelRedo 指针回滚（3.6 R4）', () => {
  it('cancelUndo 把命令退回 undo 栈', () => {
    const h = new CommandHistory(3);
    h.record(cmd('c1'));
    const popped = h.undo();
    expect(popped?.label).toBe('c1');
    h.cancelUndo();
    expect(h.undoCount).toBe(1);
    expect(h.redoCount).toBe(0);
    expect(h.undoLabel).toBe('c1');
  });

  it('cancelRedo 把命令退回 redo 栈', () => {
    const h = new CommandHistory(3);
    h.record(cmd('c1'));
    h.undo();
    const redone = h.redo();
    expect(redone?.label).toBe('c1');
    h.cancelRedo();
    expect(h.undoCount).toBe(0);
    expect(h.redoCount).toBe(1);
    expect(h.redoLabel).toBe('c1');
  });

  it('空栈调用 cancel 不抛错且计数自洽', () => {
    const h = new CommandHistory(3);
    h.record(cmd('c1'));
    h.cancelUndo();
    expect(h.undoCount).toBe(1);
    h.cancelRedo();
    expect(h.undoCount).toBe(0);
    expect(h.redoCount).toBe(1);
  });
});

describe('history · setDepth 钳制 3–20（spec 3.9 udnoDepth 范围）', () => {
  it('越界被钳制', () => {
    const h = new CommandHistory(3);
    h.setDepth(2);
    expect(h.undoDepth).toBe(3);
    h.setDepth(25);
    expect(h.undoDepth).toBe(20);
    h.setDepth(99);
    expect(h.undoDepth).toBe(20);
  });

  it('取整并保留合法值', () => {
    const h = new CommandHistory(3);
    h.setDepth(4.4);
    expect(h.undoDepth).toBe(4);
    h.setDepth(10);
    expect(h.undoDepth).toBe(10);
  });

  it('收缩深度时丢弃最旧记录', () => {
    const h = new CommandHistory(5);
    for (const label of ['c1', 'c2', 'c3', 'c4', 'c5']) h.record(cmd(label));
    expect(h.undoCount).toBe(5);
    h.setDepth(3);
    expect(h.undoCount).toBe(3);
    expect(h.undoLabel).toBe('c5');
    expect(labels(h.peekUndo())).toEqual(['c5', 'c4', 'c3']);
  });
});

describe('history · restore / clear（AC-14）', () => {
  it('restore 只恢复最近 depth 条', () => {
    const h = new CommandHistory(3);
    h.restore([cmd('c1'), cmd('c2'), cmd('c3'), cmd('c4'), cmd('c5')], []);
    expect(h.undoCount).toBe(3);
    expect(h.undoLabel).toBe('c5');
    expect(labels(h.peekUndo())).toEqual(['c5', 'c4', 'c3']);
  });

  it('restore 同时恢复 redo 栈', () => {
    const h = new CommandHistory(3);
    h.restore([], [cmd('r1'), cmd('r2')]);
    expect(h.redoCount).toBe(2);
    expect(h.redoLabel).toBe('r2');
    expect(h.undoCount).toBe(0);
  });

  it('clear 清空两栈', () => {
    const h = new CommandHistory(3);
    h.record(cmd('c1'));
    h.undo();
    h.clear();
    expect(h.undoCount).toBe(0);
    expect(h.redoCount).toBe(0);
    expect(h.undoLabel).toBeNull();
    expect(h.redoLabel).toBeNull();
  });
});

describe('command · 命令与补丁构造（spec 5.3:1176-1180）', () => {
  it('createCommand 生成唯一 id 与给定字段', () => {
    const a = createCommand('mix', '调配', [], [], 1234);
    const b = createCommand('mix', '调配', [], [], 1234);
    expect(a.id).not.toBe(b.id);
    expect(a.type).toBe('mix');
    expect(a.label).toBe('调配');
    expect(a.at).toBe(1234);
  });

  it('newId 带前缀且单调唯一', () => {
    const ids = new Set([newId('cmd'), newId('cmd'), newId('stock')]);
    expect(ids.size).toBe(3);
    expect(newId('stock').startsWith('stock-')).toBe(true);
  });

  it('mergeCommands 合并 forward 顺序、倒序 inverse（3.6 R5）', () => {
    const c1 = createCommand('use', 'a', [patch.remove('stockItems', 's1')], [patch.add('stockItems', { id: 's1' })]);
    const c2 = createCommand('use', 'b', [patch.remove('stockItems', 's2')], [patch.add('stockItems', { id: 's2' })]);
    const merged = mergeCommands('batch', '批量', [c1, c2]);
    expect(merged.type).toBe('batch');
    expect(merged.label).toBe('批量');
    expect(merged.forward).toHaveLength(2);
    expect(merged.forward[0]).toEqual(patch.remove('stockItems', 's1'));
    expect(merged.forward[1]).toEqual(patch.remove('stockItems', 's2'));
    expect(merged.inverse[0]).toEqual(patch.add('stockItems', { id: 's2' }));
    expect(merged.inverse[1]).toEqual(patch.add('stockItems', { id: 's1' }));
  });

  it('patch 工厂构造四种补丁', () => {
    expect(patch.replace('bottles', 'b1', 'remainingMl', 40)).toEqual({
      op: 'replace',
      collection: 'bottles',
      id: 'b1',
      path: 'remainingMl',
      value: 40,
    });
    expect(patch.add('ledger', { id: 'l1' })).toEqual({ op: 'add', collection: 'ledger', doc: { id: 'l1' } });
    expect(patch.append('usageRecords', { id: 'u1' })).toEqual({
      op: 'append',
      collection: 'usageRecords',
      doc: { id: 'u1' },
    });
    expect(patch.remove('groups', 'g1')).toEqual({ op: 'remove', collection: 'groups', id: 'g1' });
  });
});
