/**
 * Monte Carlo: one run is an anecdote. Runs the same config on many seeds, alongside the same
 * seeds with every attack switched off, and reports how often the result flips, how often the
 * fraud is caught and where, and how often each forensic test fires on rigged and clean runs.
 */

import { cleanVersion } from './config';
import { runElection } from './election';
import { hashSeed } from './rng';
import type { CatchVia, Config, ElectionResult } from './types';

export interface DetectorRate {
  id: string;
  name: string;
  rigged: number;
  clean: number;
}

export interface MonteCarloSummary {
  runs: number;
  pFlip: number;
  pCaught: number;
  pCaughtGivenFlip: number;
  pFlipUncaught: number;
  outcomes: Record<string, number>;
  caughtVia: Partial<Record<CatchVia, number>>;
  caughtLayer: Record<string, number>;
  meanConspirators: number;
  meanLeakers: number;
  cleanFlagged: number;
  cleanRerun: number;
  detectors: DetectorRate[];
  /** Flip probability by number of conspirators (bucketed), for the "secrets scale" chart. */
  byCrew: Array<{ crew: string; runs: number; caught: number }>;
}

const CREW_BUCKETS = [[0, 0], [1, 4], [5, 12], [13, 40], [41, 150], [151, Infinity]] as const;

export function runMonteCarlo(cfg: Config, runs: number, onProgress?: (done: number) => void): MonteCarloSummary {
  const s: MonteCarloSummary = {
    runs, pFlip: 0, pCaught: 0, pCaughtGivenFlip: 0, pFlipUncaught: 0, outcomes: {}, caughtVia: {}, caughtLayer: {},
    meanConspirators: 0, meanLeakers: 0, cleanFlagged: 0, cleanRerun: 0, detectors: [],
    byCrew: CREW_BUCKETS.map(([lo, hi]) => ({ crew: hi === Infinity ? `${lo}+` : lo === hi ? `${lo}` : `${lo}-${hi}`, runs: 0, caught: 0 })),
  };
  const rates = new Map<string, DetectorRate>();
  const rate = (r: ElectionResult, key: 'rigged' | 'clean') => r.forensics.detectors.forEach((d) => {
    const e = rates.get(d.id) ?? { id: d.id, name: d.name, rigged: 0, clean: 0 };
    if (d.status === 'fail') e[key]++;
    rates.set(d.id, e);
  });
  let flips = 0, caught = 0, caughtFlip = 0, flipUncaught = 0;
  for (let k = 0; k < runs; k++) {
    const seed = hashSeed(cfg.seed, 'mc', k) % 2 ** 31;
    const rigged = runElection({ ...cfg, seed });
    const clean = runElection(cleanVersion({ ...cfg, seed }));
    const h = rigged.headline;
    if (h.flipped) flips++;
    if (h.caught) caught++;
    if (h.flipped && h.caught) caughtFlip++;
    if (h.flipped && !h.caught) flipUncaught++;
    s.outcomes[h.outcome] = (s.outcomes[h.outcome] ?? 0) + 1;
    if (h.caughtAt) {
      s.caughtVia[h.caughtAt.via] = (s.caughtVia[h.caughtAt.via] ?? 0) + 1;
      s.caughtLayer[h.caughtAt.layer] = (s.caughtLayer[h.caughtAt.layer] ?? 0) + 1;
    }
    s.meanConspirators += rigged.conspirators.length;
    s.meanLeakers += rigged.conspirators.filter((c) => c.leaked).length;
    if (clean.forensics.fails > 0) s.cleanFlagged++;
    if (clean.headline.outcome === 'rerun') s.cleanRerun++;
    const bucket = CREW_BUCKETS.findIndex(([lo, hi]) => rigged.conspirators.length >= lo && rigged.conspirators.length <= hi);
    if (bucket >= 0 && h.attempted) { s.byCrew[bucket].runs++; if (h.caught) s.byCrew[bucket].caught++; }
    rate(rigged, 'rigged');
    rate(clean, 'clean');
    if (onProgress && (k % 10 === 9 || k === runs - 1)) onProgress(k + 1);
  }
  s.pFlip = flips / runs;
  s.pCaught = caught / runs;
  s.pCaughtGivenFlip = flips ? caughtFlip / flips : 0;
  s.pFlipUncaught = flipUncaught / runs;
  s.meanConspirators /= runs;
  s.meanLeakers /= runs;
  s.detectors = [...rates.values()].map((d) => ({ ...d, rigged: d.rigged / runs, clean: d.clean / runs }));
  return s;
}
