/**
 * Mudwick Isle before anyone cheats: the island, its precincts, who lives where, how they vote,
 * who staffs the polling places and which counting house each one reports to.
 */

import { houseName, placeName, SPECIES } from './catalog';
import { binomial, multinomial, normal, stream } from './rng';
import type { Config, Counts, GridSize, NodeInfo, PrecinctStatic } from './types';

export const GRID: Record<GridSize, [number, number]> = {
  S: [10, 7],
  M: [14, 9],
  L: [20, 13],
  XL: [28, 18],
};

export interface World {
  cols: number;
  rows: number;
  statics: PrecinctStatic[];
  honest: Counts[];
  nodes: NodeInfo[];
  neighbors: number[][];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function islandCells(seed: number, cols: number, rows: number): Array<[number, number]> {
  const r = stream(seed, 'island');
  const a1 = r() * 6.28, a2 = r() * 6.28, a3 = r() * 6.28;
  const cells: Array<[number, number]> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = ((col + 0.5) / cols) * 2 - 1;
      const v = ((row + 0.5) / rows) * 2 - 1;
      const ang = Math.atan2(v, u);
      const rad = 0.86 + 0.09 * Math.sin(3 * ang + a1) + 0.06 * Math.sin(5 * ang + a2) + 0.05 * Math.sin(2 * ang + a3);
      if (Math.hypot(u, v) < rad) cells.push([col, row]);
    }
  }
  return cells;
}

export function softmax(us: number[]): number[] {
  const m = Math.max(...us);
  const e = us.map((u) => Math.exp(u - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

export function buildWorld(cfg: Config): World {
  const [cols, rows] = GRID[cfg.size] ?? GRID.M;
  const cells = islandCells(cfg.seed, cols, rows);
  const n = cells.length;
  const C = cfg.candidates.length;

  // Species: isle-wide shares, then enclaves from a few random blobs per species.
  const rawShares = SPECIES.map((s) => Math.max(0, cfg.species[s.id] ?? 0));
  const shareSum = rawShares.reduce((a, b) => a + b, 0) || 1;
  const shares = rawShares.map((s) => s / shareSum);
  const fr = stream(cfg.seed, 'fields');
  const fields = SPECIES.map(() => {
    const blobs = [0, 1, 2].map(() => [fr() * 1.6 - 0.8, fr() * 1.6 - 0.8]);
    const vals = cells.map(([c, r]) => {
      const u = ((c + 0.5) / cols) * 2 - 1;
      const v = ((r + 0.5) / rows) * 2 - 1;
      return blobs.reduce((acc, [bx, by]) => acc + Math.exp(-((u - bx) ** 2 + (v - by) ** 2) / (2 * 0.35 ** 2)), 0);
    });
    const m = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1;
    return vals.map((x) => (x - m) / sd);
  });
  const alpha = (cfg.clustering / 100) * 2.4;
  const meanMail = SPECIES.reduce((a, s, k) => a + s.mail * shares[k], 0) || 1;

  const statics: PrecinctStatic[] = [];
  const honest: Counts[] = [];

  for (let i = 0; i < n; i++) {
    const [col, row] = cells[i];
    const r = stream(cfg.seed, 'precinct', i);
    const weights = shares.map((s, k) => s * Math.exp(alpha * fields[k][i] + 0.15 * normal(r)));
    const ws = weights.reduce((a, b) => a + b, 0) || 1;
    const mix = weights.map((x) => x / ws);
    const eligible = Math.max(150, Math.round(900 * Math.exp(0.35 * normal(r))));

    const vr = stream(cfg.seed, 'vote', i);
    const shock = 0.07 * normal(vr);
    const swing = cfg.candidates.map(() => 0.28 * normal(vr));
    const returnRate = clamp(0.84 + 0.05 * normal(vr), 0.6, 0.97);
    const counts: Counts = { inPerson: new Array(C).fill(0), mail: new Array(C).fill(0), signins: 0, mailSent: 0, mailReturned: 0 };
    let registered = 0;
    SPECIES.forEach((sp, k) => {
      const elig = eligible * mix[k];
      const reg = Math.round(elig * clamp(sp.registration * (1 + 0.04 * normal(vr)), 0.3, 1));
      registered += reg;
      const voters = binomial(vr, reg, clamp(sp.turnout + shock, 0.05, 0.95));
      const mailVoters = binomial(vr, voters, clamp((sp.mail * cfg.mailShare) / 100 / meanMail, 0, 0.9));
      const probs = softmax(cfg.candidates.map((c, j) => -3.2 * ((sp.x - c.x) ** 2 + (sp.y - c.y) ** 2) + swing[j]));
      const ip = multinomial(vr, voters - mailVoters, probs);
      const ml = multinomial(vr, mailVoters, probs);
      for (let j = 0; j < C; j++) { counts.inPerson[j] += ip[j]; counts.mail[j] += ml[j]; }
      counts.signins += voters - mailVoters;
      counts.mailReturned += mailVoters;
      counts.mailSent += Math.round(mailVoters / returnRate);
    });
    // Deadwood: people who moved or died and are still on the rolls. They never vote, honestly.
    registered += Math.round(eligible * 0.03 * vr());
    counts.mailSent = Math.max(counts.mailSent, counts.mailReturned);

    statics.push({
      i, col, row, name: placeName(i), node: 0, eligible, registered, speciesShare: mix,
      staff: [], observer: false, paper: true, reconciles: false, oversight: 1,
    });
    honest.push(counts);
  }

  // Counting houses: k-means over the precinct cells.
  const K = Math.max(3, Math.round(n / 11));
  const nr = stream(cfg.seed, 'nodes');
  const centers: Array<[number, number]> = [];
  centers.push([cells[Math.floor(nr() * n)][0], cells[Math.floor(nr() * n)][1]]);
  while (centers.length < K) {
    let best = 0, bestD = -1;
    for (let i = 0; i < n; i++) {
      const d = Math.min(...centers.map(([x, y]) => (cells[i][0] - x) ** 2 + (cells[i][1] - y) ** 2)) + nr() * 0.5;
      if (d > bestD) { bestD = d; best = i; }
    }
    centers.push([cells[best][0], cells[best][1]]);
  }
  const assign = new Array(n).fill(0);
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      centers.forEach(([x, y], k) => {
        const d = (cells[i][0] - x) ** 2 + (cells[i][1] - y) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      });
      assign[i] = best;
    }
    centers.forEach((_, k) => {
      const mine = cells.filter((_, i) => assign[i] === k);
      if (mine.length) centers[k] = [mine.reduce((a, c) => a + c[0], 0) / mine.length, mine.reduce((a, c) => a + c[1], 0) / mine.length];
    });
  }

  // Staffing and safeguards per polling place. The local machine is the local honest leader.
  const sg = cfg.safeguards;
  const ruling = Math.max(0, Math.min(C - 1, cfg.favored));
  const leaderOrder = (c: Counts) =>
    cfg.candidates.map((_, j) => j).sort((a, b) => c.inPerson[b] + c.mail[b] - (c.inPerson[a] + c.mail[a]));
  statics.forEach((p, i) => {
    p.node = assign[i];
    const r = stream(cfg.seed, 'staff', i);
    const order = leaderOrder(honest[i]);
    const mixed = r() < sg.mixedStaffing / 100;
    const boss = r() < (cfg.patronage ?? 0) / 100 ? ruling : order[0];
    p.staff = mixed ? [order[0], order[1 % C], order[2 % C]] : [boss, boss, boss];
    p.observer = r() < sg.observers / 100;
    p.paper = r() < sg.paper / 100;
    p.reconciles = r() < sg.reconciliation / 100;
    p.oversight = new Set(p.staff).size + (p.observer ? 1 : 0);
  });

  const nodes: NodeInfo[] = centers.map(([cx, cy], k) => {
    const precincts = statics.filter((p) => p.node === k).map((p) => p.i);
    const totals = new Array(C).fill(0);
    precincts.forEach((i) => cfg.candidates.forEach((_, j) => { totals[j] += honest[i].inPerson[j] + honest[i].mail[j]; }));
    const order = totals.map((_, j) => j).sort((a, b) => totals[b] - totals[a]);
    const r = stream(cfg.seed, 'board', k);
    const mixed = r() < sg.mixedStaffing / 100;
    const boss = r() < (cfg.patronage ?? 0) / 100 ? ruling : order[0];
    return {
      i: k,
      name: houseName(k),
      precincts,
      cx,
      cy,
      meanOversight: precincts.length ? precincts.reduce((a, i) => a + statics[i].oversight, 0) / precincts.length : 0,
      canvassBoard: mixed ? [order[0], order[1 % C], order[2 % C]] : [boss, boss, boss],
    };
  });

  const at = new Map(statics.map((p) => [`${p.col},${p.row}`, p.i]));
  const neighbors = statics.map((p) => {
    const out: number[] = [];
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if (!dc && !dr) continue;
      const j = at.get(`${p.col + dc},${p.row + dr}`);
      if (j !== undefined) out.push(j);
    }
    return out;
  });

  return { cols, rows, statics, honest, nodes, neighbors };
}
