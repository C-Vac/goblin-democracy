import { useState } from 'react';
import type { ForensicReport } from '../../engine';
import { int, pct, Status } from './ui';

export function DetectorList({ report }: { report: ForensicReport }) {
  return (
    <div className="detectors">
      {report.detectors.map((d) => (
        <div key={d.id} className="detector">
          <div className="detector-top">
            <h3>{d.name}</h3>
            <Status s={d.status} />
          </div>
          <div className="stat">{d.status === 'na' ? `Needs ${d.needs}` : d.stat}</div>
          {d.detail && (
            <details>
              <summary>What this tests</summary>
              {d.detail}
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

/** Turnout against the leader's share, one dot per unit, sized by ballots (Klimek et al. 2012). */
export function Scatter({ report, leader }: { report: ForensicReport; leader: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360, H = 260, L = 40, B = 34, T = 10, R = 10;
  const pts = report.scatter;
  const flagged = new Set(report.detectors.find((d) => d.id === 'fingerprint')?.units ?? []);
  if (!pts.length) return <p className="muted small">No turnout data to plot.</p>;
  const maxW = Math.max(...pts.map((p) => p.w));
  const sx = (x: number) => L + Math.min(1, Math.max(0, x)) * (W - L - R);
  const sy = (y: number) => H - B - Math.min(1, Math.max(0, y)) * (H - B - T);
  const h = hover !== null ? pts[hover] : null;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Scatter of turnout against ${leader}'s share in ${pts.length} units`}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={sx(g)} x2={sx(g)} y1={T} y2={H - B} stroke="var(--border)" strokeWidth="1" />
            <line x1={L} x2={W - R} y1={sy(g)} y2={sy(g)} stroke="var(--border)" strokeWidth="1" />
            <text x={sx(g)} y={H - B + 14} textAnchor="middle" fill="var(--muted)" style={{ font: '10px var(--font-mono)' }}>{g * 100}%</text>
            <text x={L - 6} y={sy(g) + 3} textAnchor="end" fill="var(--muted)" style={{ font: '10px var(--font-mono)' }}>{g * 100}%</text>
          </g>
        ))}
        <rect x={sx(0.85)} y={sy(1)} width={sx(1) - sx(0.85)} height={sy(0.8) - sy(1)} fill="var(--bad)" fillOpacity="0.08" stroke="var(--bad)" strokeOpacity="0.4" strokeDasharray="3 3" />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={3 + 5 * Math.sqrt(p.w / maxW)}
            fill="var(--c0)"
            fillOpacity={hover === i ? 0.95 : 0.55}
            stroke={flagged.has(p.unit) ? 'var(--bad)' : 'var(--surface)'}
            strokeWidth={flagged.has(p.unit) ? 2 : 1.5}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fill="var(--text-2)" style={{ font: '11px var(--font-sans)' }}>Turnout</text>
        <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--text-2)" style={{ font: '11px var(--font-sans)' }}>{leader}’s share</text>
      </svg>
      <figcaption className="tiny muted">
        {h ? `Unit ${h.unit + 1}: turnout ${pct(h.x)}, ${leader} ${pct(h.y)}, ${int(h.w)} ballots.` : 'One dot per unit, sized by ballots. The dashed corner is where stuffed boxes pile up.'}
      </figcaption>
    </figure>
  );
}

/** Digit frequencies against what honest counts should give. */
export function DigitBars({ counts, expected, title }: { counts: number[]; expected: number[]; title: string }) {
  const n = counts.reduce((a, b) => a + b, 0);
  const W = 360, H = 150, L = 30, B = 22, T = 8;
  if (!n) return <p className="muted small">No counts large enough.</p>;
  const obs = counts.map((c) => c / n);
  const max = Math.max(0.2, ...obs, ...expected);
  const bw = (W - L - 10) / 10;
  const sy = (v: number) => H - B - (v / max) * (H - B - T);
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`${title}: observed digit shares against expected`}>
        {[0, 0.1, 0.2].filter((g) => g <= max).map((g) => (
          <g key={g}>
            <line x1={L} x2={W - 10} y1={sy(g)} y2={sy(g)} stroke="var(--border)" />
            <text x={L - 4} y={sy(g) + 3} textAnchor="end" fill="var(--muted)" style={{ font: '10px var(--font-mono)' }}>{g * 100}%</text>
          </g>
        ))}
        {obs.map((v, d) => (
          <g key={d}>
            <title>{`Digit ${d}: ${pct(v)} observed, ${pct(expected[d])} expected`}</title>
            <rect x={L + d * bw + 2} y={sy(v)} width={bw - 4} height={H - B - sy(v)} rx="3" fill="var(--c1)" />
            <line x1={L + d * bw} x2={L + (d + 1) * bw} y1={sy(expected[d])} y2={sy(expected[d])} stroke="var(--text)" strokeWidth="2" />
            <text x={L + d * bw + bw / 2} y={H - 6} textAnchor="middle" fill="var(--muted)" style={{ font: '10px var(--font-mono)' }}>{d}</text>
          </g>
        ))}
      </svg>
      <figcaption className="tiny muted">{title}: bars observed ({int(n)} counts), line expected.</figcaption>
    </figure>
  );
}

const BENFORD2 = Array.from({ length: 10 }, (_, d) => {
  let p = 0;
  for (let k = 1; k <= 9; k++) p += Math.log10(1 + 1 / (10 * k + d));
  return p;
});

export function ForensicCharts({ report, leader }: { report: ForensicReport; leader: string }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Scatter report={report} leader={leader} />
      <DigitBars counts={report.lastDigits} expected={new Array(10).fill(0.1)} title="Last digits of counts of 100 or more" />
      <DigitBars counts={report.secondDigits} expected={BENFORD2} title="Second digits against Benford" />
    </div>
  );
}
