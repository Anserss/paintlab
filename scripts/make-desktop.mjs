// 构建桌面版：dist + Electron 运行时 → %LOCALAPPDATA%\Programs\PAINTLAB
// 用法：npm run desktop（先 build:desktop，再执行本脚本）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const appSource = path.join(root, 'desktop', 'electron');
const runtimeSource = path.join(root, 'desktop', 'electron-runtime');
const installRoot = path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '.', 'AppData', 'Local'), 'Programs');
const installDir = path.join(installRoot, 'PAINTLAB');
const iconSource = path.join(root, 'build', 'icon.ico');

const log = (message) => console.log('[desktop] ' + message);

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('[desktop] 缺少 dist/index.html；请先运行 npm run build:desktop');
  process.exit(1);
}

/** 找到可复用的 Electron 运行时：项目内优先，其次本机 electron 缓存 zip */
function ensureRuntime() {
  if (fs.existsSync(path.join(runtimeSource, 'electron.exe'))) return runtimeSource;
  const cacheRoot = path.join(process.env.LOCALAPPDATA ?? '', 'electron', 'Cache');
  let zip = null;
  if (fs.existsSync(cacheRoot)) {
    const candidates = [];
    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(cacheRoot, entry.name);
      for (const file of fs.readdirSync(dir)) {
        if (/^electron-v\d+\.\d+\.\d+-win32-x64\.zip$/.test(file)) {
          candidates.push({ file: path.join(dir, file), version: file.match(/v(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number) });
        }
      }
    }
    candidates.sort((a, b) => b.version[0] - a.version[0] || b.version[1] - a.version[1] || b.version[2] - a.version[2]);
    zip = candidates[0]?.file ?? null;
  }
  if (!zip) {
    console.error('[desktop] 找不到 Electron 运行时：请把 electron-v*-win32-x64.zip 解压到 desktop/electron-runtime');
    process.exit(1);
  }
  log('解压 Electron 运行时：' + zip);
  fs.rmSync(runtimeSource, { recursive: true, force: true });
  fs.mkdirSync(runtimeSource, { recursive: true });
  execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${runtimeSource}' -Force`],
    { stdio: 'inherit' },
  );
  return runtimeSource;
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, force: true });
}

function createShortcuts() {
  const exe = path.join(installDir, 'PAINTLAB.exe');
  const script = `
$ws = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'PAINTLAB.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'PAINTLAB.lnk')
)
foreach ($t in $targets) {
  $s = $ws.CreateShortcut($t)
  $s.TargetPath = '${exe.replace(/'/g, "''")}'
  $s.WorkingDirectory = '${installDir.replace(/'/g, "''")}'
  $s.IconLocation = '${path.join(installDir, 'icon.ico').replace(/'/g, "''")}'
  $s.Description = 'PAINTLAB 漆料资产与调漆工作台'
  $s.Save()
}
`;
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'inherit' });
    log('已创建桌面与开始菜单快捷方式');
  } catch (error) {
    log('快捷方式创建失败（应用仍可运行）：' + error.message);
  }
}

const runtime = ensureRuntime();
const electronExe = path.join(runtime, 'electron.exe');
if (!fs.existsSync(electronExe)) {
  console.error('[desktop] 运行时缺少 electron.exe');
  process.exit(1);
}

log('安装到 ' + installDir);
try {
  fs.rmSync(installDir, { recursive: true, force: true });
} catch (error) {
  if (String(error.message).includes('EBUSY') || String(error.message).includes('EPERM')) {
    console.error('[desktop] PAINTLAB 正在运行，请先关闭应用再重新构建');
    process.exit(1);
  }
  throw error;
}
fs.mkdirSync(installDir, { recursive: true });
copyDir(runtime, installDir);

const runtimeExe = path.join(installDir, 'electron.exe');
const targetExe = path.join(installDir, 'PAINTLAB.exe');
fs.renameSync(runtimeExe, targetExe);
for (const leftover of ['default_app.asar', 'resources/app.asar', 'resources/app-update.yml']) {
  fs.rmSync(path.join(installDir, leftover), { recursive: true, force: true });
}

// Electron 应用本体：main/preload/package.json + dist
const appDir = path.join(installDir, 'resources', 'app');
fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
copyDir(appSource, appDir);
const packagedApp = JSON.parse(fs.readFileSync(path.join(appSource, 'package.json'), 'utf8'));
packagedApp.version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packagedApp, null, 2));
copyDir(dist, path.join(appDir, 'dist'));
if (fs.existsSync(iconSource)) fs.copyFileSync(iconSource, path.join(installDir, 'icon.ico'));

fs.writeFileSync(path.join(installDir, 'version.txt'), packagedApp.version + '\n');
log('完成：' + targetExe + '（version ' + packagedApp.version + '）');
createShortcuts();
