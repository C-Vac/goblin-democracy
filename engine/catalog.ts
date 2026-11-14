/** The fixed parts of Mudwick Isle: species, ballots, attack and safeguard descriptions. */

import type { AttackId, Candidate, CandidateType, PartyId, Phase, SafeguardId, Species } from './types';

export const PHASE_ORDER: Phase[] = ['registration', 'mail', 'election-day', 'count', 'canvass', 'audit', 'certification', 'aftermath'];

export const SPECIES: Species[] = [
  { id: 'goblin', name: 'Goblins', x: 0.35, y: -0.35, turnout: 0.62, registration: 0.9, mail: 1.0 },
  { id: 'gnome', name: 'Gnomes', x: -0.7, y: 0.55, turnout: 0.7, registration: 0.86, mail: 1.3 },
  { id: 'troll', name: 'Trolls', x: 0.55, y: 0.05, turnout: 0.46, registration: 0.8, mail: 0.6 },
  { id: 'pixie', name: 'Pixies', x: -0.35, y: 0.8, turnout: 0.56, registration: 0.76, mail: 1.5 },
  { id: 'dwarf', name: 'Dwarves', x: -0.1, y: -0.6, turnout: 0.66, registration: 0.88, mail: 1.1 },
  // Goblins the Council reclassified as houseplants. Still on the rolls, mostly.
  { id: 'leafy', name: 'Leafies', x: -0.55, y: 0.95, turnout: 0.4, registration: 0.62, mail: 2.0 },
];

export interface PartyInfo { id: PartyId; name: string; colour: string }

/** Blocs, in colour order. Council purple, Gallery green, independents orange; never red against blue. */
export const PARTIES: PartyInfo[] = [
  { id: 'council', name: 'Council bloc', colour: 'purple' },
  { id: 'gallery', name: 'Gallery bloc', colour: 'green' },
  { id: 'independent', name: 'Independent', colour: 'orange' },
  { id: 'minor-a', name: 'Minor party', colour: 'magenta' },
  { id: 'minor-b', name: 'Minor party', colour: 'sky' },
];

export interface TypeInfo { id: CandidateType; name: string; help: string }

export const CANDIDATE_TYPES: TypeInfo[] = [
  { id: 'incumbent', name: 'Incumbent', help: 'Everyone knows the name: a lift everywhere. Their faction staffs the polling places that patronage hands out.' },
  { id: 'aligned', name: 'Council-aligned', help: 'Endorsed by the Council: a lift among species loyal to it.' },
  { id: 'reformer', name: 'Reformer', help: 'Runs against the way things are done: a lift among species who distrust the Council.' },
  { id: 'radical', name: 'Radical', help: 'Loved in some places and loathed in others: local swings twice as wide, and a little less support overall.' },
  { id: 'protest', name: 'Protest', help: 'A vote to make a point: far less support, spread thin.' },
];

export interface Ballot {
  id: string;
  title: string;
  candidates: Candidate[];
  favored: number;
}

export const BALLOTS: Ballot[] = [
  {
    id: 'chair',
    title: 'Supreme Chair of Mudwick Isle, special election',
    favored: 0,
    candidates: [
      { name: 'Gnarly Gladhand', faction: 'Council Unity', party: 'council', type: 'aligned', x: 0.85, y: -0.35 },
      { name: 'Gnarlene Gnarltooth', faction: 'Independent Grievance', party: 'independent', type: 'radical', x: -0.55, y: 0.35 },
      { name: 'Glurp', faction: 'Public Gallery', party: 'gallery', type: 'reformer', x: -0.15, y: -0.75 },
    ],
  },
  {
    id: 'terms',
    title: 'Referendum: extend Elder terms to 1,000 years',
    favored: 0,
    candidates: [
      { name: 'Yes', faction: 'Friends of the Elders', party: 'council', type: 'aligned', x: 0.6, y: 0 },
      { name: 'No', faction: 'Term Limits Now', party: 'gallery', type: 'reformer', x: -0.45, y: 0.05 },
    ],
  },
  {
    id: 'crowded',
    title: 'Supreme Chair, crowded field',
    favored: 0,
    candidates: [
      { name: 'Gnarly Gladhand', faction: 'Council Unity', party: 'council', type: 'aligned', x: 0.85, y: -0.35 },
      { name: 'Gnarlene Gnarltooth', faction: 'Independent Grievance', party: 'independent', type: 'radical', x: -0.55, y: 0.35 },
      { name: 'Glurp', faction: 'Public Gallery', party: 'gallery', type: 'reformer', x: -0.15, y: -0.75 },
      { name: 'Barley Sniffington', faction: 'Paws for Progress', party: 'minor-a', type: 'aligned', x: 0.0, y: 1.0 },
      { name: 'Gnarfle', faction: 'Cheese and Comedy', party: 'minor-b', type: 'protest', x: -0.3, y: -0.2 },
    ],
  },
];

export interface LayerInfo<T extends string> {
  id: T;
  name: string;
  short: string;
  /** Who does it (for conspirator counts and headlines). */
  actor: string;
  actors: string;
  help: string;
}

export const ATTACKS: LayerInfo<AttackId>[] = [
  {
    id: 'gerrymander', name: 'Gerrymandering', short: 'Gerrymander', actor: 'map-drawer', actors: 'map-drawers',
    help: 'The boundary commission moves polling places between neighbouring districts: the other side packed into a few, your own spread thin. Nobody touches a ballot. It flips results only when the winner is whoever takes the most districts.',
  },
  {
    id: 'stuffing', name: 'Ballot stuffing', short: 'Stuffing', actor: 'clerk', actors: 'clerks',
    help: 'Poll workers drop extra ballots in the box. Needs every worker in the room, so the attackers try the safest polling places first. Leaves more ballots than sign-ins.',
  },
  {
    id: 'impersonation', name: 'Impersonation', short: 'Impersonation', actor: 'repeater', actors: 'repeaters',
    help: 'Repeaters sign in under the names of voters who stayed home. Ballots still match sign-ins, so reconciliation misses it; the real voter turning up later does not.',
  },
  {
    id: 'harvesting', name: 'Mail-ballot harvesting', short: 'Harvesting', actor: 'operative', actors: 'operatives',
    help: 'Paid operatives collect mail ballots door to door, bin the ones for the other side and fill in unused ones. Many hands, so many chances to talk.',
  },
  {
    id: 'tabulator', name: 'Tabulator tampering', short: 'Tabulators', actor: 'technician', actors: 'technicians',
    help: 'Technicians at a counting house make the machines move a few votes. Two people per counting house. Only paper and a hand count can show it.',
  },
  {
    id: 'canvass', name: 'Canvass collusion', short: 'Canvass', actor: 'canvasser', actors: 'canvassers',
    help: 'The board that adds up the precinct returns writes in its own numbers. Hand-written numbers have tell-tale digits, and an observer with a photo of the posted tape can catch it.',
  },
  {
    id: 'refusal', name: 'Refusal to certify', short: 'Refusal', actor: 'board member', actors: 'board members',
    help: 'If the wrong candidate wins, the certification board refuses to sign and names its own winner. Done in public; only the courts can stop it.',
  },
];

export const SAFEGUARDS: LayerInfo<SafeguardId>[] = [
  {
    id: 'paper', name: 'Paper ballots', short: 'Paper', actor: '', actors: '',
    help: 'Share of polling places with a voter-marked paper ballot. Without paper, an audit or recount has nothing to count.',
  },
  {
    id: 'reconciliation', name: 'Sign-in reconciliation', short: 'Reconciliation', actor: '', actors: '',
    help: 'Share of polling places whose ballot count is checked against the poll book at the canvass, and whose rolls are checked for double and dead voters afterwards.',
  },
  {
    id: 'mixedStaffing', name: 'Mixed-faction staffing', short: 'Mixed staff', actor: '', actors: '',
    help: 'Share of polling places and boards staffed from more than one faction. Fraud has to recruit the other side, and the other side tends to say no.',
  },
  {
    id: 'observers', name: 'Observers', short: 'Observers', actor: '', actors: '',
    help: 'Share of polling places with an independent observer, who watches the box and photographs the posted results tape.',
  },
  {
    id: 'auditRate', name: 'Audit sample rate', short: 'Audit', actor: '', actors: '',
    help: 'Paper ballots hand-checked at random after the count: 0 to 10% of ballots. If the sample cannot confirm the winner, everything is hand counted.',
  },
  {
    id: 'recountTrigger', name: 'Recount trigger', short: 'Recount', actor: '', actors: '',
    help: 'Automatic full hand count when the margin is under this threshold: 0 to 2 percentage points.',
  },
  {
    id: 'courts', name: 'Courts', short: 'Courts', actor: '', actors: '',
    help: 'Chance that evidence put before a court leads to a remedy: an order to certify, a correction or a new election.',
  },
];

export const PHASES: Array<{ id: string; name: string }> = [
  { id: 'registration', name: 'Rolls and staffing' },
  { id: 'mail', name: 'Mail voting' },
  { id: 'election-day', name: 'Election day' },
  { id: 'count', name: 'Count' },
  { id: 'canvass', name: 'Canvass' },
  { id: 'audit', name: 'Audit and recount' },
  { id: 'certification', name: 'Certification' },
  { id: 'aftermath', name: 'Aftermath' },
];

export const CATCH_PLACE: Record<string, string> = {
  commission: 'at the boundary commission',
  'staff-refusal': 'at the polling place',
  observer: 'at the polling place',
  reconciliation: 'at the canvass',
  'tape-mismatch': 'at the canvass',
  'roll-check': 'in the roll check',
  audit: 'in the audit',
  recount: 'in the recount',
  court: 'in court',
  leak: 'by a leak',
  forensics: 'by the statisticians',
};

const PREFIX = ['Bog', 'Mire', 'Sludge', 'Fen', 'Gristle', 'Moss', 'Toad', 'Rot', 'Murk', 'Grub', 'Silt', 'Damp', 'Ooze', 'Wart', 'Slime', 'Newt', 'Mould', 'Grime'];
const SUFFIX = ['side', 'bottom', ' Row', ' Hollow', ' Lanes', ' Wharf', ' Flats', ' Steps', 'wick', ' Cross', 'gate', ' End', 'moor', ' Market'];

export function placeName(i: number): string {
  const p = PREFIX[(i * 7 + 3) % PREFIX.length];
  const s = SUFFIX[(i * 5 + Math.floor(i / PREFIX.length)) % SUFFIX.length];
  return `${p}${s}`;
}
