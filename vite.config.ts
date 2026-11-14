import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from www.goblinlife.org/democracy/. The site build sets DEMOCRACY_OUT_DIR to
// apps/www/public/democracy; a standalone build writes dist/.
export default defineConfig({
  base: '/democracy/',
  plugins: [react()],
  build: {
    outDir: process.env.DEMOCRACY_OUT_DIR || 'dist',
    emptyOutDir: true,
  },
  worker: { format: 'es' },
});
