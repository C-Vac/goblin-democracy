/**
 * Mudwick Isle before anyone cheats: polling places on the map's districts, who lives where, how they
 * vote, who staffs the polling places and which district counting house each one reports to.
 */

import { placeName, SPECIES } from './catalog';
import { ASPECT, type Cell, DISTRICTS, GRID_COLUMNS, gridCells } from './mudwick';
import { binomial, multinomial, normal, stream } from './rng';
import type { Config, Counts, NodeInfo, PrecinctStatic } from './types';

export interface World {
  cols: number;
  rows: number;
  /** Cell width and height, % of the bake. */
  cw: number;
  ch: number;
  statics: PrecinctStatic[];
  honest: Counts[];
  nodes: NodeInfo[];
  neighbors: number[][];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** How far a district's character carries past its line, in % of the map's width. */
const SPREAD = 7;

const homeCache = new Map<string, number[]>();
/**
 * Each polling place's pull toward a species: its district's affinity, blurred over the map so
 * neighbourhoods fade into each other (district lines are drawn by officials, not by who lives there).
 * Depends only on the grid, so it is computed once per size.
 */
function homeField(size: string, species: string, cells: Cell[]): number[] {
  const key = `${size}:${species}`;
  const hit = homeCache.get(key);
  if (hit) return hit;
  const aff = cells.map((c) => DISTRICTS[c.district].affinity[species] ?? 0);
  const off = cells.map((c) => !!DISTRICTS[c.district].offMap);
  const out = cells.map((c, i) => {
    // Voters off the map keep their own character; nobody on the isle lives next door to them.
    if (off[i]) return aff[i];
    let w = 0, v = 0;
    cells.forEach((d, j) => {
      if (off[j]) return;
      const k = Math.exp(-(((c.x - d.x) ** 2 + ((c.y - d.y) / ASPECT) ** 2) / (2 * SPREAD ** 2)));
      w += k; v += k * aff[j];
    });
    return v / w;
  });
  homeCache.set(key, out);
  return out;
}

function zscores(vals: number[]): number[] {
  const n = vals.length || 1;
  const m = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1;
  return vals.map((x) => (x - m) / sd);
}

/** What a candidate's type does to every voter's view of them, by the voter's Council loyalty. */
export function typeLift(type: string, loyalty: number): number {
  switch (type) {
    case 'incumbent': return 0.3;
    case 'aligned': return 0.25 * Math.max(0, loyalty);
    case 'reformer': return 0.25 * Math.max(0, -loyalty);
    case 'radical': return -0.05;
    case 'protest': return -0.6;
    default: return 0;
  }
}

export function softmax(us: number[]): number[] {
  const m = Math.max(...us);
  const e = us.map((u) => Math.exp(u - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

export function buildWorld(cfg: Config): World {
  const grid = gridCells(GRID_COLUMNS[cfg.size] ?? GRID_COLUMNS.M);
  const { cols, rows, cw, ch } = grid;
  const cells = grid.cells;
  const n = cells.length;
  const C = cfg.candidates.length;

  // Species: isle-wide shares, tilted toward where each species lives on Mudwick (the district's
  // affinity) plus a few random blobs so no district is uniform. Clustering sets how hard the tilt is.
  const rawShares = SPECIES.map((s) => Math.max(0, cfg.species[s.id] ?? 0));
  const shareSum = rawShares.reduce((a, b) => a + b, 0) || 1;
  const shares = rawShares.map((s) => s / shareSum);
  const fr = stream(cfg.seed, 'fields');
  const fields = SPECIES.map((sp) => {
    const blobs = [0, 1, 2].map(() => [fr() * 100, fr() * 100]);
    const blob = zscores(cells.map((c) => blobs.reduce((acc, [bx, by]) => acc + Math.exp(-(((c.x - bx) / 18) ** 2 + ((c.y - by) / 18 / ASPECT) ** 2) / 2), 0)));
    const home = homeField(cfg.size, sp.id, cells);
    const hz = zscores(home);
    const flat = home.every((v) => v === home[0]);
    return cells.map((_, i) => (flat ? 0 : 0.8 * hz[i]) + 0.45 * blob[i]);
  });
  const alpha = (cfg.clustering / 100) * 2.4;
  const meanMail = SPECIES.reduce((a, s, k) => a + s.mail * shares[k], 0) || 1;

  const statics: PrecinctStatic[] = [];
  const honest: Counts[] = [];

  for (let i = 0; i < n; i++) {
    const { col, row, x, y, district } = cells[i];
    const r = stream(cfg.seed, 'precinct', i);
    const D = DISTRICTS[district];
    // Off the map the composition is the point of the district (dual citizens, dwarves), whatever the slider says.
    const a = D.offMap ? Math.max(alpha, 1.9) : alpha;
    const weights = shares.map((s, k) => s * Math.exp(a * fields[k][i] + 0.15 * normal(r)));
    const ws = weights.reduce((a, b) => a + b, 0) || 1;
    const mix = weights.map((x) => x / ws);
    // Residents of voting age (about 80%), shared between the district's polling places.
    const eligible = Math.max(60, Math.round(((D.population * 0.8) / Math.max(1, grid.places[district])) * Math.exp(0.3 * normal(r))));

    const vr = stream(cfg.seed, 'vote', i);
    const shock = 0.07 * normal(vr);
    const swing = cfg.candidates.map((c) => 0.28 * (c.type === 'radical' ? 2.2 : c.type === 'protest' ? 1.3 : 1) * normal(vr));
    // Post from abroad is slower and gets lost more.
    const returnRate = clamp((D.mailOnly ? 0.7 : 0.84) + 0.05 * normal(vr), 0.5, 0.97);
    const counts: Counts = { inPerson: new Array(C).fill(0), mail: new Array(C).fill(0), signins: 0, mailSent: 0, mailReturned: 0 };
    let registered = 0;
    SPECIES.forEach((sp, k) => {
      const elig = eligible * mix[k];
      const reg = Math.round(elig * clamp(sp.registration * (1 + 0.04 * normal(vr)), 0.3, 1));
      registered += reg;
      const voters = binomial(vr, reg, clamp(sp.turnout + shock + (D.turnoutShift ?? 0), 0.05, 0.95));
      const mailVoters = D.mailOnly ? voters : binomial(vr, voters, clamp((sp.mail * cfg.mailShare) / 100 / meanMail, 0, 0.9));
      const probs = softmax(cfg.candidates.map((c, j) => -3.2 * ((sp.x - c.x) ** 2 + (sp.y - c.y) ** 2) + swing[j] + typeLift(c.type, sp.x)));
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
      i, col, row, x, y, district: D.id, name: placeName(i), node: 0, homeNode: 0, eligible, registered, speciesShare: mix,
      staff: [], observer: false, paper: true, reconciles: false, oversight: 1,
    });
    honest.push(counts);
  }

  // Counting houses: one per district that has polling places, as on the map.
  const used = [...new Set(cells.map((c) => c.district))].sort((a, b) => a - b);
  const nodeOf = new Map(used.map((d, k) => [d, k]));
  const assign = cells.map((c) => nodeOf.get(c.district) ?? 0);

  // Staffing and safeguards per polling place. The local machine is the local honest leader.
  const sg = cfg.safeguards;
  // Patronage belongs to whoever holds office: the incumbent's faction if there is one, else the attackers'.
  const inc = cfg.candidates.findIndex((c) => c.type === 'incumbent');
  const ruling = inc >= 0 ? inc : Math.max(0, Math.min(C - 1, cfg.favored));
  const leaderOrder = (c: Counts) =>
    cfg.candidates.map((_, j) => j).sort((a, b) => c.inPerson[b] + c.mail[b] - (c.inPerson[a] + c.mail[a]));
  statics.forEach((p, i) => {
    p.node = assign[i];
    p.homeNode = assign[i];
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

  const nodes: NodeInfo[] = used.map((d, k) => {
    const D = DISTRICTS[d];
    const precincts = statics.filter((p) => p.node === k).map((p) => p.i);
    const totals = new Array(C).fill(0);
    precincts.forEach((i) => cfg.candidates.forEach((_, j) => { totals[j] += honest[i].inPerson[j] + honest[i].mail[j]; }));
    const order = totals.map((_, j) => j).sort((a, b) => totals[b] - totals[a]);
    const r = stream(cfg.seed, 'board', k);
    const mixed = r() < sg.mixedStaffing / 100;
    const boss = r() < (cfg.patronage ?? 0) / 100 ? ruling : order[0];
    return {
      i: k,
      name: D.name,
      district: D.id,
      kind: D.kind,
      precincts,
      cx: D.label[0],
      cy: D.label[1],
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

  return { cols, rows, cw, ch, statics, honest, nodes, neighbors };
}
