/**
 * verify-motion.mjs —— 2.3.0 动效验收（Playwright + 本地 dev server）
 *
 *   npm run dev                       # 先起 dev server（5175）
 *   node scripts/verify-motion.mjs    # 可选 --url http://localhost:5175
 *
 * 检查项（只在浏览器里成立，单测覆盖不到）：
 *   1. 动效类真的挂在元素上，且打开应用时三色条 / 页面通电 / 逐行亮起都跑过；
 *   2. 换页快门走 View Transition，并在 1s 内清掉 data-ef-vt；
 *   3. 深浅切换从按钮扩散（View Transition），data-theme 变且无残留；
 *   4. 弹层打开有 ef-dialog-in 动画，关闭会等退出动画再卸载；
 *   5. 减少动态效果：不跑任何入场动画，内容仍然完整可见；
 *   6. 手机 390 宽没有横向溢出；
 *   7. 截图留在 reports/shots/2-3-0-*.png。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PAINTLAB_URL ?? 'http://localhost:5175';
const OUT = 'reports/shots';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name + (detail ? ' · ' + detail : ''));
};

const RECORDER = () => {
  window.__efAnimations = [];
  window.__efTransitions = [];
  window.__efReadout = '';
  document.addEventListener(
    'animationstart',
    (event) => window.__efAnimations.push(event.animationName ?? 'unknown'),
    true,
  );
  const original = document.startViewTransition?.bind(document);
  if (original) {
    document.startViewTransition = (callback) => {
      window.__efTransitions.push(document.documentElement.dataset.efVt ?? 'unset');
      return original(callback);
    };
  }
  const watchReadout = () => {
    if (!document.documentElement) return;
    new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target;
        if (
          element instanceof HTMLElement &&
          element.closest('[data-slot="stock-total"]') &&
          element.hasAttribute('aria-label')
        ) {
          window.__efReadout = element.getAttribute('aria-label') ?? '';
        }
      }
    }).observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-label'],
    });
  };
  if (document.documentElement) watchReadout();
  else document.addEventListener('DOMContentLoaded', watchReadout, { once: true });
};

const animations = (page) => page.evaluate(() => window.__efAnimations ?? []);
const transitions = (page) => page.evaluate(() => window.__efTransitions ?? []);
const clear = (page) => page.evaluate(() => ((window.__efAnimations = []), (window.__efTransitions = [])));

const browser = await chromium.launch();
try {
  /* ---------------- 1. 桌面：打开、换页、主题、弹层 ---------------- */
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await desktop.addInitScript(RECORDER);
  const page = await desktop.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(BASE + '/procure', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-paint-row]', { timeout: 15000 });

  const version = (await page.textContent('.ef-cmd__version')) ?? '';
  check('版本角标 2.3.0', version.includes('2.3.0'), version.trim());

  const shell = await page.evaluate(() => ({
    tristrip: document.querySelector('.ef-tristrip')?.classList.contains('ef-in-sweep') ?? false,
    boot: document.querySelector('main')?.classList.contains('ef-page-boot') ?? false,
  }));
  const bootAnimations = await animations(page);
  check('外壳动效类挂载', shell.tristrip && shell.boot, JSON.stringify(shell));
  check(
    '打开应用：三色条扫过 + 页面通电 + 逐行亮起',
    bootAnimations.includes('ef-sweep') && bootAnimations.includes('ef-power') && bootAnimations.includes('ef-come'),
    bootAnimations.join(','),
  );
  const readout = await page.evaluate(() => window.__efReadout ?? '');
  check('状态条主读数：打开时乱码后落定一次', readout.length > 0, readout);
  await page.screenshot({ path: OUT + '/2-3-0-procure-loaded.png' });

  /* 换品牌：结果区重建 → 逐行亮起 */
  await clear(page);
  await page.click('[data-procure-brands] [data-brand-row="jy"]');
  await page.waitForTimeout(250);
  const brandAnimations = await animations(page);
  check('换品牌：结果逐行亮起', brandAnimations.includes('ef-come'), brandAnimations.join(','));
  await page.waitForTimeout(900);

  /* 按钮悬停：亮边扫过 */
  await clear(page);
  await page.hover('button:has-text("+ 入库")');
  await page.waitForTimeout(120);
  const hoverAnimations = await animations(page);
  check('按钮悬停：亮边扫过（ef-edge）', hoverAnimations.includes('ef-edge'), hoverAnimations.join(','));
  await page.mouse.move(4, 700);

  /* 慢速截图：逐行亮起的中段 */
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ef-dur-come', '1600ms');
    document.documentElement.style.setProperty('--ef-dur-power', '1600ms');
  });
  await page.click('[data-procure-brands] [data-brand-row="tamiya"]');
  await page.waitForTimeout(420);
  await page.screenshot({ path: OUT + '/2-3-0-rows-enter-mid.png' });
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--ef-dur-come');
    document.documentElement.style.removeProperty('--ef-dur-power');
  });
  await page.waitForTimeout(400);

  /* 深浅切换：圆形揭幕 */
  await clear(page);
  await page.click('.ef-cmd__icon');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 5000 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: OUT + '/2-3-0-theme-reveal.png' });
  const themeTransitions = await transitions(page);
  check('深浅切换走 View Transition（theme）', themeTransitions.includes('theme'), themeTransitions.join(','));
  await page.waitForTimeout(900);
  const leftover = await page.evaluate(() => document.documentElement.dataset.efVt ?? '');
  check('揭幕结束后 data-ef-vt 已清理', leftover === '', leftover);
  await page.screenshot({ path: OUT + '/2-3-0-dark.png' });

  /* 换页：斜切快门 */
  await clear(page);
  await page.click('nav[aria-label="一级导航"] a[href="/depot"]');
  await page.waitForSelector('[data-page="depot"]', { timeout: 5000 });
  const pageTransitions = await transitions(page);
  check('换页走 View Transition（page）', pageTransitions.includes('page'), pageTransitions.join(','));
  await page.waitForTimeout(900);
  const pageLeftover = await page.evaluate(() => document.documentElement.dataset.efVt ?? '');
  check('快门结束后 data-ef-vt 已清理', pageLeftover === '', pageLeftover);

  /* 弹层：打开有通电动画，关闭等退出动画 */
  await page.click('nav[aria-label="一级导航"] a[href="/procure"]');
  await page.waitForSelector('[data-paint-row]');
  await clear(page);
  await page.click('button:has-text("+ 入库")');
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  const dialogAnimation = await page.evaluate(
    () => getComputedStyle(document.querySelector('.ef-dialog')).animationName,
  );
  check('弹层打开：ef-dialog-in', dialogAnimation === 'ef-dialog-in', dialogAnimation);
  await page.waitForTimeout(120);
  await page.screenshot({ path: OUT + '/2-3-0-dialog.png' });
  await page.keyboard.press('Escape');
  const dialogClosedSlow = await page.evaluate(async () => {
    const start = performance.now();
    while (document.querySelector('[role="dialog"]') && performance.now() - start < 2000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return performance.now() - start;
  });
  check('弹层关闭：保留到退出动画播完（≥ 120ms）', dialogClosedSlow >= 120, dialogClosedSlow.toFixed(0) + 'ms');
  const dialogAnimations = await animations(page);
  check('弹层关闭：ef-dialog-out', dialogAnimations.includes('ef-dialog-out'), dialogAnimations.join(','));
  await page.waitForTimeout(500);

  /* 状态条回执：从左擦入，4.2s 后向右擦掉再卸载 */
  await clear(page);
  await page.click('button:has-text("+ 入库")');
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  await page.click('[role="dialog"] button:has-text("确认入库")');
  await page.waitForSelector('[data-slot="message"]', { timeout: 5000 });
  await page.waitForTimeout(150);
  const messageAnimations = await animations(page);
  check('状态条回执：从左擦入（ef-wipe-in）', messageAnimations.includes('ef-wipe-in'), messageAnimations.join(','));
  const wipedOut = await page
    .waitForFunction(() => (window.__efAnimations ?? []).includes('ef-wipe-out'), null, { timeout: 9000 })
    .then(() => true)
    .catch(() => false);
  check('状态条回执：停留后向右擦掉（ef-wipe-out）', wipedOut, '');
  await page.waitForTimeout(400);
  const messageGone = await page.evaluate(() => !document.querySelector('[data-slot="message"]'));
  check('状态条回执：退出后卸载', messageGone, '');

  /* 详情抽屉：从右推入 / 关闭先播退出 */
  await page.click('nav[aria-label="一级导航"] a[href="/depot"]');
  await page.waitForSelector('[data-page="depot"]');
  await page.waitForSelector('[data-depot-row]', { timeout: 8000 });
  await clear(page);
  const depotRow = page.locator('[data-depot-row]').first();
  await depotRow.hover();
  await depotRow.locator('button[aria-label="详情"]').click();
  await page.waitForSelector('[data-paint-detail]', { timeout: 5000 });
  const drawerAnimation = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-paint-detail]')).animationName,
  );
  check('详情抽屉：从右推入（ef-drawer-in）', drawerAnimation === 'ef-drawer-in', drawerAnimation);
  await page.waitForTimeout(120);
  await page.screenshot({ path: OUT + '/2-3-0-drawer.png' });
  await page.click('[data-paint-detail] button[aria-label="关闭详情"]');
  const drawerClosing = await page.evaluate(
    () => document.querySelector('[data-paint-detail]')?.classList.contains('is-closing') ?? false,
  );
  check('详情抽屉：关闭先播退出（is-closing）', drawerClosing, '');
  const drawerGone = await page
    .waitForFunction(() => !document.querySelector('[data-paint-detail]'), null, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  check('详情抽屉：退出后卸载', drawerGone, '');

  check('桌面：无 console / pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();

  /* ---------------- 2. 减少动态效果 ---------------- */
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await reduced.addInitScript(RECORDER);
  const calm = await reduced.newPage();
  const calmErrors = [];
  calm.on('pageerror', (error) => calmErrors.push(String(error)));
  await calm.goto(BASE + '/procure', { waitUntil: 'domcontentloaded' });
  await calm.waitForSelector('[data-paint-row]', { timeout: 15000 });
  await calm.waitForTimeout(300);
  const calmState = await calm.evaluate(() => {
    const first = document.querySelector('[data-paint-row]');
    const style = first ? getComputedStyle(first) : null;
    return {
      animations: window.__efAnimations ?? [],
      rowOpacity: style?.opacity ?? 'missing',
      rowClip: style?.clipPath ?? 'missing',
      mainClip: getComputedStyle(document.querySelector('main')).clipPath,
      rowCount: document.querySelectorAll('[data-paint-row]').length,
    };
  });
  check(
    '减少动态效果：不跑入场动画',
    !calmState.animations.some((name) => name === 'ef-sweep' || name === 'ef-power' || name === 'ef-come'),
    calmState.animations.join(','),
  );
  check(
    '减少动态效果：内容完整可见',
    calmState.rowOpacity === '1' && calmState.rowClip === 'none' && calmState.mainClip === 'none',
    JSON.stringify(calmState),
  );
  await calm.screenshot({ path: OUT + '/2-3-0-reduced-motion.png' });
  check('减少动态效果：无 pageerror', calmErrors.length === 0, calmErrors.join(' | '));
  await reduced.close();

  /* ---------------- 3. 手机宽度 ---------------- */
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await mobile.newPage();
  await phone.goto(BASE + '/procure', { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('[data-paint-row]', { timeout: 15000 });
  const overflow = await phone.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  check(
    '手机 390 宽：无横向溢出',
    overflow.scroll <= overflow.client && overflow.bodyScroll <= overflow.client,
    JSON.stringify(overflow),
  );
  await phone.screenshot({ path: OUT + '/2-3-0-mobile-390.png' });
  await mobile.close();
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过');
if (failed.length > 0) {
  console.error('未通过：' + failed.map((result) => result.name).join(' / '));
  process.exitCode = 1;
}
