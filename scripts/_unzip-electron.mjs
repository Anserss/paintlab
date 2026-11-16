import extract from 'extract-zip';
import fs from 'node:fs';
import path from 'node:path';
const zip = fs.readdirSync('.tmpbuild').filter((d) => d.startsWith('electron-download-'))
  .map((d) => path.join('.tmpbuild', d, fs.readdirSync(path.join('.tmpbuild', d)).find((f) => f.endsWith('.zip'))))
  .filter(Boolean)[0];
if (!zip) { console.error('no zip'); process.exit(1); }
const dest = path.resolve('.tmpbuild/electron-dist');
fs.rmSync(dest, { recursive: true, force: true });
console.log('extracting ' + zip + ' -> ' + dest);
await extract(path.resolve(zip), { dir: dest });
console.log('done: ' + fs.readdirSync(dest).join(', '));
