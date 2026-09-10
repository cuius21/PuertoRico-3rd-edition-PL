import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'standalone-font-fallback',
      // The single HTML also opens offline, using the existing serif/sans-serif fallbacks.
      transformIndexHtml: html => html.replace(/<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>\s*/g, ''),
    },
    viteSingleFile(),
  ],
  root: '.',
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist-html',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
