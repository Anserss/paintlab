import { flushSync } from 'react-dom';

/**
 * PAINTLAB 2.3.0 · 动效编排（终末地风味：短、硬、机械）
 *
 * 这里只放 CSS 做不了的三件事：
 * 1. 同源换页的斜切快门（View Transitions API，最快 360ms）；
 * 2. 深浅主题从切换按钮处扩散的圆形揭幕（240–600ms）；
 * 3. 关键读数「乱码后落定」（打开页面 / 数据变化时锁一次，不做循环）。
 *
 * 统一约定：
 * - 系统「减少动态效果」打开时不做任何编排，直接落到最终状态；
 * - 浏览器不支持 View Transitions 时直接切页 / 直接换主题；
 * - 只改文字节点的内容，不替换节点本身（React 仍持有同一个 text node）。
 */

const MECH = 'cubic-bezier(0.7, 0, 0.2, 1)';

interface ViewTransitionHandle {
  readonly ready: Promise<void>;
  readonly finished: Promise<void>;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransitionHandle;
};

/** 系统的「减少动态效果」是否要求停掉动效 */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function supportsViewTransition(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as ViewTransitionDocument).startViewTransition === 'function';
}

function clearViewTransitionFlag(flag: 'page' | 'theme'): void {
  const root = document.documentElement;
  if (root.dataset.efVt === flag) delete root.dataset.efVt;
}

/* 连续换页时，上一场的 finished 回调不能清掉下一场的标记 */
let pageSerial = 0;
let themeSerial = 0;

/**
 * 换页快门：新页面由一扇斜切快门从右画过（360ms mech）。
 * 不支持 View Transitions 或减少动效时，直接执行 update（无动画）。
 */
export function shutter(update: () => void): void {
  const doc = document as ViewTransitionDocument;
  if (!motionAllowed() || typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }
  const serial = ++pageSerial;
  const root = document.documentElement;
  root.dataset.efVt = 'page';
  let transition: ViewTransitionHandle;
  try {
    transition = doc.startViewTransition(() => {
      // React 18 需要 flushSync 才能让框架提交发生在回调返回之前
      flushSync(update);
    });
  } catch {
    if (serial === pageSerial) clearViewTransitionFlag('page');
    update();
    return;
  }
  const done = () => {
    if (serial === pageSerial) clearViewTransitionFlag('page');
  };
  transition.finished.then(done, done);
}

/**
 * 深浅揭幕：从 origin（视口坐标）扩散一个圆揭开新主题，约 3000px/s，240–600ms。
 * update 里改主题；不支持时直接执行 update。
 */
export async function revealTheme(
  origin: { x: number; y: number },
  update: () => Promise<void>,
): Promise<void> {
  const doc = document as ViewTransitionDocument;
  if (!motionAllowed() || typeof doc.startViewTransition !== 'function') {
    await update();
    return;
  }
  const root = document.documentElement;
  const x = Math.max(0, Math.min(window.innerWidth, origin.x));
  const y = Math.max(0, Math.min(window.innerHeight, origin.y));
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const duration = Math.max(240, Math.min(600, radius / 3));
  const serial = ++themeSerial;
  root.dataset.efVt = 'theme';
  let transition: ViewTransitionHandle;
  try {
    transition = doc.startViewTransition(async () => {
      await update();
    });
  } catch {
    if (serial === themeSerial) clearViewTransitionFlag('theme');
    await update();
    return;
  }
  try {
    await transition.ready;
    root.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration,
        easing: MECH,
        pseudoElement: '::view-transition-new(root)',
      } as unknown as KeyframeAnimationOptions,
    );
  } catch {
    /* 揭幕被跳过时按普通切换收尾，不做任何补救动画 */
  }
  const done = () => {
    if (serial === themeSerial) clearViewTransitionFlag('theme');
  };
  transition.finished.then(done, done);
}

/** 乱码后落定：数字与拉丁字母逐位锁定，汉字 / 标点 / 单位符号原样保留 */
const stand = (character: string): string => {
  if (/[0-9]/.test(character)) return String(Math.floor(Math.random() * 10));
  if (/[A-Za-z]/.test(character)) {
    return String.fromCharCode((character < 'a' ? 65 : 97) + Math.floor(Math.random() * 26));
  }
  return character;
};

interface ReadoutRun {
  frame: number;
  nodes: Text[];
  finals: string[];
  labelled: boolean;
}

const runs = new WeakMap<HTMLElement, ReadoutRun>();

/**
 * 关键读数落定（打开页面 / 数字变化时做一次，约 420–600ms）。
 * finalText 必须传这一版的真实文案：动画只改现有 text node 的内容，
 * 不创建 / 删除节点，React 的 text node 引用保持有效。
 */
export function settleReadout(el: HTMLElement, finalText: string, ms = 420): void {
  if (typeof window === 'undefined') return;
  if (!motionAllowed() || typeof requestAnimationFrame !== 'function') return;
  const previous = runs.get(el);
  const hadLabel = previous ? previous.labelled : el.hasAttribute('aria-label');
  if (previous) {
    cancelAnimationFrame(previous.frame);
    runs.delete(el);
  }
  if (!/[0-9A-Za-z]/.test(finalText)) return;

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  if (nodes.length === 0) return;

  // 把这一版真实文案写回现有节点，再从「已锁定 0 位」开始重跑
  if (nodes.length === 1) {
    nodes[0].data = finalText;
  } else {
    let cursor = 0;
    for (const node of nodes) {
      const length = node.data.length;
      node.data = finalText.slice(cursor, cursor + length);
      cursor += length;
    }
  }

  const finals = nodes.map((node) => node.data);
  const labelled = hadLabel;
  if (!labelled) el.setAttribute('aria-label', finalText.trim());
  const started = performance.now();
  const run: ReadoutRun = { frame: 0, nodes, finals, labelled };
  runs.set(el, run);

  const step = (now: number): void => {
    const progress = Math.min(1, (now - started) / ms);
    let locked = Math.floor(progress * finalText.length);
    nodes.forEach((node, index) => {
      const final = finals[index];
      const keep = Math.max(0, Math.min(final.length, locked));
      const spinning = final
        .slice(keep)
        .split('')
        .map((character) => stand(character))
        .join('');
      node.data = final.slice(0, keep) + spinning;
      locked -= final.length;
    });
    if (progress < 1) {
      run.frame = requestAnimationFrame(step);
      return;
    }
    nodes.forEach((node, index) => {
      node.data = finals[index];
    });
    if (!labelled) el.removeAttribute('aria-label');
    runs.delete(el);
  };

  run.frame = requestAnimationFrame(step);
}
