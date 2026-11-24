import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

// The map's manifest and images live on GoblinLife.org's CDN, which sends no CORS headers. The site
// rewrites /democracy/map/* to it (apps/www/next.config.mjs); dev and preview do the same here.
const mapProxy: Record<string, ProxyOptions> = {
  '/democracy/map/': {
    target: 'https://cdn.goblinlife.org',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/democracy\/map\//, '/site/map/'),
  },
};

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
  server: { proxy: mapProxy },
  preview: { proxy: mapProxy },
});
