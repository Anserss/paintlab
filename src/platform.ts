/** 平台桥：桌面壳（Electron preload）注入 window.platform；浏览器里没有 */
export const platform = (): PlatformBridge | undefined => window.platform;

export const isDesktop = (): boolean => Boolean(window.platform?.isDesktop);

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '2.2.2';
