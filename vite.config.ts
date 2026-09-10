import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',  // Relative paths — required for Electron (file:// protocol)
  publicDir: 'public',
  build: {
    outDir: 'dist',
  },
});
