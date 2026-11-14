/** Default config, presets, and the URL codec (config plus seed in the link). */

import { BALLOTS, SPECIES } from './catalog';
import type { AttackId, Config, SafeguardId } from './types';

export const ATTACK_IDS: AttackId[] = ['stuffing', 'impersonation', 'harvesting', 'tabulator', 'canvass', 'refusal'];
export const SAFEGUARD_IDS: SafeguardId[] = ['paper', 'reconciliation', 'mixedStaffing', 'observers', 'auditRate', 'recountTrigger', 'courts'];

const noAttacks = (): Record<AttackId, number> => Object.fromEntries(ATTACK_IDS.map((id) => [id, 0])) as Record<AttackId, number>;

export const DEFAULT_SPECIES: Record<string, number> = { goblin: 38, gnome: 16, troll: 14, pixie: 10, dwarf: 12, leafy: 10 };

export function defaultConfig(): Config {
  const ballot = BALLOTS[0];
  return {
    v: 1,
    seed: 7,
    size: 'M',
    ballotId: ballot.id,
    candidates: ballot.candidates.map((c) => ({ ...c })),
    favored: ballot.favored,
    species: { ...DEFAULT_SPECIES },
    clustering: 45,
    mailShare: 30,
    patronage: 20,
    attacks: noAttacks(),
    safeguards: { paper: 100, reconciliation: 80, mixedStaffing: 60, observers: 40, auditRate: 20, recountTrigger: 25, courts: 70 },
    rla: false,
    riskLimit: 5,
  };
}

/** The same election with every attack switched off: the honest baseline for Monte Carlo. */
export function cleanVersion(cfg: Config): Config {
  return { ...cfg, attacks: noAttacks() };
}

export function withBallot(cfg: Config, ballotId: string): Config {
  const b = BALLOTS.find((x) => x.id === ballotId) ?? BALLOTS[0];
  return { ...cfg, ballotId: b.id, candidates: b.candidates.map((c) => ({ ...c })), favored: b.favored };
}

export interface Preset {
  id: string;
  name: string;
  kind: 'sandbox' | 'history';
  blurb: string;
  /** What to look for after pressing Start. */
  notice: string;
  source?: string;
  config: Config;
}

function make(patch: (c: Config) => void, ballotId = 'chair'): Config {
  const c = withBallot(defaultConfig(), ballotId);
  patch(c);
  return c;
}

export const PRESETS: Preset[] = [
  {
    id: 'fair', name: 'Free and fair', kind: 'sandbox',
    blurb: 'Nobody cheats. Sensible safeguards.',
    notice: 'Every test should pass most of the time. Run Monte Carlo to see how often one fails anyway.',
    config: make(() => {}),
  },
  {
    id: 'looks-guilty', name: 'A clean election that looks guilty', kind: 'sandbox',
    blurb: 'Nobody cheats. The numbers say otherwise.',
    notice: 'Species that vote as a bloc in tight enclaves make whole districts look stuffed. Nobody touched a ballot; check the Truth view. Real elections trip these tests by chance too.',
    config: make((c) => { c.seed = 89; c.clustering = 100; c.species = { goblin: 30, gnome: 20, troll: 20, pixie: 10, dwarf: 10, leafy: 10 }; }),
  },
  {
    id: 'four-clerks', name: 'Four corrupt clerks', kind: 'sandbox',
    blurb: 'One stuffed box in one quiet polling place.',
    notice: 'Four people are enough to stuff one box, and the sign-in reconciliation at the canvass is enough to find it.',
    config: make((c) => { c.seed = 1; c.attacks.stuffing = 1; }),
  },
  {
    id: 'council-classic', name: 'The Council classic', kind: 'sandbox',
    blurb: 'Stuffing, repeaters and a friendly canvass, with nobody watching.',
    notice: 'Turn mixed staffing and observers back up and watch the number of polling places it can reach fall.',
    config: make((c) => {
      c.seed = 1;
      c.patronage = 70;
      c.attacks = { ...c.attacks, stuffing: 35, impersonation: 25, canvass: 30 };
      c.safeguards = { paper: 100, reconciliation: 20, mixedStaffing: 0, observers: 5, auditRate: 0, recountTrigger: 0, courts: 20 };
    }),
  },
  {
    id: 'refusal', name: 'Refusal to certify', kind: 'sandbox',
    blurb: 'Lose fair and square, then refuse to sign.',
    notice: 'No ballot is touched. Whether the count stands depends on the board and the courts alone.',
    config: make((c) => { c.favored = 2; c.attacks.refusal = 100; c.safeguards.mixedStaffing = 20; c.safeguards.courts = 50; }),
  },
  {
    id: 'total', name: 'Total capture', kind: 'sandbox',
    blurb: 'Every attack at full reach. Every safeguard off.',
    notice: 'Reconciliation and the digit tests go red, someone talks, and with no courts to act on any of it the result stands.',
    config: make((c) => {
      c.patronage = 100;
      c.attacks = { stuffing: 100, impersonation: 100, harvesting: 100, tabulator: 100, canvass: 100, refusal: 100 };
      c.safeguards = { paper: 0, reconciliation: 0, mixedStaffing: 0, observers: 0, auditRate: 0, recountTrigger: 0, courts: 0 };
    }),
  },
  {
    id: 'machine', name: 'One-party city machine', kind: 'history',
    blurb: 'Historical pattern: 19th-century US city machines.',
    notice: 'With one faction in every role, stuffing and repeaters need few people and nobody refuses. Raise mixed staffing alone and see what happens.',
    source: 'Pattern described in Campbell (2005) and Alvarez, Hall and Hyde (2008): machines such as Tammany Hall staffed every polling place, ran repeaters and controlled the count.',
    config: make((c) => {
      c.seed = 1;
      c.clustering = 60;
      c.patronage = 100;
      c.attacks = { ...c.attacks, stuffing: 40, impersonation: 50, canvass: 20 };
      c.safeguards = { paper: 100, reconciliation: 0, mixedStaffing: 0, observers: 0, auditRate: 0, recountTrigger: 0, courts: 15 };
    }),
  },
  {
    id: 'nc-2018', name: '2018 North Carolina absentee scheme', kind: 'history',
    blurb: 'Historical pattern: paid operatives harvesting mail ballots in two counties.',
    notice: 'Harvesting needs many hands, so someone talks, and the mail returns look wrong in public data. The fix came from the board and the courts: a new election.',
    source: 'North Carolina 9th congressional district, 2018. The State Board of Elections heard evidence of absentee-ballot tampering in Bladen and Robeson counties, declined to certify and ordered a new election (2019).',
    config: make((c) => { c.seed = 5; c.mailShare = 35; c.attacks.harvesting = 8; c.safeguards.courts = 90; }),
  },
  {
    id: 'paperless', name: 'Paperless machines, no audit', kind: 'history',
    blurb: 'Historical pattern: touchscreen voting with no paper record.',
    notice: 'Without paper, no audit or recount can check a machine. This preset adds tampering to show the blind spot; it does not claim any real machine was tampered with.',
    source: 'Paperless direct-recording electronic machines were common in US jurisdictions into the 2010s; security reviews criticised them because they leave nothing to audit.',
    config: make((c) => {
      c.seed = 3;
      c.attacks.tabulator = 40;
      c.safeguards = { ...c.safeguards, paper: 0, auditRate: 0 };
    }),
  },
  {
    id: 'colorado', name: 'Close race, strong audit', kind: 'history',
    blurb: 'Historical pattern: a risk-limiting audit on a tight result.',
    notice: 'A small tabulator nudge turns a narrow loss into a narrow win. The audit samples until it is confident, finds the paper disagrees, and the hand count puts it back.',
    source: 'Colorado ran the first statewide risk-limiting audits after its 2017 election. Ballot-polling math: Lindeman, Stark and Yates (2012).',
    config: make((c) => {
      c.seed = 3;
      c.species = { goblin: 40, gnome: 16, troll: 12, pixie: 10, dwarf: 12, leafy: 10 };
      c.attacks.tabulator = 25;
      c.rla = true;
      c.safeguards = { ...c.safeguards, paper: 100, auditRate: 0, recountTrigger: 0 };
    }, 'terms'),
  },
];

// --- URL codec -----------------------------------------------------------------------------------

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function encodeConfig(cfg: Config): string {
  return b64urlEncode(JSON.stringify(cfg));
}

const num = (x: unknown, lo: number, hi: number, d: number) => {
  const v = Number(x);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
};

/** Parse and clamp a config from a link. Anything missing or broken falls back to the default. */
export function decodeConfig(s: string): Config | null {
  try {
    const raw = JSON.parse(b64urlDecode(s));
    const d = defaultConfig();
    const candidates = Array.isArray(raw.candidates) && raw.candidates.length >= 2 && raw.candidates.length <= 5
      ? raw.candidates.map((c: Record<string, unknown>) => ({
        name: String(c.name ?? '').slice(0, 40) || 'Candidate',
        faction: String(c.faction ?? '').slice(0, 40) || 'Independent',
        x: num(c.x, -1, 1, 0),
        y: num(c.y, -1, 1, 0),
      }))
      : d.candidates;
    return {
      v: 1,
      seed: Math.floor(num(raw.seed, 0, 2 ** 31, d.seed)),
      size: ['S', 'M', 'L', 'XL'].includes(raw.size) ? raw.size : d.size,
      ballotId: String(raw.ballotId ?? d.ballotId).slice(0, 20),
      candidates,
      favored: Math.floor(num(raw.favored, 0, candidates.length - 1, 0)),
      species: Object.fromEntries(SPECIES.map((s) => [s.id, num(raw.species?.[s.id], 0, 100, DEFAULT_SPECIES[s.id])])),
      clustering: num(raw.clustering, 0, 100, d.clustering),
      mailShare: num(raw.mailShare, 0, 100, d.mailShare),
      patronage: num(raw.patronage, 0, 100, d.patronage),
      attacks: Object.fromEntries(ATTACK_IDS.map((id) => [id, num(raw.attacks?.[id], 0, 100, 0)])) as Config['attacks'],
      safeguards: Object.fromEntries(SAFEGUARD_IDS.map((id) => [id, num(raw.safeguards?.[id], 0, 100, d.safeguards[id])])) as Config['safeguards'],
      rla: Boolean(raw.rla),
      riskLimit: num(raw.riskLimit, 1, 20, d.riskLimit),
    };
  } catch {
    return null;
  }
}
