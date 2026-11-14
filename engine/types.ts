/** Shared types for the engine. The engine is pure TypeScript: no DOM, no React, worker-safe. */

export type AttackId = 'stuffing' | 'impersonation' | 'harvesting' | 'tabulator' | 'canvass' | 'refusal';
export type SafeguardId =
  | 'paper'
  | 'reconciliation'
  | 'mixedStaffing'
  | 'observers'
  | 'auditRate'
  | 'recountTrigger'
  | 'courts';

export type GridSize = 'S' | 'M' | 'L' | 'XL';

export interface Candidate {
  name: string;
  /** Faction (party stand-in) shown on the ballot. */
  faction: string;
  /** Council loyalty: -1 (against the Council) to +1 (for it). */
  x: number;
  /** Who gets a vote: -1 (goblins only) to +1 (every species, houseplants included). */
  y: number;
}

export interface Config {
  v: 1;
  seed: number;
  size: GridSize;
  ballotId: string;
  candidates: Candidate[];
  /** Index of the candidate the attackers work for. */
  favored: number;
  /** Population share per species id, 0-100 (normalised by the engine). */
  species: Record<string, number>;
  /** 0 = every precinct has the isle-wide mix; 100 = species live in tight enclaves. */
  clustering: number;
  /** Share of voters who vote by mail, 0-100. */
  mailShare: number;
  /** Where staffing is not mixed: share of polling places the ruling (attackers') faction staffs
   * itself instead of the local majority, 0-100. 100 is a city machine. */
  patronage: number;
  /** How hard each attack is pushed, 0-100 (reach: share of the places it is tried). */
  attacks: Record<AttackId, number>;
  /** How strong each safeguard is, 0-100. See SAFEGUARDS for units. */
  safeguards: Record<SafeguardId, number>;
  /** Risk-limiting audit: keep drawing ballots until the risk limit is met. */
  rla: boolean;
  /** Risk limit for the audit, in percent. */
  riskLimit: number;
}

export interface Species {
  id: string;
  name: string;
  x: number;
  y: number;
  turnout: number;
  registration: number;
  /** Relative appetite for voting by mail. */
  mail: number;
}

export type Phase =
  | 'registration'
  | 'mail'
  | 'election-day'
  | 'count'
  | 'canvass'
  | 'audit'
  | 'certification'
  | 'aftermath';

/** Where a catch happened: the safeguard or mechanism that caught it. */
export type CatchVia =
  | 'staff-refusal'
  | 'observer'
  | 'reconciliation'
  | 'tape-mismatch'
  | 'roll-check'
  | 'audit'
  | 'recount'
  | 'court'
  | 'leak'
  | 'forensics';

export interface Conspirator {
  layer: AttackId;
  role: string;
  faction: number | null;
  precinct: number | null;
  node: number | null;
  /** Chance this person talks before the result is final. */
  leakP: number;
  recruited: boolean;
  leaked: boolean;
}

export interface Catch {
  layer: AttackId;
  phase: Phase;
  via: CatchVia;
  precinct: number | null;
  node: number | null;
  text: string;
}

export interface SimEvent {
  phase: Phase;
  text: string;
  tone: 'info' | 'attack' | 'catch' | 'flag' | 'outcome';
  precinct?: number;
  node?: number;
}

export interface PrecinctStatic {
  i: number;
  col: number;
  row: number;
  name: string;
  node: number;
  eligible: number;
  registered: number;
  speciesShare: number[];
  /** Faction holding each of the three poll roles (judge, clerk, inspector). */
  staff: number[];
  observer: boolean;
  paper: boolean;
  reconciles: boolean;
  /** Independent parties present: distinct staff factions, plus one for an observer. */
  oversight: number;
}

/** Counts for one precinct at one stage of the cycle. */
export interface Counts {
  inPerson: number[];
  mail: number[];
  /** In-person sign-ins in the poll book. */
  signins: number;
  mailSent: number;
  mailReturned: number;
}

export interface PrecinctResult {
  static: PrecinctStatic;
  honest: Counts;
  /** The paper in the boxes (what a hand count finds). Paperless precincts copy `reported`. */
  paper: number[];
  /** The published return after the canvass and any audit or recount. */
  reported: number[];
  /** Attacks that touched this precinct and were not stopped. */
  tampered: AttackId[];
  /** Attacks that were tried here and stopped. */
  stopped: AttackId[];
  /** Forensic tests that flagged this precinct. */
  flags: string[];
  published: Counts;
}

export interface NodeInfo {
  i: number;
  name: string;
  precincts: number[];
  cx: number;
  cy: number;
  meanOversight: number;
  canvassBoard: number[];
}

export interface AuditResult {
  ran: boolean;
  mode: 'none' | 'fixed' | 'rla';
  drawn: number;
  /** Ballots a ballot-polling RLA needs on average at this margin (Wald approximation). */
  asn: number;
  confirmed: boolean;
  escalated: boolean;
  recountTriggered: boolean;
  paperShare: number;
  margin: number;
  note: string;
}

export type DetectorStatus = 'pass' | 'warn' | 'fail' | 'na';

export interface DetectorResult {
  id: string;
  name: string;
  status: DetectorStatus;
  /** One-line statistic, for example "chi² = 31.2, df = 9, p = 0.0003". */
  stat: string;
  p: number | null;
  detail: string;
  /** Unit indexes this test singles out. */
  units: number[];
  needs?: string;
}

export interface ForensicReport {
  detectors: DetectorResult[];
  fails: number;
  warns: number;
  scatter: Array<{ x: number; y: number; w: number; unit: number }>;
  lastDigits: number[];
  secondDigits: number[];
}

export interface Headline {
  attempted: boolean;
  flipped: boolean;
  caught: boolean;
  caughtAt: Catch | null;
  /** The certified result stood, was corrected, or the election was rerun. */
  outcome: 'certified' | 'corrected' | 'rerun' | 'installed';
  conspirators: number;
  text: string;
}

export interface Tally {
  totals: number[];
  winner: number;
  ballots: number;
}

export interface ElectionResult {
  config: Config;
  cols: number;
  rows: number;
  precincts: PrecinctResult[];
  nodes: NodeInfo[];
  honest: Tally;
  /** Totals before audit, recount and certification. */
  canvassed: Tally;
  certified: Tally;
  conspirators: Conspirator[];
  catches: Catch[];
  events: SimEvent[];
  audit: AuditResult;
  forensics: ForensicReport;
  headline: Headline;
  insular: number;
}
