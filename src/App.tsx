import { useEffect, useMemo, useRef, useState } from 'react';
import { ATTACKS, decodeConfig, encodeConfig, PHASES, PRESETS, type Config, type ElectionResult } from '../engine';
import { About } from './components/About';
import { AuditPanel } from './components/AuditPanel';
import { Controls } from './components/Controls';
import { DataTab } from './components/DataTab';
import { DetectorList, ForensicCharts } from './components/Forensics';
import { IsleMap, MAP_MODES, type MapMode } from './components/IsleMap';
import { MonteCarloTab } from './components/MonteCarloTab';
import { drawResultCard } from './components/ResultCard';
import { int, pct } from './components/ui';
import { Verdict } from './components/Verdict';
import { runInWorker } from './engineClient';

type Tab = 'sim' | 'mc' | 'data' | 'about';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sim', label: 'Simulate' },
  { id: 'mc', label: 'Monte Carlo' },
  { id: 'data', label: 'Your data' },
  { id: 'about', label: 'About the model' },
];
const PHASE_IDS = PHASES.map((p) => p.id);
const DONE = PHASES.length;

function readHash(): { cfg: Config | null; tab: Tab; preset: string | null } {
  const q = new URLSearchParams(location.hash.slice(1));
  const tab = (TABS.find((t) => t.id === q.get('t'))?.id ?? 'sim') as Tab;
  const preset = q.get('p');
  const c = q.get('c');
  const fromPreset = preset ? PRESETS.find((p) => p.id === preset) : undefined;
  return { cfg: c ? decodeConfig(c) : fromPreset ? structuredClone(fromPreset.config) : null, tab, preset: fromPreset ? preset : null };
}

function writeHash(cfg: Config, tab: Tab, preset: string | null) {
  const q = new URLSearchParams();
  if (tab !== 'sim') q.set('t', tab);
  if (preset) q.set('p', preset);
  q.set('c', encodeConfig(cfg));
  try {
    history.replaceState(null, '', `#${q.toString()}`);
  } catch {
    /* sandboxed: the link just won't update */
  }
}

export function App() {
  const init = useMemo(readHash, []);
  const [cfg, setCfgRaw] = useState<Config>(init.cfg ?? structuredClone(PRESETS[0].config));
  const [presetId, setPresetId] = useState<string | null>(init.cfg ? init.preset : 'fair');
  const [tab, setTab] = useState<Tab>(init.tab);
  const [result, setResult] = useState<ElectionResult | null>(null);
  const [phase, setPhase] = useState(-1);
  const [mode, setMode] = useState<MapMode>('oversight');
  const [card, setCard] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      runInWorker(cfg).then((r) => { if (live && r) { setResult(r); setError(null); } }).catch((e) => setError(String(e?.message ?? e)));
    }, 60);
    return () => { live = false; window.clearTimeout(t); };
  }, [cfg]);
  useEffect(() => writeHash(cfg, tab, presetId), [cfg, tab, presetId]);
  useEffect(() => () => window.clearInterval(timer.current), []);
  useEffect(() => { if (card) dialog.current?.showModal(); }, [card]);

  const setCfg = (c: Config) => { setCfgRaw(c); setPresetId(null); };
  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    window.clearInterval(timer.current);
    setCfgRaw(structuredClone(p.config));
    setPresetId(id);
    setPhase(-1);
    setMode('oversight');
  };

  const start = () => {
    window.clearInterval(timer.current);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setPhase(DONE); setMode('reported'); return; }
    setPhase(0);
    setMode('oversight');
    let k = 0;
    timer.current = window.setInterval(() => {
      k++;
      setPhase(k);
      if (k === PHASE_IDS.indexOf('count')) setMode('reported');
      if (k >= DONE) window.clearInterval(timer.current);
    }, 650);
  };
  const skip = () => { window.clearInterval(timer.current); setPhase(DONE); if (mode === 'oversight') setMode('reported'); };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  };
  const makeCard = async () => { if (result) setCard(await drawResultCard(result)); };

  const counted = phase >= PHASE_IDS.indexOf('count');
  const done = phase >= DONE;
  const events = result ? result.events.filter((e) => phase >= 0 && PHASE_IDS.indexOf(e.phase) <= Math.min(phase, DONE - 1)) : [];
  const leaderName = result ? result.config.candidates[result.canvassed.winner].name : '';

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <img src="/democracy/ballot.svg" alt="" />
          <div>
            <div className="eyebrow">GoblinLife Labs · for the Council of Elders</div>
            <h1 className="title">Mudwick Isle Election Fraud Simulator</h1>
          </div>
        </div>
        <a className="back" href="/">← GoblinLife.org</a>
      </header>
      <p className="subtitle" style={{ margin: 0 }}>
        Mudwick Isle has not held an election since Parliament closed. The Council commissioned this simulator to find out what
        holding one would involve. Pick attacks and safeguards, press Start, and see whether the result flips, whether anyone
        notices, and where.
      </p>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'sim' && (
        <div className="layout">
          <Controls cfg={cfg} presetId={presetId} onChange={setCfg} onPreset={applyPreset} />
          <div className="main-col">
            <section className="card">
              <div className="runbar">
                <button type="button" className="btn btn-primary" onClick={start} disabled={!result}>{phase >= 0 && !done ? 'Running…' : done ? 'Run again' : 'Start'}</button>
                {phase >= 0 && !done && <button type="button" className="btn btn-small" onClick={skip}>Skip to the end</button>}
                <div className="phases" aria-label="Election cycle">
                  {PHASES.map((p, k) => (
                    <div key={p.id} data-n={k + 1} className={`phase ${phase > k ? 'done' : ''} ${phase === k ? 'now' : ''}`}><span>{p.name}</span></div>
                  ))}
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-small" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link to this election'}</button>
                <button type="button" className="btn btn-small" onClick={makeCard} disabled={!done || !result}>Result card</button>
                <span className="tiny muted">Seed {cfg.seed}. The link holds the settings and the seed.</span>
                <a className="tiny settings-jump" href="#settings" onClick={(e) => { e.preventDefault(); document.getElementById('settings')?.scrollIntoView(); }}>Presets and settings ↓</a>
              </div>
              {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>The isle</h2>
                <div className="viewmodes" role="group" aria-label="Map view">
                  {MAP_MODES.map((m) => (
                    <button key={m.id} type="button" className="chip" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
                  ))}
                </div>
              </div>
              {result ? <IsleMap result={result} mode={mode} counted={counted || done} /> : <p className="muted">Drawing the island…</p>}
            </section>

            {result && done && <Verdict result={result} />}

            {result && done && (
              <div className="two">
                <section className="card">
                  <div className="card-head"><h2>Forensics</h2><span className="small muted">on the published returns only</span></div>
                  <DetectorList report={result.forensics} />
                </section>
                <section className="card">
                  <h2>Fingerprints</h2>
                  <ForensicCharts report={result.forensics} leader={leaderName} />
                </section>
              </div>
            )}

            {result && phase >= 0 && (
              <div className="two">
                {done ? <AuditPanel result={result} /> : <section className="card"><h2>Audit math</h2><p className="muted small">After the count.</p></section>}
                <section className="card">
                  <h2>What happened</h2>
                  <div className="log" aria-live="polite">
                    {events.map((e, k) => (
                      <div key={k} className={`log-item ${e.tone}`}>
                        <span className="ph">{PHASES.find((p) => p.id === e.phase)?.name}</span>
                        <span className="tx">{e.text}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {result && done && (
              <details className="card">
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Returns table ({result.precincts.length} polling places)</summary>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Polling place</th><th>Counting house</th><th>Oversight</th><th>Registered</th><th>Voters</th><th>Ballots</th><th>Turnout</th>
                        {result.config.candidates.map((c) => <th key={c.name}>{c.name}</th>)}
                        <th>Flags</th><th>Tampered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.precincts.map((p) => {
                        const b = p.reported.reduce((a, x) => a + x, 0);
                        return (
                          <tr key={p.static.i}>
                            <td>{p.static.name}</td><td>{result.nodes[p.static.node].name}</td><td className="num">{p.static.oversight}</td>
                            <td className="num">{int(p.static.registered)}</td><td className="num">{int(p.published.signins + p.published.mailReturned)}</td>
                            <td className="num">{int(b)}</td><td className="num">{pct(b / Math.max(1, p.static.registered), 0)}</td>
                            {p.reported.map((v, j) => <td key={j} className="num">{int(v)}</td>)}
                            <td className="small">{p.flags.join(', ')}</td>
                            <td className="small">{p.tampered.map((l) => ATTACKS.find((a) => a.id === l)?.short).join(', ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {tab === 'mc' && <MonteCarloTab cfg={cfg} />}
      {tab === 'data' && <DataTab result={result} />}
      {tab === 'about' && <About />}

      <dialog ref={dialog} className="card" style={{ maxWidth: 'min(96vw, 860px)', padding: 16 }} onClose={() => setCard(null)}>
        {card && (
          <>
            <img src={card} alt={result?.headline.text ?? 'Result card'} style={{ width: '100%', height: 'auto', borderRadius: 8 }} />
            <div className="btn-row" style={{ marginTop: 12 }}>
              <a className="btn btn-primary" href={card} download={`mudwick-election-${cfg.seed}.png`}>Download PNG</a>
              <button type="button" className="btn" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
              <button type="button" className="btn" onClick={() => dialog.current?.close()}>Close</button>
            </div>
          </>
        )}
      </dialog>

      <footer className="footer">
        <div>A GoblinLife Labs sandbox. Mudwick Isle, its residents, factions and candidates are fictional; the attacks, safeguards and statistics are real. See <a href="#t=about" onClick={(e) => { e.preventDefault(); setTab('about'); }}>About the model</a> for sources.</div>
        <div>Everything runs in your browser. <a href="https://github.com/C-Vac/goblin-democracy">Source code</a>.</div>
      </footer>
    </div>
  );
}
