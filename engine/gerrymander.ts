/**
 * Gerrymandering: the boundary commission moves polling places between neighbouring districts to
 * win as many districts as it can on last election's numbers. Packing (the other side's voters
 * crammed into a few districts it wins big) and cracking (its voters spread thin where they lose)
 * both fall out of one rule: take the move that most raises the number of districts the favoured
 * candidate is expected to win. Districts stay in one piece, nobody empties a district, and the
 * voters off the map (Abroad, the dwarves) are not the commission's to move.
 */

import { DISTRICTS } from './mudwick';
import { normal, type Rng } from './rng';
import type { Counts, NodeInfo, PrecinctStatic } from './types';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Expected districts won: a smooth count, so the commission also values making safe seats safer. */
function seatScore(v: number[], f: number): number {
  const total = v.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let other = 0;
  v.forEach((x, j) => { if (j !== f && x > other) other = x; });
  return sigmoid((v[f] - other) / (0.15 * total + 1));
}

/** Plurality winner of each counting house under the given assignment. */
export function seatsWon(rows: number[][], nodeOf: number[], nodes: number, C: number): number[] {
  const sums = Array.from({ length: nodes }, () => new Array(C).fill(0));
  rows.forEach((row, i) => row.forEach((v, j) => { sums[nodeOf[i]][j] += v; }));
  const seats = new Array(C).fill(0);
  for (const s of sums) {
    if (!s.some((v) => v > 0)) continue;
    seats[s.indexOf(Math.max(...s))]++;
  }
  return seats;
}

export interface Redraw {
  moved: number[];
  /** Districts the favoured candidate leads on last election's numbers, before and after. */
  before: number;
  after: number;
}

/** `adj` is the map's neighbour lists (the same the forensic tests use), so the map test walks the moves the commission weighed. */
export function redraw(statics: PrecinctStatic[], honest: Counts[], nodes: NodeInfo[], f: number, strength: number, r: Rng, adj: number[][]): Redraw {
  const n = statics.length;
  const C = honest[0]?.inPerson.length ?? 0;
  // Last election's numbers: the honest vote, give or take, which is what a commission has to work with.
  const v = honest.map((c) => c.inPerson.map((x, j) => Math.max(0, (x + c.mail[j]) * (1 + 0.06 * normal(r)))));
  const movable = statics.map((p) => !DISTRICTS.find((d) => d.id === p.district)?.offMap);
  const fixedNode = new Set(nodes.filter((nd) => DISTRICTS.find((d) => d.id === nd.district)?.offMap).map((nd) => nd.i));

  const node = statics.map((p) => p.node);
  const sums = nodes.map(() => new Array(C).fill(0));
  const size = nodes.map(() => 0);
  for (let i = 0; i < n; i++) { size[node[i]]++; v[i].forEach((x, j) => { sums[node[i]][j] += x; }); }
  const led = () => sums.filter((s) => s.some((x) => x > 0) && s.indexOf(Math.max(...s)) === f).length;
  const before = led();

  const components = (k: number, skip: number): number => {
    const seen = new Set<number>();
    let comps = 0;
    for (let i = 0; i < n; i++) {
      if (node[i] !== k || i === skip || seen.has(i)) continue;
      comps++;
      const stack = [i];
      seen.add(i);
      while (stack.length) {
        const x = stack.pop()!;
        for (const y of adj[x]) if (node[y] === k && y !== skip && !seen.has(y)) { seen.add(y); stack.push(y); }
      }
    }
    return comps;
  };
  const compCount = nodes.map((nd) => components(nd.i, -1));

  const budget = Math.round(strength * 0.4 * movable.filter(Boolean).length);
  const moved = new Set<number>();
  for (let step = 0; step < budget; step++) {
    const cands: Array<{ i: number; b: number; d: number }> = [];
    for (let i = 0; i < n; i++) {
      if (!movable[i]) continue;
      const a = node[i];
      if (size[a] <= 1) continue;
      const targets = new Set(adj[i].map((j) => node[j]).filter((b) => b !== a && !fixedNode.has(b)));
      for (const b of targets) {
        const sa = sums[a].map((x, j) => x - v[i][j]);
        const sb = sums[b].map((x, j) => x + v[i][j]);
        const d = seatScore(sa, f) + seatScore(sb, f) - seatScore(sums[a], f) - seatScore(sums[b], f);
        if (d > 1e-4) cands.push({ i, b, d: d + r() * 1e-5 });
      }
    }
    if (!cands.length) break;
    cands.sort((x, y) => y.d - x.d);
    let done = false;
    for (const { i, b } of cands) {
      const a = node[i];
      const after = components(a, i);
      if (after > compCount[a]) continue;
      node[i] = b;
      size[a]--; size[b]++;
      v[i].forEach((x, j) => { sums[a][j] -= x; sums[b][j] += x; });
      compCount[a] = after;
      compCount[b] = components(b, -1);
      if (statics[i].homeNode === b) moved.delete(i); else moved.add(i);
      done = true;
      break;
    }
    if (!done) break;
  }

  statics.forEach((p, i) => { p.node = node[i]; });
  for (const nd of nodes) {
    nd.precincts = statics.filter((p) => p.node === nd.i).map((p) => p.i);
    nd.meanOversight = nd.precincts.length ? nd.precincts.reduce((s, i) => s + statics[i].oversight, 0) / nd.precincts.length : 0;
  }
  return { moved: [...moved].sort((a, b) => a - b), before, after: led() };
}
