import { useState } from 'react';
import { CSV_TEMPLATE, resultToCsv, type ElectionResult, type ForensicReport, type Table } from '../../engine';
import { csvInWorker } from '../engineClient';
import { DetectorList, ForensicCharts } from './Forensics';
import { int } from './ui';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataTab({ result }: { result: ElectionResult | null }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<{ table: Table; warnings: string[]; report: ForensicReport } | null>(null);

  const analyse = async (csv: string) => {
    setBusy(true);
    setError(null);
    try {
      setOut(await csvInWorker(csv));
    } catch (e) {
      setOut(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { setError('That file is over 20 MB.'); return; }
    const t = await f.text();
    setText(t.length > 200000 ? `${t.slice(0, 200000)}\n` : t);
    analyse(t);
  };

  const flagged = out ? new Set(out.report.detectors.filter((d) => d.status === 'fail' || d.status === 'warn').flatMap((d) => d.units)) : new Set<number>();
  const lead = out ? out.table.options.map((_, j) => out.table.units.reduce((a, u) => a + (u.counts[j] ?? 0), 0)) : [];
  const leader = out ? out.table.options[lead.indexOf(Math.max(...lead))] : '';

  return (
    <div className="main-col">
      <section className="card">
        <h2>Check your own numbers</h2>
        <p className="small" style={{ marginTop: 0 }}>
          The same tests work on any table of units and counts: polling places, but also branches and their sales by product,
          clinics and their claims by code, depots and their stock counts, departments and their expense claims. Each row is a unit;
          each count column is an option.
        </p>
        <div className="notice small">Runs entirely in your browser. Nothing you paste or upload leaves this page.</div>
        <div className="prose small" style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 4px' }}><strong>Columns</strong> (header row required; only <span className="mono">unit</span> and two or more count columns are needed):</p>
          <ul style={{ margin: 0 }}>
            <li><span className="mono">unit</span>, <span className="mono">name</span>: an id and a label.</li>
            <li>Any other numeric column: a count per option (candidate, product, category).</li>
            <li><span className="mono">registered</span>: the capacity or population (for turnout tests); <span className="mono">voters</span>: people recorded taking part (for reconciliation); <span className="mono">eligible</span>: a census figure.</li>
            <li><span className="mono">x</span>, <span className="mono">y</span>: map position (for the neighbour test); <span className="mono">node</span>: the reporting chain, region or manager (for the border test).</li>
            <li><span className="mono">mail:&lt;option&gt;</span> for every option, or <span className="mono">mail_sent</span> and <span className="mono">mail_returned</span>: a second channel (for the mail tests).</li>
          </ul>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <label className="btn btn-small">
            Upload CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button type="button" className="btn btn-small" onClick={() => download('template.csv', CSV_TEMPLATE)}>Download template</button>
          {result && <button type="button" className="btn btn-small" onClick={() => { const csv = resultToCsv(result); setText(csv); analyse(csv); }}>Load this simulation’s returns</button>}
          {result && <button type="button" className="btn btn-small" onClick={() => download(`mudwick-seed-${result.config.seed}.csv`, resultToCsv(result))}>Export them</button>}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="csv">Or paste it here</label>
          <textarea id="csv" className="input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder={CSV_TEMPLATE} />
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => analyse(text)}>{busy ? 'Checking…' : 'Run the tests'}</button>
        </div>
        {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      </section>

      {out && (
        <>
          {out.warnings.map((w) => <div key={w} className="notice small">{w}</div>)}
          <div className="two">
            <section className="card">
              <div className="card-head"><h2>Tests</h2><span className="small muted">{int(out.table.units.length)} units · {out.table.options.length} options</span></div>
              <DetectorList report={out.report} />
            </section>
            <section className="card">
              <h2>Charts</h2>
              <ForensicCharts report={out.report} leader={leader} />
            </section>
          </div>
          <section className="card">
            <h2>Flagged units</h2>
            {flagged.size === 0 ? <p className="muted small">None.</p> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Unit</th><th>Name</th><th>Tests</th>{out.table.options.map((o) => <th key={o}>{o}</th>)}</tr></thead>
                  <tbody>
                    {[...flagged].slice(0, 200).map((i) => {
                      const u = out.table.units[i];
                      const tests = out.report.detectors.filter((d) => (d.status === 'fail' || d.status === 'warn') && d.units.includes(i)).map((d) => d.name).join(', ');
                      return <tr key={i}><td className="mono">{u.id}</td><td>{u.name ?? ''}</td><td className="small">{tests}</td>{u.counts.map((c, j) => <td key={j} className="num">{int(c)}</td>)}</tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tiny muted">A flag is a reason to look closer, not proof of anything. Honest data trips these tests too; see the clean election that looks guilty.</p>
          </section>
        </>
      )}
    </div>
  );
}
