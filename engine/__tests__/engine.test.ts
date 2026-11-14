import { describe, expect, it } from 'vitest';
import { bravoAsn } from '../audit';
import { ATTACK_IDS, cleanVersion, decodeConfig, defaultConfig, encodeConfig, PRESETS } from '../config';
import { parseCsv, resultToCsv } from '../csv';
import { runElection } from '../election';
import { runForensics, type Table } from '../forensics';
import { DISTRICTS, GRID_COLUMNS, gridCells, inPoly, landShare } from '../mudwick';
import { mulberry32 } from '../rng';
import type { AttackId, Config } from '../types';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const seeds = Array.from({ length: 25 }, (_, i) => 100 + i);
const honestRow = (p: ReturnType<typeof runElection>['precincts'][number]) => p.honest.inPerson.map((v, j) => v + p.honest.mail[j]);

describe('invariants', () => {
  it('zero fraud returns the true result, precinct by precinct', () => {
    for (const preset of PRESETS) {
      for (const seed of seeds.slice(0, 5)) {
        const r = runElection(cleanVersion({ ...preset.config, seed }));
        expect(r.certified.totals).toEqual(r.honest.totals);
        expect(r.certified.winner).toBe(r.honest.winner);
        expect(r.conspirators).toHaveLength(0);
        expect(r.catches).toHaveLength(0);
        for (const p of r.precincts) expect(p.reported).toEqual(honestRow(p));
      }
    }
  });

  it('ballots equal voters unless stuffing, tabulators or the canvass say otherwise', () => {
    const balanced: AttackId[] = ['impersonation', 'harvesting', 'refusal'];
    for (const seed of seeds) {
      const cfg: Config = { ...defaultConfig(), seed };
      for (const id of balanced) cfg.attacks[id] = 60;
      const r = runElection(cfg);
      for (const p of r.precincts) {
        expect(sum(p.reported)).toBe(p.published.signins + p.published.mailReturned);
      }
    }
  });

  it('every attack layer can push ballots away from voters only where it acts', () => {
    for (const seed of seeds.slice(0, 10)) {
      const cfg: Config = { ...defaultConfig(), seed };
      cfg.attacks.stuffing = 50;
      cfg.safeguards.reconciliation = 0;
      const r = runElection(cfg);
      for (const p of r.precincts) {
        const off = sum(p.reported) !== p.published.signins + p.published.mailReturned;
        if (off) expect(p.tampered).toContain('stuffing');
      }
    }
  });

  it('is deterministic for a seed', () => {
    const cfg = { ...PRESETS.find((p) => p.id === 'council-classic')!.config };
    const a = runElection(cfg);
    const b = runElection(cfg);
    expect(a.certified).toEqual(b.certified);
    expect(a.headline.text).toBe(b.headline.text);
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
  });

  it('attacks do not change the honest election underneath', () => {
    const cfg = { ...defaultConfig(), seed: 42 };
    const rigged = { ...cfg, attacks: Object.fromEntries(ATTACK_IDS.map((id) => [id, 70])) as Config['attacks'] };
    expect(runElection(rigged).honest).toEqual(runElection(cfg).honest);
  });

  it('a tampered tabulator is undone by a full hand count of paper', () => {
    let counted = 0;
    for (const seed of seeds) {
      const cfg = { ...defaultConfig(), seed };
      cfg.attacks.tabulator = 100;
      cfg.safeguards.recountTrigger = 100;
      cfg.safeguards.paper = 100;
      cfg.rla = true;
      const r = runElection(cfg);
      if (!r.audit.recountTriggered && !r.audit.escalated) continue;
      counted++;
      expect(r.precincts.every((p) => !p.tampered.includes('tabulator'))).toBe(true);
    }
    expect(counted).toBeGreaterThan(0);
  });

  it('the headline answers flip, caught and where', () => {
    const r = runElection(PRESETS.find((p) => p.id === 'four-clerks')!.config);
    expect(r.headline.attempted).toBe(true);
    expect(r.headline.flipped).toBe(false);
    expect(r.headline.caught).toBe(true);
    expect(r.headline.text).toMatch(/four corrupt clerks, caught at the canvass/);
  });
});

describe('forensics', () => {
  const tableOf = (rows: number[][]): Table => ({ options: ['A', 'B', 'C'], units: rows.map((counts, i) => ({ id: String(i), counts, registered: sum(counts) * 2 })) });

  it('last-digit test passes noise and fails invented round numbers', () => {
    const r = mulberry32(5);
    const noisy = Array.from({ length: 120 }, () => [0, 0, 0].map(() => 100 + Math.floor(r() * 900)));
    const round = Array.from({ length: 120 }, () => [0, 0, 0].map(() => 100 + Math.floor(r() * 90) * 10));
    expect(runForensics(tableOf(noisy)).detectors.find((d) => d.id === 'last-digit')!.status).not.toBe('fail');
    expect(runForensics(tableOf(round)).detectors.find((d) => d.id === 'last-digit')!.status).toBe('fail');
  });

  it('honest default elections rarely fail any test', () => {
    let fails = 0;
    for (const seed of seeds) fails += runElection({ ...defaultConfig(), seed }).forensics.fails > 0 ? 1 : 0;
    expect(fails / seeds.length).toBeLessThan(0.2);
  });

  it('flags heavy ballot stuffing without reconciliation', () => {
    const cfg = { ...defaultConfig(), seed: 3 };
    cfg.attacks.stuffing = 60;
    cfg.patronage = 100;
    cfg.safeguards = { ...cfg.safeguards, reconciliation: 0, mixedStaffing: 0, observers: 0 };
    const rec = runElection(cfg).forensics.detectors.find((d) => d.id === 'reconciliation')!;
    expect(rec.status).toBe('fail');
  });
});

describe('audit math', () => {
  it('needs about four times the ballots when the margin halves', () => {
    const a = bravoAsn(0.55, 0.45, 0.05);
    const b = bravoAsn(0.525, 0.475, 0.05);
    expect(b / a).toBeGreaterThan(3.5);
    expect(b / a).toBeLessThan(4.5);
    expect(bravoAsn(0.45, 0.55, 0.05)).toBe(Infinity);
  });
});

describe('links and files', () => {
  it('round-trips a config through the URL codec', () => {
    const cfg = PRESETS.find((p) => p.id === 'nc-2018')!.config;
    expect(decodeConfig(encodeConfig(cfg))).toEqual(cfg);
  });

  it('rejects garbage and clamps out-of-range values', () => {
    expect(decodeConfig('not base64 json')).toBeNull();
    const bad = encodeConfig({ ...defaultConfig(), clustering: 900, attacks: { ...defaultConfig().attacks, stuffing: -5 } });
    const d = decodeConfig(bad)!;
    expect(d.clustering).toBe(100);
    expect(d.attacks.stuffing).toBe(0);
  });

  it('reads back its own CSV export with the same forensic results', () => {
    const r = runElection(PRESETS.find((p) => p.id === 'council-classic')!.config);
    const { table } = parseCsv(resultToCsv(r));
    expect(table.units).toHaveLength(r.precincts.length);
    expect(table.options).toEqual(r.config.candidates.map((c) => c.name));
    const again = runForensics(table);
    const pick = (ds: typeof again.detectors) => ds.filter((d) => ['reconciliation', 'last-digit', 'integer-pct', 'fingerprint'].includes(d.id)).map((d) => d.status);
    expect(pick(again.detectors)).toEqual(pick(r.forensics.detectors));
  });
});

describe('the map', () => {
  it('puts every polling place on land, inside its own district, and gives every district one', () => {
    for (const size of ['S', 'M', 'L', 'XL'] as const) {
      const g = gridCells(GRID_COLUMNS[size]);
      for (const c of g.cells) {
        expect(inPoly([c.x, c.y], DISTRICTS[c.district].poly)).toBe(true);
        if (!DISTRICTS[c.district].offMap) expect(landShare(c.x - g.cw / 2, c.y - g.ch / 2, c.x + g.cw / 2, c.y + g.ch / 2)).toBeGreaterThanOrEqual(0.55);
      }
      expect(new Set(g.cells.map((c) => c.district)).size).toBe(DISTRICTS.length);
    }
  });

  it('counts each district in its own counting house', () => {
    const r = runElection(defaultConfig());
    expect(r.nodes.map((n) => n.name).sort()).toEqual(DISTRICTS.map((d) => d.name).sort());
    for (const p of r.precincts) expect(r.nodes[p.static.node].district).toBe(p.static.district);
  });
});

describe('gerrymandering', () => {
  const base = (seed: number): Config => {
    const c = cleanVersion({ ...defaultConfig(), seed, rule: 'districts' });
    c.safeguards.mixedStaffing = 0;
    return c;
  };

  it('moves polling places, never ballots, and never the voters off the map', () => {
    const c = base(11);
    c.attacks.gerrymander = 100;
    const r = runElection(c);
    const clean = runElection(base(11));
    expect(r.redrawn).toBeGreaterThan(0);
    r.precincts.forEach((p, i) => {
      expect(sum(p.reported)).toBe(sum(clean.precincts[i].reported));
      if (['abroad', 'aliens'].includes(p.static.district)) expect(p.static.node).toBe(p.static.homeNode);
    });
    expect(r.honest.totals).toEqual(clean.honest.totals);
  });

  it('wins the favoured side more districts than the fair map gives it', () => {
    let gained = 0;
    for (const seed of seeds.slice(0, 12)) {
      const c = base(seed);
      c.attacks.gerrymander = 100;
      const r = runElection(c);
      gained += r.canvassed.seats[c.favored] - r.honest.seats[c.favored];
    }
    expect(gained / 12).toBeGreaterThan(1.5);
  });

  it('cannot flip a result decided by votes', () => {
    for (const seed of seeds.slice(0, 8)) {
      const c = { ...base(seed), rule: 'popular' as const };
      c.attacks.gerrymander = 100;
      expect(runElection(c).headline.flipped).toBe(false);
    }
  });
});

// Each preset's notice tells a story. A map re-sync can change any seed's outcome, so check the stories
// here and re-seed the preset when one fails (see docs/SPEC.md, "New districts").
describe('preset stories', () => {
  const run = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    return { cfg: p.config, r: runElection(structuredClone(p.config)) };
  };

  it('looks-guilty: nobody cheats and a test still fails', () => {
    const { r } = run('looks-guilty');
    expect(r.conspirators).toHaveLength(0);
    expect(r.forensics.detectors.some((d) => d.status === 'fail')).toBe(true);
  });

  it('draw-the-lines: the new lines win the election and nobody notices', () => {
    const { r } = run('draw-the-lines');
    expect(r.headline.flipped).toBe(true);
    expect(r.headline.caught).toBe(false);
  });

  it('colorado: a narrow loss nudged into a win, caught by the audit and put back', () => {
    const { cfg, r } = run('colorado');
    expect(r.honest.winner).not.toBe(cfg.favored);
    expect(r.headline.caughtAt?.via).toBe('audit');
    expect(r.certified.winner).toBe(r.honest.winner);
  });

  it('four-clerks is caught; paperless gets away', () => {
    expect(run('four-clerks').r.headline.caught).toBe(true);
    const pl = run('paperless').r.headline;
    expect(pl.flipped && !pl.caught).toBe(true);
  });
});
