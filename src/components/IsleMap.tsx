import { useMemo, useRef, useState } from 'react';
import { ASPECT, ATTACKS, BALLOTS, DISTRICTS, MAP, type ElectionResult, type PrecinctResult } from '../../engine';
import { useMapArt } from '../mapArt';
import { candColor, int, partyVars, pct, Swatch } from './ui';

export type MapMode = 'reported' | 'honest' | 'canvass' | 'truth' | 'oversight' | 'turnout' | 'flags';

export const MAP_MODES: Array<{ id: MapMode; label: string }> = [
  { id: 'reported', label: 'Reported' },
  { id: 'honest', label: 'Honest' },
  { id: 'canvass', label: 'Canvass boards' },
  { id: 'truth', label: 'Tampering' },
  { id: 'oversight', label: 'Oversight' },
  { id: 'turnout', label: 'Turnout' },
  { id: 'flags', label: 'Flags' },
];

const LETTER: Record<string, string> = { gerrymander: 'G', stuffing: 'S', impersonation: 'I', harvesting: 'M', tabulator: 'T', canvass: 'C', refusal: 'R' };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The map is drawn in a 2048-wide frame; positions in the engine are % of the bake. */
const VW = 2048;
const VH = Math.round(VW / ASPECT);
const X = (x: number) => (x / 100) * VW;
const Y = (y: number) => (y / 100) * VH;
const polyPath = (poly: Array<[number, number]>) => `M${poly.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')}Z`;

function leaderOf(row: number[]) {
  const b = sum(row);
  const order = row.map((_, j) => j).sort((a, c) => row[c] - row[a]);
  return { j: order[0], margin: b ? (row[order[0]] - row[order[1] ?? order[0]]) / b : 0, ballots: b };
}

function wrapWords(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > max) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

const seq = (x: number) => `var(--seq-${Math.max(0, Math.min(4, Math.floor(x * 5)))})`;

/** How a counting house's canvass board reads on the map: stripes = one faction, dots = mixed, zigzag = it wrote its own numbers. */
export function boardPattern(board: number[], colluded: boolean | undefined): { id: string; kind: 'stripes' | 'dots' | 'zigzag'; holder: number | null } {
  if (colluded) return { id: 'pat-zigzag', kind: 'zigzag', holder: null };
  if (board.length && board.every((b) => b === board[0])) return { id: `pat-stripes-${board[0]}`, kind: 'stripes', holder: board[0] };
  return { id: 'pat-dots', kind: 'dots', holder: null };
}

function Patterns({ C }: { C: number }) {
  return (
    <>
      {Array.from({ length: C }, (_, j) => (
        <pattern key={j} id={`pat-stripes-${j}`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="none" />
          <line x1="0" y1="0" x2="0" y2="16" stroke={candColor(j)} strokeWidth="5" />
        </pattern>
      ))}
      <pattern id="pat-dots" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="3" fill="#fff6dc" />
      </pattern>
      <pattern id="pat-zigzag" width="20" height="14" patternUnits="userSpaceOnUse">
        <path d="M0 10 L5 3 L10 10 L15 3 L20 10" fill="none" stroke="var(--bad)" strokeWidth="3" strokeLinejoin="round" />
      </pattern>
      <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill="#fff6dc" />
      </marker>
    </>
  );
}

export function IsleMap(props: { result: ElectionResult; mode: MapMode; counted: boolean; title?: string }) {
  const art = useMapArt();
  const { result: r, mode, counted } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ p: PrecinctResult; x: number; y: number } | null>(null);
  const cw = X(r.cw), ch = Y(r.ch);
  const labels = r.cols <= 40;
  const C = r.config.candidates.length;
  const used = useMemo(() => new Set(r.nodes.map((n) => n.district)), [r]);
  const redrawn = r.precincts.some((p) => p.static.node !== p.static.homeNode);
  const showVotes = counted && (mode === 'reported' || mode === 'honest' || mode === 'canvass');

  // Each counting house's winner, by the rows this view shows; painted on its home district.
  const houseLead = useMemo(() => {
    const sums = r.nodes.map(() => new Array(C).fill(0));
    for (const p of r.precincts) {
      const row = mode === 'honest' ? p.honest.inPerson.map((v, j) => v + p.honest.mail[j]) : p.reported;
      const k = mode === 'honest' ? p.static.homeNode : p.static.node;
      row.forEach((v, j) => { sums[k][j] += v; });
    }
    return sums.map((s) => leaderOf(s));
  }, [r, mode, C]);

  // Counting-house borders along cell edges, drawn when the commission moved anything.
  const edges = useMemo(() => {
    if (!redrawn || mode === 'honest') return '';
    const at = new Map(r.precincts.map((p) => [`${p.static.col},${p.static.row}`, p]));
    const out: string[] = [];
    for (const p of r.precincts) {
      const { col, row, node } = p.static;
      const x = X(p.static.x) - cw / 2, y = Y(p.static.y) - ch / 2;
      const sides: Array<[number, number, string]> = [
        [0, -1, `M${x},${y}h${cw}`], [0, 1, `M${x},${y + ch}h${cw}`], [-1, 0, `M${x},${y}v${ch}`], [1, 0, `M${x + cw},${y}v${ch}`],
      ];
      for (const [dc, dr, d] of sides) {
        const q = at.get(`${col + dc},${row + dr}`);
        if (!q || (q.static.node !== node && (dc > 0 || dr > 0))) out.push(d);
      }
    }
    return out.join('');
  }, [r, redrawn, mode, cw, ch]);

  const fillFor = (p: PrecinctResult): { fill: string; opacity: number; label?: string; outline?: string } => {
    const s = p.static;
    if (mode === 'oversight') {
      return { fill: seq((s.oversight - 0.5) / 4), opacity: 0.82, label: String(s.oversight), outline: s.oversight <= 1 ? 'var(--warn)' : undefined };
    }
    if (!counted && mode !== 'truth') return { fill: 'var(--surface-3)', opacity: 0.35 };
    if (mode === 'reported' || mode === 'honest' || mode === 'canvass') {
      const row = mode === 'honest' ? p.honest.inPerson.map((v, j) => v + p.honest.mail[j]) : p.reported;
      const L = leaderOf(row);
      return { fill: candColor(L.j), opacity: mode === 'canvass' ? 0.3 : 0.45 + 0.45 * Math.min(1, L.margin / 0.3) };
    }
    if (mode === 'turnout') {
      const t = sum(p.reported) / Math.max(1, s.registered);
      return { fill: seq((t - 0.3) / 0.7), opacity: 0.82, label: String(Math.round(t * 100)) };
    }
    if (mode === 'flags') {
      return p.flags.length
        ? { fill: 'var(--surface-3)', opacity: 0.85, label: String(p.flags.length), outline: 'var(--bad)' }
        : { fill: 'var(--surface-2)', opacity: 0.3 };
    }
    // truth
    const t = p.tampered.map((l) => LETTER[l]).join('');
    const st = p.stopped.length ? '·' : '';
    return { fill: t ? 'var(--surface-3)' : 'var(--surface-2)', opacity: t ? 0.85 : 0.3, label: t || st || undefined, outline: t ? 'var(--bad)' : p.stopped.length ? 'var(--good)' : undefined };
  };

  const onMove = (e: React.MouseEvent, p: PrecinctResult) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const x = e.clientX - box.left, y = e.clientY - box.top;
    setHover({ p, x: Math.min(x + 14, box.width - 290), y: y + 14 });
  };

  const names = r.config.candidates.map((c) => c.name);
  const ballot = BALLOTS.find((b) => b.id === r.config.ballotId)?.title ?? 'Special election';
  const ct = MAP.cartouche;
  const subLines = wrapWords(ballot, 30).slice(0, 2);
  const nodeOfDistrict = new Map(r.nodes.map((n) => [n.district, n]));
  const zones = DISTRICTS.filter((d) => used.has(d.id));

  return (
    <div className="map-wrap" ref={wrap} onMouseLeave={() => setHover(null)}>
      <div className="map-scroll">
      <svg className="map-svg on-art" style={partyVars(r.config.candidates)} viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Map of Mudwick Isle: ${r.precincts.length} polling places in ${r.nodes.length} districts, shown by ${mode}. The returns table below lists every polling place.`}>
        <defs><Patterns C={C} /></defs>
        <image href={art.url} width={VW} height={VH} preserveAspectRatio="none" />
        <rect width={VW} height={VH} fill="#000" fillOpacity="0.18" pointerEvents="none" />
        {showVotes && zones.map((d) => {
          const nd = nodeOfDistrict.get(d.id)!;
          return <path key={d.id} d={polyPath(d.poly)} fill={candColor(houseLead[nd.i].j)} fillOpacity={mode === 'canvass' ? 0.42 : 0.24} pointerEvents="none" />;
        })}
        {r.precincts.map((p) => {
          const f = fillFor(p);
          const x = X(p.static.x) - cw / 2, y = Y(p.static.y) - ch / 2;
          return (
            <g key={p.static.i} onMouseMove={(e) => onMove(e, p)} onMouseEnter={(e) => onMove(e, p)}>
              <rect x={x + 1.5} y={y + 1.5} width={cw - 3} height={ch - 3} rx={4} fill={f.fill} fillOpacity={f.opacity} stroke={f.outline ?? 'none'} strokeWidth={f.outline ? 4 : 0} strokeDasharray={mode === 'oversight' && f.outline ? '8 6' : undefined} />
              {labels && f.label && (
                <text className="cell-label" x={x + cw / 2} y={y + ch / 2 + cw * 0.14} textAnchor="middle" style={{ fontSize: cw * 0.4 }} pointerEvents="none">{f.label}</text>
              )}
            </g>
          );
        })}
        {showVotes && mode !== 'honest' && zones.map((d) => {
          const nd = nodeOfDistrict.get(d.id)!;
          const pat = boardPattern(nd.canvassBoard, nd.colluded);
          return <path key={d.id} d={polyPath(d.poly)} fill={`url(#${pat.id})`} fillOpacity={mode === 'canvass' ? 0.9 : 0.5} pointerEvents="none" />;
        })}
        {zones.map((d) => (
          <path key={d.id} d={polyPath(d.poly)} className={`district-line${redrawn && mode !== 'honest' ? ' faded' : ''}${d.offMap ? ' offmap' : ''}`} pointerEvents="none" />
        ))}
        {edges && <path d={edges} className="redrawn-line" pointerEvents="none" />}
        {zones.filter((d) => d.offMap).map((d) => (
          <line key={d.id} x1={X(d.offMap!.arrow[0][0])} y1={Y(d.offMap!.arrow[0][1])} x2={X(d.offMap!.arrow[1][0])} y2={Y(d.offMap!.arrow[1][1])} className="offmap-arrow" markerEnd="url(#arrowhead)" pointerEvents="none" />
        ))}
        {zones.map((d) => (
          <g key={d.id} pointerEvents="none">
            <text className={`district-name ${d.kind}`} x={X(d.label[0])} y={Y(d.label[1])} textAnchor={d.offMap?.anchor ?? 'middle'}>{d.name}</text>
            {d.offMap && <text className="district-sub" x={X(d.label[0])} y={Y(d.label[1]) + 24} textAnchor={d.offMap.anchor}>{d.offMap.sub}</text>}
          </g>
        ))}
        <g className="cartouche" pointerEvents="none">
          {art.source === 'mask' && (
            // No painted scroll to letter on: a plain parchment panel in its place.
            <rect x={X(ct.x - 0.8)} y={Y(ct.y + ct.h * 0.08)} width={X(ct.w + 1.6)} height={Y(ct.h * 0.74)} rx={18} fill="#e4d3a8" stroke="#8a6d3b" strokeWidth={4} />
          )}
          <text x={X(ct.x + ct.w / 2)} y={Y(ct.y + ct.h * 0.3)} textAnchor="middle" className="c-title">MUDWICK ISLE</text>
          {subLines.map((line, k) => (
            <text key={k} x={X(ct.x + ct.w / 2)} y={Y(ct.y + ct.h * (0.45 + k * 0.1))} textAnchor="middle" className="c-sub">{line}</text>
          ))}
          <text x={X(ct.x + ct.w / 2)} y={Y(ct.y + ct.h * (0.52 + subLines.length * 0.1))} textAnchor="middle" className="c-note">{props.title ?? `${r.precincts.length} polling places, ${r.nodes.length} districts`}</text>
          <text x={X(ct.x + ct.w / 2)} y={Y(ct.y + ct.h * (0.62 + subLines.length * 0.1))} textAnchor="middle" className="c-note">{r.config.rule === 'districts' ? 'Most districts wins' : 'Most votes wins'} {'·'} seed {r.config.seed}</text>
        </g>
      </svg>
      </div>
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
      <div className="muted tiny">{s.node !== s.homeNode ? `Counted in ${result.nodes[s.node].name}; moved out of ${result.nodes[s.homeNode].name} by the boundary commission` : result.nodes[s.node].name}</div>
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

function PatternSwatch({ kind }: { kind: 'stripes' | 'dots' | 'zigzag' }) {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true" className="pattern-swatch">
      <rect width="22" height="14" rx="3" fill="#2a3a2e" />
      {kind === 'stripes' && [0, 6, 12, 18, 24].map((x) => <line key={x} x1={x - 8} y1="14" x2={x + 6} y2="0" stroke="#e8dcc0" strokeWidth="2" />)}
      {kind === 'dots' && [4, 11, 18].flatMap((x) => [4, 10].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="#fff6dc" />))}
      {kind === 'zigzag' && <path d="M1 10 L5 4 L9 10 L13 4 L17 10 L21 4" fill="none" stroke="#ff7a6b" strokeWidth="2" />}
    </svg>
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
  if (mode === 'reported' || mode === 'honest' || mode === 'canvass') {
    const redrawn = result.precincts.some((p) => p.static.node !== p.static.homeNode);
    return (
      <div className="legend">
        {result.config.candidates.map((c, j) => <span key={j} className="legend-item"><Swatch j={j} />{c.name} <span className="muted">({c.faction})</span></span>)}
        <span>{'\u00b7'} blocks = polling places, zones tinted by the district&rsquo;s winner</span>
        {mode !== 'honest' && <>
          <span className="legend-item"><PatternSwatch kind="stripes" /> board held by one faction</span>
          <span className="legend-item"><PatternSwatch kind="dots" /> mixed board</span>
          <span className="legend-item"><PatternSwatch kind="zigzag" /> board wrote its own numbers</span>
          {redrawn && <span className="legend-item"><span className="swatch" style={{ background: 'var(--warn)' }} aria-hidden="true" /> lines the commission drew</span>}
        </>}
        {mode === 'honest' && <span>{'\u00b7'} the fair map, before any redrawing</span>}
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
