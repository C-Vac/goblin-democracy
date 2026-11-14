import { useState } from 'react';
import { ATTACKS, type Config, type MonteCarloSummary } from '../../engine';
import { monteCarloInWorker } from '../engineClient';
import { pct, Tile } from './ui';

const VIA: Record<string, string> = {
  commission: 'Commission',
  'staff-refusal': 'Staff refused', observer: 'Observer', reconciliation: 'Reconciliation', 'tape-mismatch': 'Tape photo',
  'roll-check': 'Roll check', audit: 'Audit', recount: 'Recount', court: 'Court', leak: 'Leak', forensics: 'Forensics',
};

function HBar({ value, color = 'var(--c0)' }: { value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 12, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value * 100)}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span className="mono tiny" style={{ width: 44, textAlign: 'right' }}>{pct(value, 0)}</span>
    </div>
  );
}

export function MonteCarloTab({ cfg }: { cfg: Config }) {
  const [runs, setRuns] = useState(500);
  const [progress, setProgress] = useState<number | null>(null);
  const [summary, setSummary] = useState<MonteCarloSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = ATTACKS.filter((a) => cfg.attacks[a.id] > 0).map((a) => a.short);

  const go = async () => {
    setError(null);
    setProgress(0);
    try {
      setSummary(await monteCarloInWorker(cfg, runs, (d, t) => setProgress(d / t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const s = summary;
  return (
    <div className="main-col">
      <section className="card">
        <h2>One run is an anecdote</h2>
        <p className="small" style={{ marginTop: 0 }}>
          Runs the settings from the Simulate tab on many elections, each with new voters and staff, and each beside the same election with every attack switched off,
          to estimate the chance the result flips, the chance it is caught, and how often each forensic test cries wolf.
        </p>
        <p className="small muted">Attacks on: {active.length ? active.join(', ') : 'none (every run is clean)'}.</p>
        <div className="btn-row">
          <label className="small" htmlFor="runs">Elections</label>
          <select id="runs" className="input" style={{ width: 'auto' }} value={runs} onChange={(e) => setRuns(Number(e.target.value))}>
            {[100, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n.toLocaleString('en-US')}</option>)}
          </select>
          <button type="button" className="btn btn-primary" onClick={go} disabled={progress !== null}>{progress !== null ? 'Running…' : 'Run Monte Carlo'}</button>
        </div>
        {progress !== null && <div className="progress" style={{ marginTop: 12 }} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress * 100}%` }} /></div>}
        {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      </section>

      {s && (
        <>
          <section className="tiles" aria-label="Monte Carlo results">
            <Tile k="Result flipped" v={pct(s.pFlip, 0)} s={`${s.runs.toLocaleString('en-US')} elections`} />
            <Tile k="Fraud caught" v={pct(s.pCaught, 0)} s="exposed somewhere in the cycle" />
            <Tile k="Caught, given a flip" v={s.pFlip ? pct(s.pCaughtGivenFlip, 0) : '—'} />
            <Tile k="Flipped and never caught" v={pct(s.pFlipUncaught, 0)} />
            <Tile k="Conspirators per run" v={s.meanConspirators.toFixed(1)} s={`${s.meanLeakers.toFixed(1)} talk`} />
            <Tile k="Clean runs flagged" v={pct(s.cleanFlagged / s.runs, 0)} s={`by at least one test; ${s.cleanRerun} wrongly rerun`} />
          </section>

          <div className="two">
            <section className="card">
              <h2>Where it was first caught</h2>
              {Object.keys(s.caughtVia).length === 0 && <p className="muted small">Never.</p>}
              <div style={{ display: 'grid', gap: 6 }}>
                {Object.entries(s.caughtVia).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([via, n]) => (
                  <div key={via} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}>
                    <span className="small">{VIA[via] ?? via}</span>
                    <HBar value={(n ?? 0) / s.runs} />
                  </div>
                ))}
              </div>
            </section>
            <section className="card">
              <h2>Secrets scale badly</h2>
              <p className="small muted" style={{ marginTop: 0 }}>Chance a run was caught, by how many people it took.</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {s.byCrew.filter((b) => b.runs > 0).map((b) => (
                  <div key={b.crew} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}>
                    <span className="small mono">{b.crew} people <span className="muted">({b.runs})</span></span>
                    <HBar value={b.caught / b.runs} color="var(--c1)" />
                  </div>
                ))}
                {s.byCrew.every((b) => b.runs === 0) && <p className="muted small">No attacks ran.</p>}
              </div>
            </section>
          </div>

          <section className="card">
            <h2>Forensic tests: hits and false alarms</h2>
            <p className="small muted" style={{ marginTop: 0 }}>How often each test failed on the rigged elections, and on the same elections with nobody cheating.</p>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Test</th><th style={{ width: '35%' }}>Fails when rigged</th><th style={{ width: '35%' }}>Fails when clean</th></tr></thead>
                <tbody>
                  {s.detectors.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td><HBar value={d.rigged} color="var(--c0)" /></td>
                      <td><HBar value={d.clean} color="var(--c2)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
