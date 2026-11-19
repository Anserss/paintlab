// 通过 CDP 对页面求值并优雅关闭（Electron 会走 close 事件，保存窗口状态）
// 用法：node scripts/devtools-close.mjs <ws-url> [expression]
import fs from 'node:fs';

const wsUrl = process.argv[2];
const expression = process.argv[3]?.startsWith('@')
  ? fs.readFileSync(process.argv[3].slice(1), 'utf8')
  : process.argv[3];
if (!wsUrl) {
  console.error('用法: node scripts/devtools-close.mjs <ws-url> [expression|@file]');
  process.exit(1);
}

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
await call('Runtime.enable');
if (expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(result.result?.value ?? result.result?.description ?? null));
}
// Browser.close 会直接断开连接：发出去后不等待结果，避免 unsettled await
ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
await new Promise((resolve) => setTimeout(resolve, 600));
ws.close();
