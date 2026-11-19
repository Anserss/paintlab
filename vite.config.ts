import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  /** 桌面壳构建：关闭 PWA/Service Worker（WebView 里 SW 只会造成"更新了但看不到"） */
  const desktop = mode === 'desktop';
  return {
    plugins: [
      react(),
      ...(desktop
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['favicon.svg', 'fonts/Saira.ttf'],
              manifest: {
                name: 'PAINTLAB · 漆料与调漆工作台',
                short_name: 'PAINTLAB',
                description: '面向模型涂装玩家的漆料资产与调漆工作台',
                lang: 'zh-CN',
                theme_color: '#F4F4F2',
                background_color: '#F4F4F2',
                display: 'standalone',
                start_url: '/',
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,woff2,ttf}'],
                runtimeCaching: [
                  {
                    urlPattern: /\/catalog\/.*\.json$/,
                    handler: 'StaleWhileRevalidate',
                    options: { cacheName: 'catalog' },
                  },
                ],
              },
            }),
          ]),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5175, strictPort: false },
    preview: { port: 4175, strictPort: false },
  };
});
