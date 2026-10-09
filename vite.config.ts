import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Development: frontend dev server meneruskan /api ke Express.
        '/api': {
          target: process.env.API_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
