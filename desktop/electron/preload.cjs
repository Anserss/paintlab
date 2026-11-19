// 平台桥：只暴露最小面（保存/打开文件），不向页面暴露 Node
const { contextBridge, ipcRenderer } = require('electron');

let info = { appVersion: '', dataPath: '', electron: '' };
try {
  info = ipcRenderer.sendSync('platform:info');
} catch {
  /* 极早期调用失败时退回空值 */
}

contextBridge.exposeInMainWorld('platform', {
  isDesktop: true,
  appVersion: process.env.PAINTLAB_APP_VERSION || info.appVersion || '',
  dataPath: process.env.PAINTLAB_DATA_PATH || info.dataPath || '',
  saveFile: (payload) => ipcRenderer.invoke('platform:save-file', payload),
  openFile: (payload) => ipcRenderer.invoke('platform:open-file', payload),
});
