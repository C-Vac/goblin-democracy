/**
 * Mudwick Isle as the map room draws it: the GoblinLife.org map, in % of the bake's width and height.
 *
 * The isle's districts are the map room's (engine/mudwickDistricts.ts, synced by
 * scripts/sync-districts.mjs): whole blocks of the street grid, one piece each, meeting along streets
 * and never overlapping. The land mask (engine/mudwickMask.ts) comes from the frozen base layer, so
 * it holds across bakes. Who lives where follows the published lore: pixies under the mushrooms,
 * readmitted gnomes in the Revenue District, trolls in the wet south.
 */

import { MASK_B64, MASK_H, MASK_W, MASK_VERSION } from './mudwickMask';
import { DISTRICT_SOURCE, SHAPES } from './mudwickDistricts';

/**
 * The map's geometry. The painted map itself is not in this repo: the page fetches it from
 * GoblinLife.org's CDN (src/mapArt.ts), and every position here is % of the bake it is cut from.
 */
export const MAP = {
  maskVersion: MASK_VERSION,
  districts: DISTRICT_SOURCE,
  /** The bake's pixel size; positions everywhere are % of it. */
  width: 8256,
  height: 4608,
  /** The blank cartouche scroll in the painting, where the map is lettered. */
  cartouche: { x: 75, y: 72.5, w: 21, h: 23 },
};
export const ASPECT = MAP.width / MAP.height;

export type DistrictKind = 'city' | 'country' | 'base' | 'abroad' | 'aliens';

export interface District {
  id: string;
  name: string;
  kind: DistrictKind;
  /** Outline in % of the bake. */
  poly: Array<[number, number]>;
  /** Where the site letters the name, % of the bake. */
  label: [number, number];
  /**
   * Residents. WORKING FIGURES, not canon: proposed 2026-11-14 for the lore room to confirm or replace
   * (canon has no census of Mudwick yet). Polling places follow people: each district gets places in
   * proportion to its residents, sited on the blocks the map draws the most dwellings on (`settled`), so empty
   * land gets none.
   */
  population: number;
  /** Districts sharing a street edge (from the map room; empty off the map). */
  adjacent?: string[];
  /** Dwellings per street block from the map room, [x%, y%, count]: polling places go where these are. */
  settled?: Array<[number, number, number]>;
  /** Where most of the district's people live, % of the bake (defaults to the label); used when no block counts exist. */
  settle?: [number, number];
  /** How much more (or less) likely each species is to live here, in log units. */
  affinity: Partial<Record<string, number>>;
  brief: string;
  /** Voters who are not on the isle: their block sits in the sea or on the mountains, with an arrow off the map. */
  offMap?: { arrow: [[number, number], [number, number]]; sub: string; anchor: 'start' | 'end' };
  /** Every vote arrives by post. */
  mailOnly?: boolean;
  /** Added to every species' turnout here. */
  turnoutShift?: number;
}

type Local = Omit<District, 'name' | 'kind' | 'poly' | 'label'> & Partial<Pick<District, 'name' | 'kind' | 'poly' | 'label'>>;

/**
 * The simulator's side of each district: residents, who lives there, the brief. Names, kinds and
 * outlines of the isle's districts come from the map room (engine/mudwickDistricts.ts); the two
 * off-map blocks are the simulator's own.
 */
const LOCAL: Local[] = [
  {
    id: 'abroad', name: 'Abroad', kind: 'abroad', population: 12000, mailOnly: true, turnoutShift: -0.12,
    poly: [[3, 58], [9, 58], [9, 76.5], [3, 76.5]], label: [1.2, 54.6],
    affinity: { goblin: 3, gnome: -0.5, troll: -1.5, pixie: -1.5, dwarf: -1.5, leafy: -1.5 },
    offMap: { arrow: [[2.6, 67.2], [0.4, 67.2]], sub: 'goblin dual citizens worldwide', anchor: 'start' },
    brief: 'Goblins with a second passport, voting from wherever they live now. Every ballot comes by post, and many come late.',
  },
  {
    id: 'aliens', name: 'Dwarven alien voters', kind: 'aliens', population: 4000,
    poly: [[89.5, 42], [97.5, 42], [97.5, 58.2], [89.5, 58.2]], label: [98.8, 38],
    affinity: { dwarf: 5, goblin: -2, gnome: -2, troll: -2, pixie: -2, leafy: -2 },
    offMap: { arrow: [[99.8, 50.1], [97.9, 50.1]], sub: 'resident aliens from Over There', anchor: 'end' },
    brief: 'Dwarves from Over There, beyond the mountains, who come through Gimlet\u2019s Bore to vote. In this simulator they are resident aliens with the vote: lawful voters, counted like everyone else.',
  },
  {
    id: 'revenue', population: 6000,
    affinity: { gnome: 3, goblin: -0.6, troll: -1, pixie: -1, leafy: -0.6 },
    brief: 'The gnome quarter: readmitted, taxed gnomes, with a tax booth at every way in.',
  },
  {
    id: 'uptown', population: 15000,
    affinity: { goblin: 1, gnome: 0.6, troll: -0.5 },
    brief: 'The downtown towers round GNN Tower.',
  },
  {
    id: 'works', population: 8000,
    affinity: { dwarf: 1.6, troll: 0.8, goblin: 0.3 },
    brief: 'Works halls and warehouses round the Cringe Co. plant, the brewery and the forge.',
  },
  {
    id: 'midtown', population: 24000,
    affinity: { goblin: 0.7, gnome: 0.5 },
    brief: 'Town houses, shops and small squares south of the Press.',
  },
  {
    id: 'press', population: 42000,
    affinity: { goblin: 1.1, leafy: 0.2 },
    brief: 'The crowded centre: tenements, shops and the post office. Tallest and densest.',
  },
  {
    id: 'strip', population: 9000,
    affinity: { goblin: 1.2, troll: 0.5 },
    brief: 'The casino, the theatre, the Council Chambers, Parliament and the embassies.',
  },
  {
    id: 'backstreets', population: 18000,
    affinity: { goblin: 0.8, troll: 1, leafy: 0.2 },
    brief: 'Shacks, taverns and the bathhouse toward the docks. Narrow and crooked.',
  },
  {
    id: 'southside', population: 26000,
    affinity: { goblin: 0.5, leafy: 1.2, troll: 0.3 },
    brief: 'Terraces and allotments by the runway market and the bus stop.',
  },
  {
    id: 'naval', population: 2500,
    affinity: { goblin: 1.6, troll: 0.6, pixie: -1.5, leafy: -1.5 },
    brief: 'The navy on the bay.',
  },
  {
    id: 'docks', population: 5000,
    affinity: { troll: 1.2, dwarf: 0.5, goblin: 0.3 },
    brief: 'Warehouses and sheds on the bay shore by the shipyard.',
  },
  {
    id: 'campus', population: 7000,
    affinity: { gnome: 1, pixie: 0.5, dwarf: 0.5, goblin: -0.2 },
    brief: 'The university, the library, the Labs and the bench on the plateau.',
  },
  {
    id: 'fort-cope', population: 4000,
    affinity: { goblin: 2, pixie: -1.5, leafy: -1.5, gnome: -0.8 },
    brief: 'The army base below the Immaculate Wall, telescopes trained north.',
  },
  {
    id: 'hill', population: 3500,
    affinity: { leafy: 1.5, goblin: 0.5 },
    brief: 'Rolling green round the GSN tower: cottages, burrows, small farms.',
  },
  {
    id: 'headland', population: 300,
    affinity: { goblin: 1, troll: 0.5 },
    brief: 'The bare headland round the gunnery fort. Mostly empty on purpose.',
  },
  {
    id: 'marsh', population: 1200,
    affinity: { troll: 2, leafy: 0.8, gnome: -0.5 },
    brief: 'Wet ground toward the crater: stilt houses and tin shacks.',
  },
  {
    id: 'pixie', population: 600,
    affinity: { pixie: 3.5, goblin: -1.5, troll: -1.5, dwarf: -1.2, gnome: -1 },
    brief: 'Mushroom-cap houses under the giant mushrooms. No goblin buildings.',
  },
];

/** Every district, off-map ones first. On the isle, districts meet along streets and never overlap. */
export const DISTRICTS: District[] = LOCAL.map((d) => {
  if (d.offMap) return d as District;
  const shape = SHAPES[d.id];
  if (!shape) throw new Error(`the map room has no district ${d.id}`);
  return { ...d, name: shape.name, kind: shape.kind, poly: shape.poly, label: shape.label, adjacent: shape.adjacent, settled: shape.settled };
});
const missing = Object.keys(SHAPES).filter((id) => !LOCAL.some((d) => d.id === id));
if (missing.length) throw new Error(`no residents set for district(s) ${missing.join(', ')}`);

/** How far a block's dwellings pull polling places, % of the map width (a street block is about 4% wide). */
const SETTLE_SIGMA = 2.5;

/** Polling places across the bake's width for each size. Rows follow from the bake's shape. */
export const GRID_COLUMNS = { S: 24, M: 34, L: 46, XL: 60 } as const;
/** About how many polling places the whole electorate gets at each grid size. */
const PLACE_TARGET: Record<number, number> = { 24: 80, 34: 150, 46: 260, 60: 440 };
/**
 * The fewest polling places any district gets at each size, however few live there: thin country
 * still votes in more than one hall. Never more than half a district's room, so it is never full.
 */
const PLACE_FLOOR: Record<number, number> = { 24: 3, 34: 5, 46: 8, 60: 12 };
export const TOTAL_POPULATION = DISTRICTS.reduce((a, d) => a + d.population, 0);

export function inPoly([x, y]: [number, number], poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function districtAt(pt: [number, number]): number {
  return DISTRICTS.findIndex((d) => inPoly(pt, d.poly));
}

let maskBits: Uint8Array | null = null;
function mask(): Uint8Array {
  if (maskBits) return maskBits;
  const bin = typeof atob === 'function' ? atob(MASK_B64) : Buffer.from(MASK_B64, 'base64').toString('binary');
  maskBits = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) maskBits[i] = bin.charCodeAt(i);
  return maskBits;
}

/** Share of a box (in % of the bake) that is land. */
export function landShare(x0: number, y0: number, x1: number, y1: number): number {
  const m = mask();
  const a = Math.max(0, Math.floor((x0 / 100) * MASK_W)), b = Math.min(MASK_W - 1, Math.ceil((x1 / 100) * MASK_W) - 1);
  const c = Math.max(0, Math.floor((y0 / 100) * MASK_H)), d = Math.min(MASK_H - 1, Math.ceil((y1 / 100) * MASK_H) - 1);
  let land = 0, all = 0;
  for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) {
    const k = y * MASK_W + x;
    all++;
    if (m[k >> 3] & (1 << (k & 7))) land++;
  }
  return all ? land / all : 0;
}

export interface Cell {
  col: number;
  row: number;
  /** Centre, % of the bake. */
  x: number;
  y: number;
  district: number;
}

/** The polling-place grid: square cells on the bake, kept when the centre is in a district and the cell is mostly land. */
export interface Grid {
  cells: Cell[];
  cw: number;
  ch: number;
  cols: number;
  rows: number;
  /** Polling places per district (index into DISTRICTS). */
  places: number[];
}
const grids = new Map<number, Grid>();

export function gridCells(columns: number): Grid {
  const hit = grids.get(columns);
  if (hit) return hit;
  const cw = 100 / columns;
  const ch = cw * ASPECT;
  const rows = Math.floor(100 / ch);
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = (col + 0.5) * cw, y = (row + 0.5) * ch;
    const district = districtAt([x, y]);
    if (district < 0) continue;
    if (!DISTRICTS[district].offMap && landShare(x - cw / 2, y - ch / 2, x + cw / 2, y + ch / 2) < 0.55) continue;
    cells.push({ col, row, x, y, district });
  }
  // Polling places follow people: each district keeps as many cells as its share of residents earns,
  // the ones where the map draws the most dwellings nearby (the map room's per-block counts), or, with
  // no counts, the ones nearest its settle point. At least PLACE_FLOOR each (thin country included); a crowded
  // district is capped by its cells.
  const target = PLACE_TARGET[columns] ?? Math.round(cells.length * 0.6);
  const keep = new Set<Cell>();
  const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + ((ay - by) / ASPECT) ** 2;
  const places = DISTRICTS.map((d, k) => {
    const mine = cells.filter((c) => c.district === k);
    const floor = Math.min(PLACE_FLOOR[columns] ?? 1, Math.floor(mine.length / 2));
    const want = Math.max(1, floor, Math.min(mine.length, Math.round((d.population / TOTAL_POPULATION) * target)));
    const [sx, sy] = d.settle ?? d.label;
    const blocks = d.settled ?? [];
    const sigma2 = 2 * SETTLE_SIGMA ** 2;
    const pull = new Map(mine.map((c) => [c, blocks.reduce((a, [bx, by, n]) => a + n * Math.exp(-dist2(c.x, c.y, bx, by) / sigma2), 0)]));
    mine.sort((a, b) => (pull.get(b)! - pull.get(a)!) || dist2(a.x, a.y, sx, sy) - dist2(b.x, b.y, sx, sy));
    mine.slice(0, want).forEach((c) => keep.add(c));
    return Math.min(want, mine.length);
  });
  const grid = { cells: cells.filter((c) => keep.has(c)), cw, ch, cols: columns, rows, places };
  grids.set(columns, grid);
  return grid;
}
