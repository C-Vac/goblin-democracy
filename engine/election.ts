/**
 * One election cycle on Mudwick Isle: rolls and staffing, mail voting, election day, the count,
 * the canvass, the audit and recount, certification and the aftermath. Attacks change the
 * numbers; safeguards and leaks catch them; forensics read only what was published.
 */

import { bravoAsn, bravoConfirmed, bravoStart, bravoStep, makeBallotDrawer } from './audit';
import { ATTACKS, PHASE_ORDER } from './catalog';
import { runForensics, type Table } from './forensics';
import { headlineFor } from './headline';
import { stream, type Rng } from './rng';
import { buildWorld, type World } from './world';
import type {
  AttackId, AuditResult, Catch, CatchVia, Config, Conspirator, Counts, ElectionResult, NodeInfo,
  Phase, PrecinctResult, PrecinctStatic, SafeguardId, SimEvent, Tally,
} from './types';

export { PHASE_ORDER };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function tallyOf(rows: number[][], C: number): Tally {
  const totals = new Array(C).fill(0);
  rows.forEach((r) => r.forEach((v, j) => { totals[j] += v; }));
  return { totals, winner: totals.indexOf(Math.max(...totals)), ballots: sum(totals) };
}

const cloneCounts = (c: Counts): Counts => ({ inPerson: [...c.inPerson], mail: [...c.mail], signins: c.signins, mailSent: c.mailSent, mailReturned: c.mailReturned });

/** The published returns as a generic forensic table. */
export function tableFrom(world: World, cfg: Config, reported: number[][], counts: Counts[]): Table {
  return {
    options: cfg.candidates.map((c) => c.name),
    units: world.statics.map((p) => {
      const ballots = sum(reported[p.i]);
      // The mail channel as counted. Tabulator and canvass changes land on the in-person side.
      const mail = counts[p.i].mail.map((v, j) => Math.min(v, reported[p.i][j]));
      return {
        id: `${String.fromCharCode(65 + (p.col % 26))}${p.row + 1}`,
        name: p.name,
        x: p.col,
        y: p.row,
        node: world.nodes[p.node].name,
        eligible: p.eligible,
        registered: p.registered,
        voters: counts[p.i].signins + counts[p.i].mailReturned,
        mailSent: counts[p.i].mailSent,
        mailReturned: counts[p.i].mailReturned,
        counts: reported[p.i].slice(),
        mail: ballots ? mail : undefined,
      };
    }),
  };
}

export interface RunOptions {
  forensics?: boolean;
}

export function runElection(cfg: Config, opts: RunOptions = {}): ElectionResult {
  const world = buildWorld(cfg);
  const { statics, honest, nodes } = world;
  const n = statics.length;
  const C = cfg.candidates.length;
  const f = Math.max(0, Math.min(C - 1, cfg.favored));
  const A = (id: AttackId) => Math.max(0, Math.min(1, (cfg.attacks[id] ?? 0) / 100));
  const S = (id: SafeguardId) => Math.max(0, Math.min(1, (cfg.safeguards[id] ?? 0) / 100));
  const cand = (j: number) => cfg.candidates[j].name;
  const faction = (j: number) => cfg.candidates[j].faction;
  const aFaction = (j: number) => `${/^[aeiou]/i.test(faction(j)) ? 'an' : 'a'} ${faction(j)}`;

  const counts = honest.map(cloneCounts);
  const tampered = statics.map(() => new Set<AttackId>());
  const stopped = statics.map(() => new Set<AttackId>());
  const stuffed = new Array(n).fill(0);
  const impersonated = new Array(n).fill(0);
  const conspirators: Conspirator[] = [];
  const catches: Catch[] = [];
  const events: SimEvent[] = [];

  const log = (phase: Phase, text: string, tone: SimEvent['tone'] = 'info', extra: Partial<SimEvent> = {}) =>
    events.push({ phase, text, tone, ...extra });
  const addC = (layer: AttackId, role: string, fac: number | null, precinct: number | null, node: number | null, leakP: number, recruited: boolean) =>
    conspirators.push({ layer, role, faction: fac, precinct, node, leakP, recruited, leaked: false });
  const caught = (layer: AttackId, phase: Phase, via: CatchVia, text: string, precinct: number | null = null, node: number | null = null) => {
    catches.push({ layer, phase, via, precinct, node, text });
    log(phase, text, 'catch', { precinct: precinct ?? undefined, node: node ?? undefined });
  };

  /** Recruit everyone in a room. Insiders of the attackers' faction join; others mostly refuse and report. */
  const recruit = (layer: AttackId, factions: number[], role: string, precinct: number | null, node: number | null, r: Rng): number | null => {
    for (const fac of factions) {
      if (fac === f) addC(layer, role, fac, precinct, node, 0.03, false);
      else if (r() < 0.15) addC(layer, role, fac, precinct, node, 0.25, true);
      else return fac;
    }
    return null;
  };

  // Attackers go first where the room is theirs and nobody is watching.
  const safety = (p: PrecinctStatic) => (p.staff.filter((s) => s === f).length / 3) * 2 + (p.staff.every((s) => s === f) ? 1 : 0) - (p.observer ? 1.5 : 0);
  const pickTargets = (layer: AttackId, score: (p: PrecinctStatic) => number): number[] => {
    const k = Math.round(A(layer) * n);
    if (k <= 0) return [];
    const r = stream(cfg.seed, 'target', layer);
    return statics.map((p) => ({ i: p.i, s: score(p) + r() * 0.6 })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.i);
  };
  const pickNodes = (layer: AttackId, score: (node: NodeInfo) => number): NodeInfo[] => {
    const k = Math.round(A(layer) * nodes.length);
    if (k <= 0) return [];
    const r = stream(cfg.seed, 'target-node', layer);
    return nodes.map((node) => ({ node, s: score(node) + r() * 0.5 })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.node);
  };

  // --- Rolls and staffing -------------------------------------------------------------------
  const insular = statics.filter((p) => p.oversight <= 1).length;
  log('registration', `${n} polling places report to ${nodes.length} counting houses. ${insular} are insular: one faction holds every role and nobody is watching.`);

  // --- Mail voting: harvesting ----------------------------------------------------------------
  const harvestTargets = pickTargets('harvesting', (p) => (counts[p.i].mailSent / Math.max(1, p.registered)) * 4);
  const harvestNodes = new Set<number>();
  let operatives = 0;
  for (const i of harvestTargets) {
    const p = statics[i];
    const c = counts[i];
    const r = stream(cfg.seed, 'harvest', i);
    const share = 0.5 + 0.3 * r();
    const originalReturned = c.mailReturned;
    let binned = 0;
    for (let j = 0; j < C; j++) {
      if (j === f) continue;
      const d = Math.round(c.mail[j] * share * 0.7);
      c.mail[j] -= d;
      binned += d;
    }
    const fill = Math.round((c.mailSent - originalReturned) * share * 0.5);
    c.mail[f] += fill;
    c.mailReturned += fill - binned;
    const ops = Math.max(1, Math.ceil((c.mailSent * share) / 30));
    for (let k = 0; k < ops; k++) addC('harvesting', 'operative', null, i, p.node, 0.06, false);
    operatives += ops;
    if (!harvestNodes.has(p.node)) {
      harvestNodes.add(p.node);
      addC('harvesting', 'organiser', f, null, p.node, 0.04, false);
    }
    tampered[i].add('harvesting');
  }
  if (harvestTargets.length) {
    log('mail', `${operatives} paid operatives go door to door in ${harvestTargets.length} precinct${harvestTargets.length === 1 ? '' : 's'} collecting mail ballots. Some reach the post office.`, 'attack');
  }

  // --- Election day: stuffing and impersonation ----------------------------------------------
  let stuffedPlaces = 0;
  for (const i of pickTargets('stuffing', safety)) {
    const p = statics[i];
    const r = stream(cfg.seed, 'stuff', i);
    addC('stuffing', 'precinct captain', f, i, p.node, 0.04, false);
    const refuser = recruit('stuffing', p.staff, 'clerk', i, p.node, r);
    if (refuser !== null) {
      stopped[i].add('stuffing');
      caught('stuffing', 'election-day', 'staff-refusal', `${p.name}: ${aFaction(refuser)} clerk refused to stuff the box and reported it.`, i, p.node);
      continue;
    }
    if (p.observer && r() < 0.6) {
      stopped[i].add('stuffing');
      caught('stuffing', 'election-day', 'observer', `${p.name}: an observer watched a bundle of ballots go into the box after closing.`, i, p.node);
      continue;
    }
    const c = counts[i];
    const room = Math.max(0, p.registered - c.signins - c.mailReturned);
    const extra = Math.min(room, Math.round(p.registered * (0.08 + 0.08 * r())));
    c.inPerson[f] += extra;
    stuffed[i] = extra;
    tampered[i].add('stuffing');
    stuffedPlaces++;
  }
  if (stuffedPlaces) log('election-day', `Boxes in ${stuffedPlaces} polling place${stuffedPlaces === 1 ? ' is' : 's are'} heavier than ${stuffedPlaces === 1 ? 'its poll book' : 'their poll books'}.`, 'attack');

  let impPlaces = 0;
  for (const i of pickTargets('impersonation', safety)) {
    const p = statics[i];
    const c = counts[i];
    const r = stream(cfg.seed, 'impersonate', i);
    const avail = Math.max(0, p.registered - c.signins - c.mailReturned);
    const fake = Math.round(Math.min(avail * 0.5, p.registered * (0.05 + 0.05 * r())));
    if (fake <= 0) continue;
    addC('impersonation', 'organiser', f, i, p.node, 0.04, false);
    for (let k = 0; k < Math.max(1, Math.ceil(fake / 12)); k++) addC('impersonation', 'repeater', null, i, p.node, 0.05, false);
    const watchers = p.staff.filter((s) => s !== f);
    const spotter = watchers.find(() => r() < 0.12);
    if (spotter !== undefined) {
      stopped[i].add('impersonation');
      caught('impersonation', 'election-day', 'staff-refusal', `${p.name}: ${aFaction(spotter)} clerk recognised the same repeater signing in for the third time.`, i, p.node);
      continue;
    }
    if (p.observer && r() < 0.25) {
      stopped[i].add('impersonation');
      caught('impersonation', 'election-day', 'observer', `${p.name}: an observer noticed voters reading their own names off a card.`, i, p.node);
      continue;
    }
    c.signins += fake;
    c.inPerson[f] += fake;
    impersonated[i] = fake;
    tampered[i].add('impersonation');
    impPlaces++;
  }
  if (impPlaces) log('election-day', `Repeaters sign in under absent voters' names in ${impPlaces} polling place${impPlaces === 1 ? '' : 's'}.`, 'attack');

  // --- Count: tabulators ----------------------------------------------------------------------
  const machine = counts.map((c) => c.inPerson.map((v, j) => v + c.mail[j]));
  const paper = machine.map((m) => m.slice());
  for (const node of pickNodes('tabulator', (nd) => -nd.meanOversight)) {
    const r = stream(cfg.seed, 'tabulator', node.i);
    addC('tabulator', 'technician', f, null, node.i, 0.03, false);
    addC('tabulator', 'technician', f, null, node.i, 0.03, false);
    const rate = 0.05 + 0.04 * r();
    for (const i of node.precincts) {
      for (let j = 0; j < C; j++) {
        if (j === f) continue;
        const m = Math.round(machine[i][j] * rate);
        machine[i][j] -= m;
        machine[i][f] += m;
      }
      tampered[i].add('tabulator');
    }
    log('count', `The ${node.name} machines move ${(rate * 100).toFixed(0)}% of the opposition's votes to ${cand(f)}.`, 'attack', { node: node.i });
  }
  // Without paper, the machine's word is the only record.
  statics.forEach((p) => { if (!p.paper) paper[p.i] = machine[p.i].slice(); });

  // --- Canvass ----------------------------------------------------------------------------------
  const reported = machine.map((m) => m.slice());
  const colluding = new Set<number>();
  for (const node of pickNodes('canvass', (nd) => nd.canvassBoard.filter((x) => x === f).length)) {
    const r = stream(cfg.seed, 'canvass', node.i);
    const refuser = recruit('canvass', node.canvassBoard, 'canvasser', null, node.i, r);
    if (refuser !== null) {
      caught('canvass', 'canvass', 'staff-refusal', `${node.name}: ${aFaction(refuser)} canvasser refused to sign the altered returns.`, null, node.i);
      continue;
    }
    colluding.add(node.i);
    const order = node.precincts.map((i) => ({ i, s: (statics[i].observer ? 1 : 0) + r() * 0.5 })).sort((a, b) => a.s - b.s).map((x) => x.i);
    const chosen = order.slice(0, Math.ceil(order.length * 0.6));
    const done: number[] = [];
    let exposed = false;
    for (const i of chosen) {
      if (statics[i].observer && r() < 0.8) {
        exposed = true;
        caught('canvass', 'canvass', 'tape-mismatch', `${statics[i].name}: an observer's photo of the posted tape does not match the ${node.name} canvass.`, i, node.i);
        break;
      }
      reported[i] = fabricate(reported[i], f, r);
      done.push(i);
      tampered[i].add('canvass');
    }
    if (exposed) {
      for (const i of done) { reported[i] = machine[i].slice(); tampered[i].delete('canvass'); stopped[i].add('canvass'); }
      colluding.delete(node.i);
    } else {
      log('canvass', `The ${node.name} canvass board writes in its own numbers for ${done.length} precinct${done.length === 1 ? '' : 's'}.`, 'attack', { node: node.i });
    }
  }

  let buried = 0;
  for (const p of statics) {
    if (!p.reconciles) continue;
    const i = p.i;
    const voters = counts[i].signins + counts[i].mailReturned;
    if (Math.abs(sum(reported[i]) - voters) <= Math.max(2, 0.005 * voters)) continue;
    if (colluding.has(p.node)) { buried++; continue; }
    if (stuffed[i] > 0) {
      const x = stuffed[i];
      counts[i].inPerson[f] -= x;
      reported[i][f] = Math.max(0, reported[i][f] - x);
      paper[i][f] = Math.max(0, paper[i][f] - x);
      machine[i][f] = Math.max(0, machine[i][f] - x);
      stuffed[i] = 0;
      tampered[i].delete('stuffing');
      stopped[i].add('stuffing');
      caught('stuffing', 'canvass', 'reconciliation', `${p.name}: ${x} more ballots than voters in the poll book. The canvass sets them aside.`, i, p.node);
    }
  }
  if (buried) log('canvass', `Colluding canvass boards wave through ${buried} returns that do not match their poll books.`, 'attack');
  const canvassed = tallyOf(reported, C);

  // --- Audit and recount --------------------------------------------------------------------------
  const alpha = Math.max(0.001, cfg.riskLimit / 100);
  const order = canvassed.totals.map((_, j) => j).sort((a, b) => canvassed.totals[b] - canvassed.totals[a]);
  const margin = canvassed.ballots ? (canvassed.totals[order[0]] - canvassed.totals[order[1] ?? order[0]]) / canvassed.ballots : 0;
  const paperIdx = statics.filter((p) => p.paper).map((p) => p.i);
  const audit: AuditResult = {
    ran: false, mode: 'none', drawn: 0, confirmed: false, escalated: false, recountTriggered: false,
    paperShare: canvassed.ballots ? sum(paperIdx.map((i) => sum(reported[i]))) / canvassed.ballots : 0,
    margin,
    asn: C > 1 && canvassed.ballots ? bravoAsn(canvassed.totals[order[0]] / canvassed.ballots, canvassed.totals[order[1]] / canvassed.ballots, alpha) : Infinity,
    note: '',
  };
  let handCount: 'audit' | 'recount' | null = null;
  if (margin < S('recountTrigger') * 0.02 && paperIdx.length) {
    handCount = 'recount';
    audit.recountTriggered = true;
    log('audit', `The margin is ${(margin * 100).toFixed(2)} points, under the ${(S('recountTrigger') * 2).toFixed(2)}-point trigger. Every paper ballot is hand counted.`);
  }
  const rate = S('auditRate') * 0.1;
  if (!handCount && paperIdx.length && (cfg.rla || rate > 0)) {
    audit.ran = true;
    audit.mode = cfg.rla ? 'rla' : 'fixed';
    const sub = tallyOf(paperIdx.map((i) => reported[i]), C);
    const st = bravoStart(sub.totals);
    const draw = makeBallotDrawer(stream(cfg.seed, 'audit'), paperIdx.map((i) => paper[i]));
    const paperTotal = sum(paperIdx.map((i) => sum(paper[i])));
    const cap = cfg.rla ? Math.min(paperTotal, 60000) : Math.max(1, Math.round(rate * paperTotal));
    while (draw && st.drawn < cap && !bravoConfirmed(st, alpha)) bravoStep(st, draw());
    audit.drawn = st.drawn;
    audit.confirmed = bravoConfirmed(st, alpha);
    if (audit.confirmed) {
      log('audit', `Auditors hand-check ${st.drawn.toLocaleString('en-US')} random paper ballots and confirm ${cand(st.winner)} at a ${cfg.riskLimit}% risk limit.`);
    } else {
      audit.escalated = true;
      handCount = 'audit';
      log('audit', `${st.drawn.toLocaleString('en-US')} sampled ballots cannot confirm ${cand(st.winner)}. The audit escalates to a full hand count.`, 'flag');
    }
  }
  if (paperIdx.length < n && (handCount || audit.ran)) {
    audit.note = `${n - paperIdx.length} polling places have no paper, so nothing there can be checked.`;
  }
  let corrected = false;
  if (handCount) {
    const fixed = new Map<AttackId, number>();
    for (const i of paperIdx) {
      if (reported[i].every((v, j) => v === paper[i][j])) continue;
      for (const layer of ['tabulator', 'canvass'] as AttackId[]) {
        if (tampered[i].has(layer)) { fixed.set(layer, (fixed.get(layer) ?? 0) + 1); tampered[i].delete(layer); stopped[i].add(layer); }
      }
      reported[i] = paper[i].slice();
    }
    for (const [layer, k] of fixed) {
      corrected = true;
      caught(layer, 'audit', handCount, `The hand count finds ${k} precinct${k === 1 ? '' : 's'} whose returns do not match their paper ballots, and replaces them.`);
    }
    if (!fixed.size) log('audit', 'The hand count matches the returns.');
  }

  // --- Certification ------------------------------------------------------------------------------
  const afterAudit = tallyOf(reported, C);
  let certifiedWinner = afterAudit.winner;
  let outcome: ElectionResult['headline']['outcome'] = corrected ? 'corrected' : 'certified';
  let refusalAttempted = false;
  if (A('refusal') > 0 && afterAudit.winner !== f) {
    const r = stream(cfg.seed, 'refusal');
    if (r() < A('refusal')) {
      refusalAttempted = true;
      const others = cfg.candidates.map((_, j) => j).filter((j) => j !== f);
      const board = [0, 1, 2, 3, 4].map(() => (r() < S('mixedStaffing') ? others[Math.floor(r() * others.length)] : f));
      let refusing = 0;
      for (const s of board) {
        if (refusing >= 3) break;
        if (s === f) { addC('refusal', 'board member', s, null, null, 0.02, false); refusing++; }
        else if (r() < 0.2) { addC('refusal', 'board member', s, null, null, 0.25, true); refusing++; }
      }
      if (refusing >= 3) {
        log('certification', `The certification board refuses to certify ${cand(afterAudit.winner)} and names ${cand(f)} the winner instead.`, 'attack');
        if (r() < S('courts')) {
          caught('refusal', 'certification', 'court', 'The Mudwick court orders the board to certify the count as counted.');
        } else {
          certifiedWinner = f;
          outcome = 'installed';
          log('certification', `The court declines to intervene. ${cand(f)} is sworn in.`, 'outcome');
        }
      } else {
        caught('refusal', 'certification', 'staff-refusal', 'A plan to refuse certification dies in the board room: there is no majority for it.');
      }
    }
  }

  // --- Aftermath: leaks, roll checks, forensics, court ------------------------------------------
  const lr = stream(cfg.seed, 'leaks');
  conspirators.forEach((c) => { c.leaked = lr() < c.leakP; });
  const stillTampered = (layer: AttackId) => tampered.some((t) => t.has(layer)) || (layer === 'refusal' && outcome === 'installed');
  const caughtLayers = new Set(catches.map((c) => c.layer));
  for (const { id } of ATTACKS) {
    const leaker = conspirators.find((c) => c.layer === id && c.leaked);
    if (leaker && !caughtLayers.has(id) && stillTampered(id)) {
      const where = leaker.precinct !== null ? ` in ${statics[leaker.precinct].name}` : leaker.node !== null ? ` at ${nodes[leaker.node].name}` : '';
      const who = leaker.recruited ? `${aFaction(leaker.faction ?? 0)} ${leaker.role}` : `${/^[aeiou]/i.test(leaker.role) ? 'An' : 'A'} ${leaker.role}`;
      caught(id, 'aftermath', 'leak', `${who.charAt(0).toUpperCase()}${who.slice(1)}${where} talks to GNN.`, leaker.precinct, leaker.node);
    }
  }
  const rr = stream(cfg.seed, 'rollcheck');
  for (let i = 0; i < n; i++) {
    if (!impersonated[i] || caughtLayers.has('impersonation') || catches.some((c) => c.layer === 'impersonation')) continue;
    const q = 0.004 + (statics[i].reconciles ? 0.008 : 0);
    if (rr() < 1 - (1 - q) ** impersonated[i]) {
      caught('impersonation', 'aftermath', 'roll-check', `${statics[i].name}: voters who stayed home are told they voted. ${impersonated[i]} sign-ins were in other people's names.`, i, statics[i].node);
    }
  }

  const table = tableFrom(world, cfg, reported, counts);
  const forensics = opts.forensics === false
    ? { detectors: [], fails: 0, warns: 0, scatter: [], lastDigits: [], secondDigits: [] }
    : runForensics(table, world.neighbors);
  if (forensics.fails) log('aftermath', `Statisticians flag the returns: ${forensics.detectors.filter((d) => d.status === 'fail').map((d) => d.name.toLowerCase()).join(', ')}.`, 'flag');

  let certifiedTotals = afterAudit.totals.slice();
  const strong = catches.some((c) => c.phase === 'aftermath');
  const weak = forensics.fails >= 2;
  const fraudStands = tampered.some((t) => t.size > 0);
  if ((strong || weak) && outcome !== 'installed') {
    const cr = stream(cfg.seed, 'court');
    if (cr() < S('courts')) {
      const finds = fraudStands && (strong || cr() < 0.5);
      if (finds) {
        const shift = sum(afterAudit.totals.map((v, j) => Math.abs(v - (honestTally(honest, C).totals[j])))) / 2;
        const sorted = afterAudit.totals.slice().sort((a, b) => b - a);
        const material = afterAudit.winner !== honestTally(honest, C).winner || shift >= sorted[0] - (sorted[1] ?? 0);
        const layer = ATTACKS.find(({ id }) => stillTampered(id))?.id ?? 'stuffing';
        if (material) {
          outcome = 'rerun';
          caught(layer, 'aftermath', 'court', 'The court finds fraud large enough to change the result and orders a new election, which is held cleanly.');
        } else {
          caught(layer, 'aftermath', 'court', 'The court convicts the conspirators. The fraud was smaller than the margin, so the result stands.');
        }
      } else if (!fraudStands) {
        log('aftermath', 'Investigators chase the statistical flags and find nothing. The result stands.', 'outcome');
      } else {
        log('aftermath', 'Investigators find nothing they can prove.', 'outcome');
      }
    } else {
      log('aftermath', 'Complaints are filed. The court does not take them up.');
    }
  }

  const honestT = honestTally(honest, C);
  if (outcome === 'rerun') { certifiedTotals = honestT.totals.slice(); certifiedWinner = honestT.winner; }
  const certified: Tally = { totals: certifiedTotals, winner: certifiedWinner, ballots: sum(certifiedTotals) };

  const flagsByUnit = statics.map(() => [] as string[]);
  forensics.detectors.forEach((d) => { if (d.status === 'fail' || d.status === 'warn') d.units.forEach((u) => flagsByUnit[u]?.push(d.id)); });

  const precincts: PrecinctResult[] = statics.map((p) => ({
    static: p,
    honest: honest[p.i],
    paper: paper[p.i],
    reported: reported[p.i],
    tampered: [...tampered[p.i]],
    stopped: [...stopped[p.i]],
    flags: flagsByUnit[p.i],
    published: counts[p.i],
  }));

  const result: ElectionResult = {
    config: cfg, cols: world.cols, rows: world.rows, precincts, nodes, honest: honestT, canvassed, certified,
    conspirators, catches, events, audit, forensics, insular,
    headline: { attempted: false, flipped: false, caught: false, caughtAt: null, outcome, conspirators: 0, text: '' },
  };
  result.headline = headlineFor(result, refusalAttempted);
  log(PHASE_ORDER[7], result.headline.text, 'outcome');
  return result;
}

function honestTally(honest: Counts[], C: number): Tally {
  return tallyOf(honest.map((c) => c.inPerson.map((v, j) => v + c.mail[j])), C);
}

/** A return written by hand: round-ish numbers and a healthy share for the right candidate. */
function fabricate(row: number[], f: number, r: Rng): number[] {
  const B = sum(row);
  const human = (x: number) => { const q = r(); return q < 0.45 ? Math.round(x / 10) * 10 : q < 0.75 ? Math.round(x / 5) * 5 : Math.round(x); };
  const total = Math.max(10, human(B * (1 + 0.04 * r())));
  const share = Math.min(0.93, row[f] / Math.max(1, B) + 0.1 + 0.08 * r());
  const out = new Array(row.length).fill(0);
  out[f] = Math.min(total, human(total * share));
  const rest = total - out[f];
  const opp = row.map((_, j) => j).filter((j) => j !== f);
  const oppSum = sum(opp.map((j) => row[j])) || 1;
  let left = rest;
  opp.forEach((j, k) => {
    if (k === opp.length - 1) { out[j] = Math.max(0, left); return; }
    out[j] = Math.max(0, Math.min(left, human((rest * row[j]) / oppSum)));
    left -= out[j];
  });
  return out;
}
