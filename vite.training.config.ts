import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'training', base: '/site/training/', plugins: [react(), tailwindcss()],
  build: {
    outDir: '../site/training', emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'training/index.html'),
      output: { entryFileNames: 'assets/training-dashboard.js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/training-dashboard.[ext]' },
    },
  },
});
