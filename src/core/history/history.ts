import type { Command } from '../model/types';

export const DEFAULT_UNDO_DEPTH = 3;
export const MIN_UNDO_DEPTH = 3;
export const MAX_UNDO_DEPTH = 20;

/**
 * 撤销 / 反撤销（3 + 3，spec 3.6 R1–R8）。
 * 纯内存栈；持久化由 data 层负责（commands 表）。
 */
export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(private depth: number = DEFAULT_UNDO_DEPTH) {
    this.depth = Math.min(MAX_UNDO_DEPTH, Math.max(MIN_UNDO_DEPTH, Math.round(depth)));
  }

  setDepth(depth: number): void {
    this.depth = Math.min(MAX_UNDO_DEPTH, Math.max(MIN_UNDO_DEPTH, Math.round(depth)));
    while (this.undoStack.length > this.depth) this.undoStack.shift();
    while (this.redoStack.length > this.depth) this.redoStack.shift();
  }

  get undoDepth(): number {
    return this.depth;
  }

  /** R1：新动作入栈，超深丢最旧，清空 redo */
  record(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.depth) this.undoStack.shift();
    this.redoStack = [];
  }

  /** R2：取栈顶，交给调用方应用 inverse 后调用 confirmUndo；此处先移动指针 */
  undo(): Command | null {
    const cmd = this.undoStack.pop() ?? null;
    if (!cmd) return null;
    this.redoStack.push(cmd);
    if (this.redoStack.length > this.depth) this.redoStack.shift();
    return cmd;
  }

  /** R3 */
  redo(): Command | null {
    const cmd = this.redoStack.pop() ?? null;
    if (!cmd) return null;
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.depth) this.undoStack.shift();
    return cmd;
  }

  /** 撤销应用失败时回滚指针（3.6 R4） */
  cancelUndo(): void {
    const cmd = this.redoStack.pop();
    if (cmd) this.undoStack.push(cmd);
  }

  cancelRedo(): void {
    const cmd = this.undoStack.pop();
    if (cmd) this.redoStack.push(cmd);
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  /** 历史面板：最近 N 条（3.6 / 9.5） */
  peekUndo(): Command[] {
    return this.undoStack.slice().reverse();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** 从持久化恢复（AC-14） */
  restore(undo: Command[], redo: Command[]): void {
    this.undoStack = undo.slice(-this.depth);
    this.redoStack = redo.slice(-this.depth);
  }
}

export const history = new CommandHistory(DEFAULT_UNDO_DEPTH);
