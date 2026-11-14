/**
 * Ballot-polling risk-limiting audit (BRAVO, Lindeman, Stark and Yates 2012). Ballots are drawn
 * at random with replacement from the paper; each one for the reported winner raises the test
 * statistic, each one for a loser lowers it. When it passes 1/alpha against every loser, the
 * reported winner is confirmed with risk at most alpha.
 */

import type { Rng } from './rng';

export interface BravoState {
  winner: number;
  /** Reported winner share against each loser, w / (w + l). */
  s: number[];
  T: number[];
  drawn: number;
}

export function bravoStart(reported: number[]): BravoState {
  const winner = reported.indexOf(Math.max(...reported));
  const s = reported.map((v, j) => (j === winner ? NaN : reported[winner] / Math.max(1, reported[winner] + v)));
  return { winner, s, T: reported.map(() => 1), drawn: 0 };
}

export function bravoStep(st: BravoState, ballot: number): void {
  st.drawn++;
  for (let l = 0; l < st.s.length; l++) {
    if (l === st.winner || !(st.s[l] > 0.5)) continue;
    if (ballot === st.winner) st.T[l] *= st.s[l] / 0.5;
    else if (ballot === l) st.T[l] *= (1 - st.s[l]) / 0.5;
  }
}

export function bravoConfirmed(st: BravoState, alpha: number): boolean {
  for (let l = 0; l < st.s.length; l++) {
    if (l === st.winner) continue;
    if (!(st.s[l] > 0.5) || st.T[l] < 1 / alpha) return false;
  }
  return true;
}

/**
 * Average sample number for a two-way BRAVO audit (Wald's approximation): the ballots you
 * expect to hand-check before confirming a winner with share pw against a runner-up with pl,
 * at risk limit alpha. Halving the margin roughly quadruples it.
 */
export function bravoAsn(pw: number, pl: number, alpha: number): number {
  const q = pw + pl;
  if (q <= 0 || pw <= pl) return Infinity;
  const p = pw / q;
  const e = q * (p * Math.log(2 * p) + (1 - p) * Math.log(2 * (1 - p)));
  return e > 0 ? Math.log(1 / alpha) / e : Infinity;
}

/** Draws one ballot from the paper: a precinct weighted by its ballots, then a ballot in it. */
export function makeBallotDrawer(r: Rng, papers: number[][]): (() => number) | null {
  const cum: number[] = [];
  let total = 0;
  for (const p of papers) { total += p.reduce((a, b) => a + b, 0); cum.push(total); }
  if (total <= 0) return null;
  return () => {
    let x = r() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > x) hi = mid; else lo = mid + 1; }
    const p = papers[lo];
    x -= lo ? cum[lo - 1] : 0;
    for (let j = 0; j < p.length; j++) { if (x < p[j]) return j; x -= p[j]; }
    return p.length - 1;
  };
}
