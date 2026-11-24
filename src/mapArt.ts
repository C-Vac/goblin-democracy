/**
 * The painted map of Mudwick Isle. It is not in this repo: GoblinLife.org publishes it on its CDN
 * behind a manifest at a fixed address, so a new map reaches the simulator without a release.
 *
 *   manifest.json  { version, made, width, height, tile, zooms, files, tiles, base: { "1280", "2048", "2752" } }
 *
 * The manifest is short-cached; the images it names are content-hashed and immutable, so a new map
 * is a new manifest pointing at new files and nothing stale lingers under an old name.
 *
 * The CDN sends no cross-origin headers, so anything read by script goes through this site:
 * www.goblinlife.org rewrites /democracy/map/* to the CDN's site/map/* (apps/www/next.config.mjs), and
 * `vite dev` / `vite preview` proxy the same path (vite.config.ts). The manifest is fetched that way.
 * The picture on the page loads straight from the CDN, which needs no CORS for a plain <image>; the
 * result card, which paints the map onto a canvas and must not taint it, reads the same file through
 * this site instead.
 *
 * Until the art arrives, and whenever it can't be had, the map is drawn from the land mask the engine
 * already carries (engine/mudwickMask.ts): land and sea, never a broken image. In development a local
 * copy (public/map-local/mudwick.webp, gitignored, cut by scripts/bake-map.mjs) stands in when the
 * CDN can't be reached.
 */

import { useEffect, useState } from 'react';
import { ASPECT } from '../engine';
import { MASK_B64, MASK_H, MASK_W } from '../engine/mudwickMask';

/** This site's path to the CDN's site/map/ folder (same origin, so script may read it). */
export const MAP_ROOT: string = import.meta.env.VITE_MAP_ROOT || `${import.meta.env.BASE_URL}map/`;
/** Where the CDN itself serves site/map/ (for the picture on the page, which needs no CORS). */
const CDN_ROOT = 'https://cdn.goblinlife.org/site/map/';
const MANIFEST_URL = `${MAP_ROOT}manifest.json`;
const LOCAL_ART = `${import.meta.env.BASE_URL}map-local/mudwick.webp`;
/** The base image width to take from the manifest. */
const WANT = '2048';

export interface MapArt {
  /** For the page: straight from the CDN when the art came from there. */
  url: string;
  /** Same-origin copy of the same image, safe to draw onto a canvas. */
  canvasUrl: string;
  source: 'cdn' | 'local' | 'mask';
  /** The map's version, when it came from the CDN. */
  version?: string;
}

interface Manifest {
  version?: string | number;
  width?: number;
  height?: number;
  base?: Record<string, string>;
}

let maskUrl: string | null = null;
/** Land and sea from the engine's land mask, as a data URL. */
export function maskArt(): MapArt {
  if (!maskUrl) {
    const bin = atob(MASK_B64);
    const small = document.createElement('canvas');
    small.width = MASK_W;
    small.height = MASK_H;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(MASK_W, MASK_H);
    for (let i = 0; i < MASK_W * MASK_H; i++) {
      const land = bin.charCodeAt(i >> 3) & (1 << (i & 7));
      const [r, g, b] = land ? [74, 86, 52] : [24, 62, 68];
      img.data.set([r, g, b, 255], i * 4);
    }
    sctx.putImageData(img, 0, 0);
    const big = document.createElement('canvas');
    big.width = 1600;
    big.height = Math.round(1600 / ASPECT);
    const bctx = big.getContext('2d')!;
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(small, 0, 0, big.width, big.height);
    maskUrl = big.toDataURL('image/png');
  }
  return { url: maskUrl, canvasUrl: maskUrl, source: 'mask' };
}

/** Resolves true once the image has loaded. */
function probe(url: string, cors = false): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function fromCdn(): Promise<MapArt | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(MANIFEST_URL, { signal: ctl.signal });
    if (!res.ok) return null;
    const m = (await res.json()) as Manifest;
    const key = m.base?.[WANT] ?? Object.entries(m.base ?? {}).sort(([a], [b]) => +b - +a)[0]?.[1];
    // Keys are CDN paths under site/map/ (e.g. site/map/base/486b733272fb31fc.webp).
    if (typeof key !== 'string' || !/^site\/map\/[\w./-]+$/.test(key) || key.includes('..')) return null;
    // The overlays are % of the bake; a map of another shape would put every district in the wrong place.
    if (m.width && m.height && Math.abs(m.width / m.height - ASPECT) > 0.01) return null;
    const rel = key.slice('site/map/'.length);
    const canvasUrl = new URL(rel, new URL(MAP_ROOT, location.href)).href;
    // A dev or preview server without the proxy's host still reads the CDN directly for the page.
    const url = import.meta.env.VITE_MAP_ROOT ? canvasUrl : CDN_ROOT + rel;
    return (await probe(url)) ? { url, canvasUrl, source: 'cdn', version: m.version !== undefined ? String(m.version) : undefined } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let pending: Promise<MapArt> | null = null;
/** The best map art available: the CDN, then (in development) the local copy, then the land mask. */
export function loadMapArt(): Promise<MapArt> {
  pending ??= (async () => {
    const cdn = await fromCdn();
    if (cdn) return cdn;
    if (import.meta.env.DEV && (await probe(LOCAL_ART))) return { url: LOCAL_ART, canvasUrl: LOCAL_ART, source: 'local' };
    return maskArt();
  })();
  return pending;
}

/** The land mask at once, then the painted map when it arrives. */
export function useMapArt(): MapArt {
  const [art, setArt] = useState<MapArt>(() => maskArt());
  useEffect(() => {
    let live = true;
    loadMapArt().then((a) => { if (live) setArt(a); });
    return () => { live = false; };
  }, []);
  return art;
}
