import { bravoAsn, type ElectionResult } from '../../engine';
import { int, pct } from './ui';

/** How many ballots a ballot-polling risk-limiting audit needs, by margin. Sampling scales. */
export function AuditPanel({ result }: { result: ElectionResult }) {
  const a = result.audit;
  const alpha = result.config.riskLimit / 100;
  const ballots = result.canvassed.ballots;
  const margins = [0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3];
  const asn = (m: number) => bravoAsn(0.5 + m / 2, 0.5 - m / 2, alpha);
  const W = 360, H = 190, L = 48, B = 28, T = 10, R = 10;
  const lx = (m: number) => L + (Math.log(m / 0.005) / Math.log(0.3 / 0.005)) * (W - L - R);
  const ly = (n: number) => H - B - (Math.log10(Math.max(10, Math.min(1e6, n))) - 1) / 5 * (H - B - T);
  const path = margins.map((m, i) => `${i ? 'L' : 'M'}${lx(m).toFixed(1)},${ly(asn(m)).toFixed(1)}`).join('');
  const cur = Math.max(0.005, Math.min(0.3, a.margin));
  const modeText = a.mode === 'rla' ? 'risk-limiting (sample until confident)' : a.mode === 'fixed' ? `fixed sample of ${(result.config.safeguards.auditRate / 10).toFixed(1)}% of ballots` : 'no audit';
  return (
    <section className="card">
      <div className="card-head"><h2>Audit math</h2><span className="tiny muted">BRAVO ballot polling, risk limit {result.config.riskLimit}%</span></div>
      <p className="small" style={{ marginTop: 0 }}>
        Margin {pct(a.margin, 2)}. A risk-limiting audit expects to hand-check about <strong className="mono">{Number.isFinite(a.asn) ? int(a.asn) : 'every'}</strong> ballots
        {Number.isFinite(a.asn) && ballots ? ` (${pct(Math.min(1, a.asn / ballots))} of ${int(ballots)})` : ''} to confirm it. Halve the margin and it needs about four times as many.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Ballots a risk-limiting audit needs against the margin, on log scales">
        {[10, 100, 1000, 10000, 100000, 1000000].map((n) => (
          <g key={n}>
            <line x1={L} x2={W - R} y1={ly(n)} y2={ly(n)} stroke="var(--border)" />
            <text x={L - 6} y={ly(n) + 3} textAnchor="end" fill="var(--muted)" style={{ font: '10px var(--font-mono)' }}>{n >= 1000 ? `${n / 1000}k` : n}</text>
          </g>
        ))}
        {[0.005, 0.01, 0.02, 0.05, 0.1, 0.3].map((m) => (
          <text key={m} x={lx(m)} y={H - B + 14} textAnchor="middle" fill="var(--muted)" style={{ font: '10px var(--font-mono)' }}>{m * 100}%</text>
        ))}
        {ballots > 0 && <line x1={L} x2={W - R} y1={ly(ballots)} y2={ly(ballots)} stroke="var(--warn)" strokeDasharray="4 3" />}
        {ballots > 0 && <text x={W - R} y={ly(ballots) - 4} textAnchor="end" fill="var(--warn)" style={{ font: '10px var(--font-sans)' }}>every ballot on the isle</text>}
        <path d={path} fill="none" stroke="var(--c0)" strokeWidth="2" />
        {Number.isFinite(a.asn) && <circle cx={lx(cur)} cy={ly(a.asn)} r="5" fill="var(--c0)" stroke="var(--surface)" strokeWidth="2" />}
        <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" fill="var(--text-2)" style={{ font: '11px var(--font-sans)' }}>Margin between the top two</text>
      </svg>
      <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
        <li>This election: {modeText}{a.recountTriggered ? '; the margin triggered a full recount' : ''}.</li>
        {a.ran && <li>{int(a.drawn)} ballots drawn; {a.confirmed ? 'the winner was confirmed.' : 'not enough to confirm, so everything was hand counted.'}</li>}
        <li>{pct(a.paperShare, 0)} of ballots have paper behind them. {a.note}</li>
      </ul>
    </section>
  );
}
