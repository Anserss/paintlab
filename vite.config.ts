import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'PIGMENT DEPOT · 漆料管理',
        short_name: 'DEPOT',
        description: '面向模型涂装玩家的漆料资产与调漆工作台',
        lang: 'zh-CN',
        theme_color: '#0B0C0D',
        background_color: '#0B0C0D',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/catalog\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalog' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5175, strictPort: false },
  preview: { port: 4175, strictPort: false },
});
