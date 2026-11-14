import { useMemo, useRef, useState } from 'react';
import { ATTACKS, type ElectionResult, type PrecinctResult } from '../../engine';
import { candColor, int, pct, Swatch } from './ui';

export type MapMode = 'reported' | 'honest' | 'truth' | 'oversight' | 'turnout' | 'flags';

export const MAP_MODES: Array<{ id: MapMode; label: string }> = [
  { id: 'reported', label: 'Reported' },
  { id: 'honest', label: 'Honest' },
  { id: 'truth', label: 'Tampering' },
  { id: 'oversight', label: 'Oversight' },
  { id: 'turnout', label: 'Turnout' },
  { id: 'flags', label: 'Flags' },
];

const CELL = 40;
const PAD = 44;
const LETTER: Record<string, string> = { stuffing: 'S', impersonation: 'I', harvesting: 'M', tabulator: 'T', canvass: 'C', refusal: 'R' };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function leaderOf(row: number[]) {
  const b = sum(row);
  const order = row.map((_, j) => j).sort((a, c) => row[c] - row[a]);
  return { j: order[0], margin: b ? (row[order[0]] - row[order[1] ?? order[0]]) / b : 0, ballots: b };
}

const seq = (x: number) => `var(--seq-${Math.max(0, Math.min(4, Math.floor(x * 5)))})`;

export function IsleMap(props: { result: ElectionResult; mode: MapMode; counted: boolean; title?: string }) {
  const { result: r, mode, counted } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ p: PrecinctResult; x: number; y: number } | null>(null);
  const W = r.cols * CELL + PAD * 2;
  const H = r.rows * CELL + PAD * 2;
  const key = (c: number, rw: number) => `${c},${rw}`;
  const at = useMemo(() => new Map(r.precincts.map((p) => [key(p.static.col, p.static.row), p])), [r]);

  const edges = useMemo(() => {
    const coast: string[] = [];
    const borders: string[] = [];
    for (const p of r.precincts) {
      const { col, row, node } = p.static;
      const x = PAD + col * CELL, y = PAD + row * CELL;
      const sides: Array<[number, number, string]> = [
        [0, -1, `M${x},${y}h${CELL}`],
        [0, 1, `M${x},${y + CELL}h${CELL}`],
        [-1, 0, `M${x},${y}v${CELL}`],
        [1, 0, `M${x + CELL},${y}v${CELL}`],
      ];
      for (const [dc, dr, d] of sides) {
        const q = at.get(key(col + dc, row + dr));
        if (!q) coast.push(d);
        else if (q.static.node !== node && (dc > 0 || dr > 0)) borders.push(d);
      }
    }
    return { coast: coast.join(''), borders: borders.join('') };
  }, [r, at]);

  const fillFor = (p: PrecinctResult): { fill: string; opacity: number; label?: string; outline?: string } => {
    const s = p.static;
    if (mode === 'oversight') {
      return { fill: seq((s.oversight - 0.5) / 4), opacity: 1, label: String(s.oversight), outline: s.oversight <= 1 ? 'var(--warn)' : undefined };
    }
    if (!counted && mode !== 'truth') return { fill: 'var(--surface-3)', opacity: 1 };
    if (mode === 'reported' || mode === 'honest') {
      const row = mode === 'honest' ? p.honest.inPerson.map((v, j) => v + p.honest.mail[j]) : p.reported;
      const L = leaderOf(row);
      return { fill: candColor(L.j), opacity: 0.35 + 0.65 * Math.min(1, L.margin / 0.3) };
    }
    if (mode === 'turnout') {
      const t = sum(p.reported) / Math.max(1, s.registered);
      return { fill: seq((t - 0.3) / 0.7), opacity: 1, label: String(Math.round(t * 100)) };
    }
    if (mode === 'flags') {
      return p.flags.length
        ? { fill: 'var(--surface-3)', opacity: 1, label: String(p.flags.length), outline: 'var(--bad)' }
        : { fill: 'var(--surface-2)', opacity: 1 };
    }
    // truth
    const t = p.tampered.map((l) => LETTER[l]).join('');
    const st = p.stopped.length ? '·' : '';
    return { fill: t ? 'var(--surface-3)' : 'var(--surface-2)', opacity: 1, label: t || st || undefined, outline: t ? 'var(--bad)' : p.stopped.length ? 'var(--good)' : undefined };
  };

  const onMove = (e: React.MouseEvent, p: PrecinctResult) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const x = e.clientX - box.left, y = e.clientY - box.top;
    setHover({ p, x: Math.min(x + 14, box.width - 290), y: y + 14 });
  };

  const names = r.config.candidates.map((c) => c.name);
  const showNodeLabels = r.nodes.length <= 12;

  return (
    <div className="map-wrap" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of Mudwick Isle: ${r.precincts.length} polling places in ${r.nodes.length} counting houses, shown by ${mode}. The returns table below lists every polling place.`}>
        <defs>
          <pattern id="waves" width="36" height="18" patternUnits="userSpaceOnUse">
            <path d="M0 12 q9 -6 18 0 t18 0" fill="none" stroke="var(--sea-line)" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="var(--sea)" />
        <rect width={W} height={H} fill="url(#waves)" />
        <text x={PAD - 24} y={28} fill="var(--text-2)" style={{ font: '800 18px var(--font-display)', letterSpacing: '0.18em' }}>MUDWICK ISLE</text>
        <text x={W - PAD + 24} y={H - 14} textAnchor="end" fill="var(--muted)" style={{ font: '500 11px var(--font-mono)' }}>
          {props.title ?? `${r.precincts.length} polling places · ${r.nodes.length} counting houses`}
        </text>
        <g transform={`translate(${W - 34},34)`} aria-hidden="true">
          <circle r="14" fill="none" stroke="var(--muted)" strokeWidth="1" />
          <path d="M0 -11 L4 0 L0 11 L-4 0 Z" fill="var(--muted)" />
          <text y="-17" textAnchor="middle" fill="var(--muted)" style={{ font: '700 9px var(--font-mono)' }}>N</text>
        </g>
        {r.precincts.map((p) => {
          const f = fillFor(p);
          const x = PAD + p.static.col * CELL, y = PAD + p.static.row * CELL;
          return (
            <g key={p.static.i} onMouseMove={(e) => onMove(e, p)} onMouseEnter={(e) => onMove(e, p)}>
              <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={5} fill="var(--surface)" />
              <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={5} fill={f.fill} fillOpacity={f.opacity} stroke={f.outline ?? 'none'} strokeWidth={f.outline ? 2 : 0} strokeDasharray={mode === 'oversight' && f.outline ? '4 3' : undefined} />
              {f.label && (
                <text x={x + CELL / 2} y={y + CELL / 2 + 4} textAnchor="middle" fill="var(--text)" style={{ font: '700 12px var(--font-mono)' }} pointerEvents="none">{f.label}</text>
              )}
            </g>
          );
        })}
        <path d={edges.borders} stroke="var(--text)" strokeOpacity="0.55" strokeWidth="2.5" fill="none" strokeLinecap="round" pointerEvents="none" />
        <path d={edges.coast} stroke="var(--land-edge)" strokeWidth="3" fill="none" strokeLinecap="round" pointerEvents="none" />
        {showNodeLabels && r.nodes.map((nd) => (
          <g key={nd.i} transform={`translate(${PAD + (nd.cx + 0.5) * CELL},${PAD + (nd.cy + 0.5) * CELL - 13})`} pointerEvents="none">
            <rect x={-nd.name.length * 3.4 - 6} y={-9} width={nd.name.length * 6.8 + 12} height={15} rx={7} fill="var(--bg)" fillOpacity="0.78" />
            <text textAnchor="middle" y={2} fill="var(--text-2)" style={{ font: '600 10px var(--font-mono)' }}>{nd.name}</text>
          </g>
        ))}
      </svg>
      {hover && <PrecinctTip p={hover.p} x={hover.x} y={hover.y} result={r} names={names} counted={counted} />}
      <MapLegend result={r} mode={mode} counted={counted} />
    </div>
  );
}

function PrecinctTip({ p, x, y, result, names, counted }: { p: PrecinctResult; x: number; y: number; result: ElectionResult; names: string[]; counted: boolean }) {
  const s = p.static;
  const ballots = sum(p.reported);
  const honest = p.honest.inPerson.map((v, j) => v + p.honest.mail[j]);
  const factions = [...new Set(s.staff)].map((j) => result.config.candidates[j].faction).join(', ');
  return (
    <div className="tooltip" style={{ left: x, top: y }} role="status">
      <h4>{s.name}</h4>
      <div className="muted tiny">{result.nodes[s.node].name} counting house</div>
      <table>
        <tbody>
          <tr><td>Registered</td><td>{int(s.registered)}</td></tr>
          <tr><td>Oversight</td><td>{s.oversight} {s.oversight <= 1 ? '(insular)' : ''}</td></tr>
          <tr><td colSpan={2} className="tiny muted">Staff: {factions}{s.observer ? ' · observer' : ''}{s.paper ? ' · paper' : ' · no paper'}{s.reconciles ? ' · reconciles' : ''}</td></tr>
          {counted && <>
            <tr><td>Ballots</td><td>{int(ballots)}</td></tr>
            <tr><td>Voters</td><td>{int(p.published.signins + p.published.mailReturned)}</td></tr>
            <tr><td>Turnout</td><td>{pct(ballots / Math.max(1, s.registered), 0)}</td></tr>
            {names.map((n, j) => (
              <tr key={j}><td><Swatch j={j} /> {n}</td><td>{int(p.reported[j])}{p.reported[j] !== honest[j] ? ` (honest ${int(honest[j])})` : ''}</td></tr>
            ))}
          </>}
        </tbody>
      </table>
      {p.tampered.length > 0 && <div className="tiny" style={{ color: 'var(--bad)', marginTop: 4 }}>Tampered: {p.tampered.map((l) => ATTACKS.find((a) => a.id === l)?.short).join(', ')}</div>}
      {p.stopped.length > 0 && <div className="tiny" style={{ color: 'var(--good)' }}>Stopped: {p.stopped.map((l) => ATTACKS.find((a) => a.id === l)?.short).join(', ')}</div>}
      {p.flags.length > 0 && <div className="tiny" style={{ color: 'var(--warn)' }}>Flagged by: {p.flags.join(', ')}</div>}
    </div>
  );
}

function MapLegend({ result, mode, counted }: { result: ElectionResult; mode: MapMode; counted: boolean }) {
  if (mode === 'oversight') {
    return (
      <div className="legend">
        <span>Independent parties present:</span>
        {[1, 2, 3, 4].map((k) => <span key={k} className="legend-item"><Swatch color={seq((k - 0.5) / 4)} />{k}{k === 1 ? ' (insular, dashed)' : ''}</span>)}
        <span>· {result.insular} insular</span>
      </div>
    );
  }
  if (!counted && mode !== 'truth') return <div className="legend">Press Start to run the election.</div>;
  if (mode === 'reported' || mode === 'honest') {
    return (
      <div className="legend">
        {result.config.candidates.map((c, j) => <span key={j} className="legend-item"><Swatch j={j} />{c.name}</span>)}
        <span>· darker = wider local margin · thick lines = counting-house borders</span>
      </div>
    );
  }
  if (mode === 'turnout') return <div className="legend"><span>Turnout, % of registered:</span>{['30', '44', '58', '72', '86+'].map((t, k) => <span key={t} className="legend-item"><Swatch color={`var(--seq-${k})`} />{t}</span>)}</div>;
  if (mode === 'flags') return <div className="legend"><span>Red outline: flagged by a forensic test (number = tests). Only what was published is tested.</span></div>;
  return (
    <div className="legend">
      <span>What only the simulator sees:</span>
      {Object.entries(LETTER).filter(([k]) => k !== 'refusal').map(([k, v]) => <span key={k} className="legend-item mono">{v} = {ATTACKS.find((a) => a.id === k)?.short}</span>)}
      <span>· green outline · = stopped</span>
    </div>
  );
}
