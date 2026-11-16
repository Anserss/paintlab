// 打包桌面版（确定性装配，不依赖 electron-packager 的下载/解压步骤）：
// 1) 用 npm 已安装好的 Electron 运行时（node_modules/electron/dist）铺到 release/PIGMENT-DEPOT
// 2) 把 dist + main.cjs 打成 resources/app.asar
// 3) 重命名 exe，并用 rcedit 写入图标与版本信息（可选，rcedit 缺失时跳过）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const stage = path.join(root, 'desktop-build');
const releaseRoot = path.join(root, 'release');
const appDir = path.join(releaseRoot, 'PIGMENT-DEPOT');
const appName = 'PIGMENT-DEPOT';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) fail('缺少 dist/index.html，请先执行 npm run build');
if (!fs.existsSync(path.join(root, 'build', 'icon.ico'))) fail('缺少 build/icon.ico，请先执行 node scripts/make-icon.mjs');
if (!fs.existsSync(path.join(electronDist, 'electron.exe')))
  fail('缺少 Electron 运行时，请先执行 npm i -D electron（失败时可用 npm i -D electron --ignore-scripts 后重装）');

// 1) staging：只有运行期需要的文件
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'desktop', 'main.cjs'), path.join(stage, 'main.cjs'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
fs.writeFileSync(
  path.join(stage, 'package.json'),
  JSON.stringify(
    { name: 'pigment-depot', productName: appName, version, main: 'main.cjs', license: 'MIT', author: 'PIGMENT DEPOT' },
    null,
    2,
  ),
);

// 2) 运行时铺开 + asar
fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(path.join(appDir, 'resources'), { recursive: true });
fs.cpSync(electronDist, appDir, { recursive: true });
fs.rmSync(path.join(appDir, 'electron.exe'), { force: true });
fs.rmSync(path.join(appDir, 'resources', 'default_app.asar'), { force: true });
await asar.createPackage(stage, path.join(appDir, 'resources', 'app.asar'));

// 3) exe 改名 + 图标/版本信息
const exePath = path.join(appDir, appName + '.exe');
fs.copyFileSync(path.join(electronDist, 'electron.exe'), exePath);
try {
  const rcedit = require('rcedit');
  await rcedit(exePath, {
    icon: path.join(root, 'build', 'icon.ico'),
    'file-version': version,
    'product-version': version,
    'version-string': {
      CompanyName: 'PIGMENT DEPOT',
      FileDescription: 'PIGMENT DEPOT · 漆料资产与调漆工作台',
      ProductName: 'PIGMENT DEPOT',
      OriginalFilename: appName + '.exe',
      LegalCopyright: 'MIT',
    },
  });
  console.log('已写入图标与版本信息');
} catch (error) {
  console.warn('rcedit 不可用，保留 Electron 默认图标：' + error.message);
}

console.log('\n启动器: ' + exePath);
