// PAINTLAB 桌面壳（Electron 43+）：固定 origin app://paintlab，数据存 %APPDATA%/PAINTLAB
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL = 'app';
const HOST = 'paintlab';
const DEV_URL = process.env.PAINTLAB_DEV_URL || '';
const APP_DIR = __dirname;
const DIST_DIR = path.join(APP_DIR, 'dist');

app.setName('PAINTLAB');
app.setAppUserModelId('com.paintlab.app');
path.join(app.getPath('userData'), 'window-state.json');

/** 单实例：第二次启动只聚焦已有窗口，避免两个进程写同一个库 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      allowServiceWorkers: false,
    },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

let mainWindow = null;

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    if (raw && typeof raw === 'object') return raw;
  } catch {
    /* 首次启动或文件损坏：用默认尺寸 */
  }
  return { width: 1280, height: 800 };
}

function saveWindowState(win) {
  try {
    if (win.isMinimized()) return;
    const bounds = win.isMaximized() ? readWindowState() : win.getBounds();
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({
        ...bounds,
        maximized: win.isMaximized(),
      }),
    );
  } catch {
    /* 写窗口状态失败不影响使用 */
  }
}

async function createWindow() {
  const state = readWindowState();
  const options = {
    width: Number.isFinite(state.width) ? state.width : 1280,
    height: Number.isFinite(state.height) ? state.height : 800,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#F4F4F2',
    title: 'PAINTLAB',
    icon: path.join(APP_DIR, 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#161616', symbolColor: '#EDEDED', height: 40 },
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  };
  if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
    options.x = state.x;
    options.y = state.y;
  }

  const win = new BrowserWindow(options);
  mainWindow = win;
  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize();
    win.show();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${PROTOCOL}://${HOST}`) && !(DEV_URL && url.startsWith(DEV_URL))) {
      event.preventDefault();
    }
  });
  win.on('close', () => saveWindowState(win));

  if (DEV_URL) {
    await win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadURL(`${PROTOCOL}://${HOST}/index.html`);
  }
  return win;
}

function mimeOf(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** app://paintlab/* → dist/*；SPA 深链回落到 index.html */
function registerProtocol() {
  protocol.handle(PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== HOST) return new Response('forbidden', { status: 403 });
      let pathname = decodeURIComponent(url.pathname || '/');
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      let filePath = path.normalize(path.join(DIST_DIR, pathname));
      if (!filePath.startsWith(DIST_DIR)) return new Response('forbidden', { status: 403 });
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (path.extname(pathname)) return new Response('not found', { status: 404 });
        filePath = path.join(DIST_DIR, 'index.html');
      }
      const data = await fs.promises.readFile(filePath);
      return new Response(data, { headers: { 'content-type': mimeOf(filePath) } });
    } catch (error) {
      return new Response('error: ' + String(error), { status: 500 });
    }
  });
}

function registerIpc() {
  ipcMain.on('platform:info', (event) => {
    event.returnValue = {
      appVersion: app.getVersion(),
      dataPath: app.getPath('userData'),
      electron: process.versions.electron,
    };
  });

  ipcMain.handle('platform:save-file', async (_event, payload) => {
    try {
      const name = typeof payload?.name === 'string' && payload.name ? payload.name : 'paintlab.txt';
      const mime = typeof payload?.mime === 'string' ? payload.mime : 'application/octet-stream';
      const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
        title: '保存文件',
        defaultPath: path.join(app.getPath('downloads'), name),
        filters: [{ name: '文件', extensions: [name.split('.').pop() || 'txt'] }],
      });
      if (result.canceled || !result.filePath) return 'canceled';
      const data = payload?.data;
      const buffer = Buffer.isBuffer(data)
        ? data
        : data instanceof Uint8Array
          ? Buffer.from(data)
          : Buffer.from(String(data ?? ''), 'utf8');
      await fs.promises.writeFile(result.filePath, buffer);
      return 'saved';
    } catch {
      return 'failed';
    }
  });

  ipcMain.handle('platform:open-file', async (_event, payload) => {
    try {
      const accept = Array.isArray(payload?.accept) ? payload.accept : undefined;
      const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
        title: '打开文件',
        properties: ['openFile'],
        ...(accept && accept.length > 0 ? { filters: [{ name: '可导入文件', extensions: accept }] } : {}),
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0];
      const text = await fs.promises.readFile(filePath, 'utf8');
      return { name: path.basename(filePath), text };
    } catch {
      return null;
    }
  });
}

app.whenReady().then(async () => {
  // 第二个实例只负责退出：不创建窗口、不碰 IndexedDB/缓存
  if (!gotLock) return;
  Menu.setApplicationMenu(null);
  process.env.PAINTLAB_APP_VERSION = app.getVersion();
  process.env.PAINTLAB_DATA_PATH = app.getPath('userData');
  registerProtocol();
  registerIpc();

  // a[download] 兜底：下载直接落到系统下载目录（导出主路径走平台保存框）
  session.defaultSession.on('will-download', (_event, item) => {
    const suggested = item.getFilename() || 'paintlab-export';
    item.setSavePath(path.join(app.getPath('downloads'), suggested));
  });

  await createWindow().catch(() => {
    /* 加载失败时窗口已创建，交给用户关闭；不产生未处理拒绝 */
  });

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
