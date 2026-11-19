/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

/** 桌面壳（Electron）通过 preload 注入的平台桥；浏览器里为 undefined */
interface PlatformBridge {
  isDesktop: true;
  appVersion: string;
  dataPath: string;
  saveFile: (payload: { name: string; mime: string; data: Uint8Array }) => Promise<'saved' | 'canceled' | 'failed'>;
  openFile: (payload: { accept?: string[] }) => Promise<{ name: string; text: string } | null>;
}

interface Window {
  platform?: PlatformBridge;
}
