/**
 * Seeded randomness. Every random draw in the engine comes from a named stream, so the honest
 * election and the attacked one share the same voters, and a seed in a URL replays the same run.
 */

export type Rng = () => number;

/** FNV-1a over the parts, so stream('vote', 12) and stream('vote', 13) never collide. */
export function hashSeed(...parts: Array<number | string>): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast and good enough for simulation (not for secrets). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stream(seed: number, ...parts: Array<number | string>): Rng {
  return mulberry32(hashSeed(seed, ...parts));
}

export function normal(r: Rng): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Binomial draw: exact for small n, normal approximation above that. */
export function binomial(r: Rng, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n < 40) {
    let k = 0;
    for (let i = 0; i < n; i++) if (r() < p) k++;
    return k;
  }
  const k = Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(r));
  return Math.max(0, Math.min(n, k));
}

/** Multinomial draw by conditional binomials. Always sums to n. */
export function multinomial(r: Rng, n: number, probs: number[]): number[] {
  const out = new Array(probs.length).fill(0);
  let left = n;
  let mass = probs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < probs.length - 1; i++) {
    if (left <= 0 || mass <= 0) break;
    const k = binomial(r, left, Math.min(1, probs[i] / mass));
    out[i] = k;
    left -= k;
    mass -= probs[i];
  }
  out[probs.length - 1] += left;
  return out;
}

export function shuffle<T>(r: Rng, items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
