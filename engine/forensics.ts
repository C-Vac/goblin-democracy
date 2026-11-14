/**
 * Published election-forensics tests, run on any table of units and counts. Nothing here knows
 * about Mudwick: the simulator and the CSV upload both build a Table and call runForensics.
 *
 * Every test flags anomalies, not fraud. Honest data trips them sometimes (see the "clean
 * election that looks guilty" preset), and careful fraud can pass all of them.
 */

import { benfordSecond, chiSquareP, mad, median, normalCdf, poissonUpper, studentTUpper, weightedPearson } from './stats';
import type { DetectorResult, DetectorStatus, ForensicReport } from './types';

export interface Unit {
  id: string;
  name?: string;
  x?: number;
  y?: number;
  node?: string;
  eligible?: number;
  registered?: number;
  /** People recorded as voting: poll-book sign-ins plus returned mail envelopes. */
  voters?: number;
  mailSent?: number;
  mailReturned?: number;
  /** Counts per option (all channels). */
  counts: number[];
  /** Mail-channel counts per option, when the data splits them out. */
  mail?: number[];
}

export interface Table {
  options: string[];
  units: Unit[];
}

const FAIL_P = 0.001;
const WARN_P = 0.01;

/**
 * Outlier thresholds, calibrated on the simulator: with the honest default election each of these
 * tests fails in about 1 run in 100. Real data has its own tails, so treat them as a starting point.
 */
export const TUNING = {
  /** Robust z beyond which a unit is an outlier against its neighbours. */
  neighbourZ: 5.5,
  /** Robust z beyond which a unit's mail vote or unreturned rate is an outlier. */
  mailZ: 4,
  /** Fewest outliers before the neighbour and mail tests can warn. */
  minOutliers: 2,
  /** Neighbour pairs share units, so they are not independent: inflate the border test's error. */
  borderDesignEffect: 3,
};

const tail2 = (z: number) => 2 * (1 - normalCdf(z));
const tail1 = (z: number) => 1 - normalCdf(z);

function byP(p: number): DetectorStatus {
  return p < FAIL_P ? 'fail' : p < WARN_P ? 'warn' : 'pass';
}

function fmtP(p: number): string {
  if (p < 0.0001) return 'p < 0.0001';
  return `p = ${p < 0.01 ? p.toFixed(4) : p.toFixed(3)}`;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function na(id: string, name: string, needs: string): DetectorResult {
  return { id, name, status: 'na', stat: 'Not enough data', p: null, detail: '', units: [], needs };
}

function leaderIndex(t: Table): number {
  const totals = t.options.map((_, j) => sum(t.units.map((u) => u.counts[j] ?? 0)));
  return totals.indexOf(Math.max(...totals));
}

/** Ballots against voters, voters against the roll, the roll against the population. */
function reconciliation(t: Table): DetectorResult {
  const name = 'Ballots against voters';
  const has = t.units.filter((u) => u.voters !== undefined);
  if (has.length === 0) return na('reconciliation', name, 'a voters column (sign-ins)');
  const bad: number[] = [];
  let over = 0, inflated = 0;
  t.units.forEach((u, i) => {
    const ballots = sum(u.counts);
    if (u.voters !== undefined && Math.abs(ballots - u.voters) > Math.max(2, 0.005 * u.voters)) bad.push(i);
    if (u.registered !== undefined && u.voters !== undefined && u.voters > u.registered) { over++; if (!bad.includes(i)) bad.push(i); }
    if (u.registered !== undefined && u.eligible !== undefined && u.registered > 1.06 * u.eligible) { inflated++; if (!bad.includes(i)) bad.push(i); }
  });
  const status: DetectorStatus = bad.length >= Math.max(2, 0.02 * t.units.length) || over > 0 ? 'fail' : bad.length ? 'warn' : 'pass';
  return {
    id: 'reconciliation', name, status, p: null, units: bad,
    stat: `${bad.length} of ${t.units.length} units off${over ? `, ${over} over 100% turnout` : ''}${inflated ? `, ${inflated} with more registrations than residents` : ''}`,
    detail: 'Every ballot should match a person who signed in or mailed an envelope. Extra ballots with no voter behind them are the classic sign of stuffing, and a return written at the canvass rarely matches the poll book.',
  };
}

/** Klimek et al. 2012: honest elections make a round blob; stuffing smears it toward the corner. */
function fingerprint(t: Table, report: ForensicReport): DetectorResult {
  const name = 'Turnout against vote share';
  const lead = leaderIndex(t);
  const pts = t.units
    .map((u, i) => ({ u, i, ballots: sum(u.counts) }))
    .filter(({ u, ballots }) => u.registered && ballots > 0);
  if (pts.length < 10) return na('fingerprint', name, 'a registered column and at least 10 units');
  report.scatter = pts.map(({ u, i, ballots }) => ({ x: ballots / (u.registered as number), y: u.counts[lead] / ballots, w: ballots, unit: i }));
  const r = weightedPearson(report.scatter.map((p) => p.x), report.scatter.map((p) => p.y), report.scatter.map((p) => p.w));
  const total = sum(report.scatter.map((p) => p.w));
  const cornerPts = report.scatter.filter((p) => p.x > 0.85 && p.y > 0.8);
  const corner = sum(cornerPts.map((p) => p.w)) / total;
  const status: DetectorStatus = corner > 0.03 || r > 0.6 ? 'fail' : corner > 0.005 || r > 0.35 ? 'warn' : 'pass';
  return {
    id: 'fingerprint', name, status, p: null, units: cornerPts.map((p) => p.unit),
    stat: `r = ${r.toFixed(2)}, ${(corner * 100).toFixed(1)}% of ballots from units over 85% turnout and 80% for ${t.options[lead]}`,
    detail: 'Where ballots are added, turnout and the winner\'s share rise together. A strong positive correlation or a cluster near full turnout and a full vote is the "election fingerprint". Honest places where one group votes heavily and as a bloc can look the same, which is why this test warns before it fails.',
  };
}

function digitTest(t: Table, which: 'last' | 'second', report: ForensicReport): DetectorResult {
  const id = which === 'last' ? 'last-digit' : 'second-digit';
  const name = which === 'last' ? 'Last digits' : 'Second digits (Benford)';
  const min = which === 'last' ? 100 : 10;
  const counts = new Array(10).fill(0);
  t.units.forEach((u) => u.counts.forEach((c) => {
    if (c < min) return;
    const s = String(Math.round(c));
    counts[Number(which === 'last' ? s[s.length - 1] : s[1])]++;
  }));
  if (which === 'last') report.lastDigits = counts; else report.secondDigits = counts;
  const n = sum(counts);
  if (n < 50) return na(id, name, `at least 50 counts of ${min} or more`);
  const expected = counts.map((_, d) => (which === 'last' ? n / 10 : n * benfordSecond(d)));
  const chi = sum(counts.map((o, d) => (o - expected[d]) ** 2 / expected[d]));
  const p = chiSquareP(chi, 9);
  return {
    id, name, status: byP(p), p, units: [],
    stat: `chi² = ${chi.toFixed(1)}, df = 9, ${fmtP(p)}, n = ${n}`,
    detail: which === 'last'
      ? 'In counts of 100 or more the last digit is noise, so every digit should turn up about a tenth of the time. People who invent numbers favour some digits (often 0 and 5) and avoid repeats.'
      : 'Second digits of honest counts roughly follow Benford\'s law. The test is contested: honest elections can fail it and fabricated ones can pass. Read it alongside the others, never alone.',
  };
}

/** Kobak, Shpilkin and Pshenichnikov 2016: invented returns land on whole percentages. */
function integerPercent(t: Table): DetectorResult {
  const name = 'Whole-number percentages';
  const lead = leaderIndex(t);
  let observed = 0, expected = 0, checks = 0;
  const hits: number[] = [];
  const check = (k: number, N: number, i: number) => {
    if (N < 100 || k <= 0 || k >= N) return;
    checks++;
    let window = 0;
    for (let d = -10; d <= 10; d++) if (((k + d) * 100) % N === 0) window++;
    expected += window / 21;
    if ((k * 100) % N === 0) { observed++; if (!hits.includes(i)) hits.push(i); }
  };
  t.units.forEach((u, i) => {
    const ballots = sum(u.counts);
    if (u.registered) check(ballots, u.registered, i);
    check(u.counts[lead], ballots, i);
  });
  if (checks < 20) return na('integer-pct', name, 'registered and count columns for at least 10 units');
  const p = poissonUpper(observed, expected);
  return {
    id: 'integer-pct', name, status: observed >= 3 ? byP(p) : 'pass', p, units: hits,
    stat: `${observed} whole percentages where ${expected.toFixed(1)} are expected, ${fmtP(p)}`,
    detail: 'Someone writing a return by hand tends to aim for a round turnout or share, like exactly 75%. Real counts hit a whole percentage only by accident; the expected number comes from the counts on either side.',
  };
}

function knn(t: Table, k: number): number[][] {
  const pts = t.units.map((u) => [u.x as number, u.y as number]);
  return pts.map(([x, y], i) =>
    pts
      .map(([x2, y2], j) => ({ j, d: (x - x2) ** 2 + (y - y2) ** 2 }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map(({ j }) => j),
  );
}

/** Each unit against the median of its neighbours: robust z of the difference. */
function neighbours(t: Table, nb: number[][] | null): DetectorResult {
  const name = 'Outliers against neighbours';
  const hasXY = t.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y));
  if (!hasXY || t.units.length < 10) return na('neighbours', name, 'x and y columns (map position)');
  const near = nb ?? knn(t, 6);
  const lead = leaderIndex(t);
  const turnout = t.units.map((u) => (u.registered ? sum(u.counts) / u.registered : NaN));
  const share = t.units.map((u) => { const b = sum(u.counts); return b ? u.counts[lead] / b : NaN; });
  const sizeT = t.units.map((u) => u.registered ?? 0);
  const sizeS = t.units.map((u) => sum(u.counts));
  let flagged: number[] = [];
  let checks = 0;
  // Random-effects standardisation: each difference is scaled by its own sampling error plus the
  // honest spread between neighbours, so a small unit is not an outlier just for being small.
  for (const [series, size] of [[turnout, sizeT], [share, sizeS]] as const) {
    const diffs = series.map((v, i) => {
      const ns = near[i].map((j) => series[j]).filter(Number.isFinite);
      return ns.length >= 5 && Number.isFinite(v) ? v - median(ns) : NaN;
    });
    const sampVar = series.map((v, i) => (Number.isFinite(v) && size[i] > 0 ? (v * (1 - v)) / size[i] * 1.3 : NaN));
    const ok = diffs.filter(Number.isFinite);
    if (ok.length < 10) continue;
    const m = median(ok);
    const tau2 = Math.max(0, mad(ok) ** 2 - median(sampVar.filter(Number.isFinite)));
    diffs.forEach((d, i) => {
      if (!Number.isFinite(d) || !Number.isFinite(sampVar[i])) return;
      checks++;
      if (Math.abs(d - m) / Math.sqrt(tau2 + sampVar[i] || 1e-9) > TUNING.neighbourZ) flagged.push(i);
    });
  }
  flagged = [...new Set(flagged)];
  if (checks === 0) return na('neighbours', name, 'units with at least three neighbours');
  const expected = checks * tail2(TUNING.neighbourZ);
  const p = poissonUpper(flagged.length, expected);
  return {
    id: 'neighbours', name, status: flagged.length >= TUNING.minOutliers ? byP(p) : 'pass', p, units: flagged,
    stat: `${flagged.length} units more than ${TUNING.neighbourZ} robust SDs from their neighbours (${expected.toFixed(2)} expected), ${fmtP(p)}`,
    detail: 'Neighbouring places usually vote alike. A unit whose turnout or winner\'s share jumps away from every neighbour is worth a look; so is a sharp edge between two neighbourhoods that live differently.',
  };
}

/** NC-09 2018 signatures: lopsided mail ballots and too many ballots that never came back. */
function mail(t: Table): DetectorResult {
  const name = 'Mail-ballot anomalies';
  const hasMail = t.units.some((u) => u.mail);
  const hasReturn = t.units.some((u) => u.mailSent !== undefined && u.mailReturned !== undefined);
  if (!hasMail && !hasReturn) return na('mail', name, 'mail columns (mail:<option>, or mail_sent and mail_returned)');
  const flagged = new Set<number>();
  let checks = 0;
  // Each unit's statistic is standardised by its own sampling error first, so small units do not
  // look extreme by chance; the robust z across units then absorbs honest overdispersion.
  const robustFlag = (zs: number[]) => {
    const ok = zs.filter(Number.isFinite);
    if (ok.length < 10) return;
    const m = median(ok), s = mad(ok) || 1e-9;
    zs.forEach((v, i) => { if (Number.isFinite(v)) { checks++; if ((v - m) / s > TUNING.mailZ) flagged.add(i); } });
  };
  if (hasMail) {
    let best: number[] = [];
    let bestMax = -Infinity;
    t.options.forEach((_, j) => {
      const zs = t.units.map((u) => {
        if (!u.mail) return NaN;
        const mb = sum(u.mail), ib = sum(u.counts) - mb;
        if (mb < 30 || ib < 30) return NaN;
        const pm = u.mail[j] / mb, pi = (u.counts[j] - u.mail[j]) / ib;
        const pp = u.counts[j] / (mb + ib);
        const se = Math.sqrt(Math.max(1e-6, pp * (1 - pp)) * (1 / mb + 1 / ib));
        return (pm - pi) / se;
      });
      const ok = zs.filter(Number.isFinite);
      if (ok.length < 10) return;
      const m = median(ok), sd = mad(ok) || 1e-9;
      const top = Math.max(...ok.map((v) => (v - m) / sd));
      if (top > bestMax) { bestMax = top; best = zs; }
    });
    robustFlag(best);
  }
  if (hasReturn) {
    robustFlag(t.units.map((u) => {
      if (!u.mailSent || u.mailSent < 50 || u.mailReturned === undefined) return NaN;
      const r = 1 - u.mailReturned / u.mailSent;
      return r / Math.sqrt(Math.max(1e-6, r * (1 - r)) / u.mailSent + 0.0025);
    }));
  }
  if (checks === 0) return na('mail', name, 'at least 10 units with 30 or more mail ballots');
  const expected = checks * tail1(TUNING.mailZ);
  const p = poissonUpper(flagged.size, expected);
  return {
    id: 'mail', name, status: flagged.size >= TUNING.minOutliers ? byP(p) : 'pass', p, units: [...flagged],
    stat: `${flagged.size} units with a mail vote far off their in-person vote or a high unreturned rate (${expected.toFixed(2)} expected), ${fmtP(p)}`,
    detail: 'In the 2018 North Carolina case, one candidate\'s share of mail ballots in two counties was far above anything the voters\' registrations suggested, and an unusual share of requested ballots never came back. Both are visible in public returns.',
  };
}

/**
 * A tampered reporting chain shifts every unit it counts, so the leader's share jumps at its
 * border. Compares the size of jumps across each chain's border with jumps between neighbours
 * inside it: a smooth trend in how people vote makes both alike, a step makes the border bigger.
 */
function boundaries(t: Table, nb: number[][] | null): DetectorResult {
  const name = 'Jumps between counting houses';
  const hasNode = t.units.every((u) => u.node !== undefined && u.node !== '');
  const hasXY = t.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y));
  if (!hasNode || !hasXY) return na('boundaries', name, 'node (reporting chain) and x, y columns');
  const near = nb ?? knn(t, 6);
  const lead = leaderIndex(t);
  const share = t.units.map((u) => { const b = sum(u.counts); return b ? u.counts[lead] / b : NaN; });
  const border = new Map<string, number[]>();
  const inner = new Map<string, number[]>();
  t.units.forEach((u, i) => near[i].forEach((j) => {
    if (!Number.isFinite(share[i]) || !Number.isFinite(share[j])) return;
    const key = u.node as string;
    const target = t.units[j].node === key ? inner : border;
    if (target === inner && j < i) return;
    const arr = target.get(key) ?? [];
    arr.push(target === border ? share[i] - share[j] : Math.abs(share[i] - share[j]));
    target.set(key, arr);
  }));
  const stats = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { m, v: xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1), n: xs.length };
  };
  let worst = { node: '', p: 1, signed: 0, m: 0 };
  let tested = 0;
  border.forEach((d, node) => {
    const ins = inner.get(node) ?? [];
    if (d.length < 4 || ins.length < 4) return;
    tested++;
    const b = stats(d.map(Math.abs)), w = stats(ins);
    const se = Math.sqrt(TUNING.borderDesignEffect * (b.v / b.n + w.v / w.n)) || 1e-9;
    const p = studentTUpper((b.m - w.m) / se, Math.min(b.n, w.n) - 1);
    if (p < worst.p) worst = { node, p, signed: stats(d).m, m: d.length };
  });
  if (!worst.node) return na('boundaries', name, 'reporting chains with at least four border and four inside neighbour pairs');
  const p = Math.min(1, worst.p * tested);
  return {
    id: 'boundaries', name, status: byP(p), p,
    units: p < WARN_P ? t.units.map((u, i) => (u.node === worst.node ? i : -1)).filter((i) => i >= 0) : [],
    stat: `${worst.node}: ${t.options[lead]} jumps ${(Math.abs(worst.signed) * 100).toFixed(1)} points ${worst.signed >= 0 ? 'up' : 'down'} at its border (${worst.m} border pairs), ${fmtP(p)} after Bonferroni`,
    detail: 'Voters do not change their minds at a county line, but a tampered tabulator or canvass stops there. Compares jumps across each reporting chain\'s border with jumps between neighbours inside it.',
  };
}

export function runForensics(t: Table, nb: number[][] | null = null): ForensicReport {
  const report: ForensicReport = { detectors: [], fails: 0, warns: 0, scatter: [], lastDigits: new Array(10).fill(0), secondDigits: new Array(10).fill(0) };
  report.detectors = [
    reconciliation(t),
    fingerprint(t, report),
    digitTest(t, 'last', report),
    integerPercent(t),
    neighbours(t, nb),
    mail(t),
    boundaries(t, nb),
    digitTest(t, 'second', report),
  ];
  report.fails = report.detectors.filter((d) => d.status === 'fail').length;
  report.warns = report.detectors.filter((d) => d.status === 'warn').length;
  return report;
}
