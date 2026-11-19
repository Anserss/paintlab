// 通过 CDP 给运行中的 PAINTLAB（或任意 Chromium 页面）截图 / 求值
// 用法：node scripts/devtools-shot.mjs <ws-url> <url> <out.png> [expression]
import fs from 'node:fs';

const [wsUrl, targetUrl, outFile, expressionArg] = process.argv.slice(2);
if (!wsUrl || !targetUrl || !outFile) {
  console.error('用法: node scripts/devtools-shot.mjs <ws-url> <url> <out.png> [expression|@expression-file]');
  process.exit(1);
}
const expression = expressionArg?.startsWith('@')
  ? fs.readFileSync(expressionArg.slice(1), 'utf8')
  : expressionArg;

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();

const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

await call('Page.enable');
await call('Runtime.enable');
await call('Page.navigate', { url: targetUrl });
// 等待应用完成首次渲染与数据引导
await new Promise((resolve) => setTimeout(resolve, 2500));

const results = {};
if (expression) {
  const evaluation = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  results.expression = evaluation.result?.value ?? evaluation.result?.description ?? null;
}
const metrics = await call('Runtime.evaluate', {
  expression:
    'JSON.stringify({title: document.title, page: document.querySelector("[data-page]")?.getAttribute("data-page") ?? null, width: innerWidth, height: innerHeight, platform: Boolean(window.platform?.isDesktop), bodyHeight: document.body.scrollHeight, dbs: null})',
  awaitPromise: true,
  returnByValue: true,
});
try {
  results.metrics = JSON.parse(metrics.result.value);
} catch {
  results.metrics = { raw: metrics.result?.value };
}
const databases = await call('Runtime.evaluate', {
  expression: 'indexedDB.databases().then((list) => list.map((db) => db.name + ":" + db.version))',
  awaitPromise: true,
  returnByValue: true,
});
results.databases = databases.result?.value ?? null;

const shot = await call('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify(results, null, 2));
ws.close();
