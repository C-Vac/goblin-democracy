/** The three answers (did it flip, was it caught, where) and the one-line result-card headline. */

import { ATTACKS, CATCH_PLACE, PHASE_ORDER } from './catalog';
import type { AttackId, Catch, ElectionResult, Headline } from './types';

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n: number) => (n <= 12 ? NUM[n] : n.toLocaleString('en-US'));

const TEST_NAME: Record<string, string> = {
  reconciliation: 'the ballot reconciliation',
  fingerprint: 'the fingerprint test',
  'last-digit': 'the last-digit test',
  'integer-pct': 'the round-number test',
  neighbours: 'the neighbour test',
  mail: 'the mail-ballot test',
  boundaries: 'the border test',
  'second-digit': "Benford's law",
  'map-outlier': 'the map test',
};

export function crewPhrase(r: ElectionResult): string {
  const by = new Map<AttackId, number>();
  r.conspirators.forEach((c) => by.set(c.layer, (by.get(c.layer) ?? 0) + 1));
  const total = r.conspirators.length;
  if (by.size === 1) {
    const [layer, k] = [...by][0];
    const info = ATTACKS.find((a) => a.id === layer)!;
    return `${num(k)} corrupt ${k === 1 ? info.actor : info.actors}`;
  }
  return `${num(total)} conspirators`;
}

function place(c: Catch): string {
  if (c.via === 'leak') {
    const info = ATTACKS.find((a) => a.id === c.layer)!;
    return `when ${/^[aeiou]/i.test(info.actor) ? 'an' : 'a'} ${info.actor} talked`;
  }
  if (c.via === 'court' && c.phase === 'certification') return 'in court';
  return CATCH_PLACE[c.via] ?? 'eventually';
}

export function firstCatch(catches: Catch[]): Catch | null {
  let best: Catch | null = null;
  for (const c of catches) {
    if (!best || PHASE_ORDER.indexOf(c.phase) < PHASE_ORDER.indexOf(best.phase)) best = c;
  }
  return best;
}

export function headlineFor(r: ElectionResult, refusalAttempted: boolean): Headline {
  const cfg = r.config;
  const f = cfg.favored;
  const attempted = r.conspirators.length > 0 || refusalAttempted;
  const flipped = r.certified.winner !== r.honest.winner;
  const caughtAt = firstCatch(r.catches);
  const caught = caughtAt !== null;
  const outcome = r.headline.outcome;
  const crew = crewPhrase(r);
  let text: string;
  if (!attempted) {
    const fired = r.forensics.detectors.find((d) => d.status === 'fail');
    text = fired
      ? `Held a clean Mudwick election; ${TEST_NAME[fired.id] ?? 'a test'} called it rigged anyway`
      : 'Held a clean Mudwick election, and every test agrees';
  } else if (outcome === 'installed') {
    const k = r.conspirators.filter((c) => c.layer === 'refusal').length;
    text = `Lost the Mudwick election and took office anyway: ${num(k)} board members refused to certify`;
  } else if (outcome === 'rerun') {
    text = `Tried to steal the Mudwick election with ${crew}, caught ${caughtAt ? place(caughtAt) : 'in court'}; new election ordered`;
  } else if (flipped && !caught) {
    text = `Stole the Mudwick election with ${crew} and got away with it`;
  } else if (flipped) {
    text = `Stole the Mudwick election with ${crew}, caught ${place(caughtAt!)}, and kept it anyway`;
  } else if (caught) {
    text = `Tried to steal the Mudwick election with ${crew}, caught ${place(caughtAt!)}`;
  } else if (r.honest.winner === f) {
    text = `Rigged a Mudwick election ${cfg.candidates[f].name} was winning anyway, with ${crew}. Nobody noticed`;
  } else {
    text = `Rigged the Mudwick election with ${crew} and lost anyway`;
  }
  return { attempted, flipped, caught, caughtAt, outcome, conspirators: r.conspirators.length, text };
}
