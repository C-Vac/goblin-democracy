import { ATTACKS, CATCH_PLACE, type ElectionResult } from '../../engine';
import { candColor, int, pct } from './ui';

const VIA_LABEL: Record<string, string> = {
  'staff-refusal': 'someone refused',
  observer: 'an observer',
  reconciliation: 'sign-in reconciliation',
  'tape-mismatch': 'an observer’s tape photo',
  'roll-check': 'the roll check',
  audit: 'the audit',
  recount: 'the recount',
  court: 'the court',
  leak: 'a conspirator talked',
  forensics: 'forensics',
};

export function ResultBars({ result }: { result: ElectionResult }) {
  const names = result.config.candidates.map((c) => c.name);
  const rows: Array<[string, number[]]> = [
    ['Honest', result.honest.totals],
    ['Counted', result.canvassed.totals],
    ['Certified', result.certified.totals],
  ];
  return (
    <div className="bars" role="table" aria-label="Vote totals">
      {rows.map(([label, totals]) => {
        const b = totals.reduce((a, c) => a + c, 0) || 1;
        return (
          <div key={label} className="bar-row" role="row">
            <span role="rowheader">{label}</span>
            <div className="bar" role="cell" title={totals.map((t, j) => `${names[j]}: ${int(t)} (${pct(t / b)})`).join(' · ')}>
              {totals.map((t, j) => <div key={j} style={{ width: `${(t / b) * 100}%`, background: candColor(j) }} />)}
            </div>
          </div>
        );
      })}
      <div className="legend">
        {names.map((n, j) => (
          <span key={j} className="legend-item">
            <span className="swatch" style={{ background: candColor(j) }} />{n}: {pct(result.certified.totals[j] / Math.max(1, result.certified.ballots))}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Verdict({ result }: { result: ElectionResult }) {
  const h = result.headline;
  const names = result.config.candidates.map((c) => c.name);
  const c = h.caughtAt;
  const layer = c ? ATTACKS.find((a) => a.id === c.layer) : null;
  const pNoLeak = result.conspirators.reduce((a, x) => a * (1 - x.leakP), 1);
  const leaked = result.conspirators.filter((x) => x.leaked).length;
  const byLayer = ATTACKS.map((a) => ({ a, n: result.conspirators.filter((x) => x.layer === a.id).length })).filter((x) => x.n > 0);
  return (
    <section className="card" aria-live="polite">
      <div className="answers">
        <div className="answer">
          <div className="q">Did the result flip?</div>
          <div className="a" style={{ color: h.flipped ? 'var(--bad)' : 'var(--good)' }}>{h.flipped ? '✕ Yes' : '✓ No'}</div>
          <div className="d">Voters chose {names[result.honest.winner]}; certified {names[result.certified.winner]}.</div>
        </div>
        <div className="answer">
          <div className="q">Was it caught?</div>
          <div className="a" style={{ color: !h.attempted ? 'var(--muted)' : h.caught ? 'var(--good)' : 'var(--bad)' }}>
            {!h.attempted ? '– Nothing to catch' : h.caught ? '✓ Yes' : '✕ No'}
          </div>
          <div className="d">{!h.attempted ? (result.forensics.fails ? `Still, ${result.forensics.fails} forensic test${result.forensics.fails > 1 ? 's' : ''} failed.` : 'No attack ran.') : c ? c.text : 'No safeguard, leak or court caught it.'}</div>
        </div>
        <div className="answer">
          <div className="q">At which layer?</div>
          <div className="a">{c ? (CATCH_PLACE[c.via] ?? '').replace(/^(at|in|by) (the )?/, '').replace(/^\w/, (m) => m.toUpperCase()) : '—'}</div>
          <div className="d">{c && layer ? `${layer.name}, caught by ${VIA_LABEL[c.via] ?? c.via}.` : h.attempted ? 'It went through every layer.' : ''}</div>
        </div>
      </div>
      <p className="headline">{h.text}</p>
      <ResultBars result={result} />
      {result.conspirators.length > 0 && (
        <div className="small" style={{ marginTop: 12 }}>
          <strong>{int(result.conspirators.length)} conspirators</strong>{' '}
          <span className="muted">({byLayer.map((x) => `${x.n} ${x.n === 1 ? x.a.actor : x.a.actors}`).join(', ')}).</span>{' '}
          Chance nobody talks: <span className="mono">{pNoLeak < 0.001 ? '< 0.1%' : pct(pNoLeak)}</span>. {leaked ? `${leaked} did.` : 'Nobody did.'}
        </div>
      )}
    </section>
  );
}
