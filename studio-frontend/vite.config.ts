import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/studio': {
        target: 'http://localhost:3001', // адрес бэкенда NestJS
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/studio/, '/studio'),
      },
    },
  },
});