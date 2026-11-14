import {
  ATTACKS, BALLOTS, PRESETS, SAFEGUARDS, SPECIES, withBallot,
  type AttackId, type Config, type GridSize, type SafeguardId,
} from '../../engine';
import { Slider, Swatch } from './ui';

const SAFEGUARD_FORMAT: Partial<Record<SafeguardId, (v: number) => string>> = {
  auditRate: (v) => (v === 0 ? 'off' : `${(v / 10).toFixed(1)}% of ballots`),
  recountTrigger: (v) => (v === 0 ? 'off' : `margin < ${((v / 100) * 2).toFixed(2)} pts`),
  courts: (v) => `${v}% act`,
};

const SIZES: Array<{ id: GridSize; label: string }> = [
  { id: 'S', label: 'Small (~50)' },
  { id: 'M', label: 'Medium (~70)' },
  { id: 'L', label: 'Large (~180)' },
  { id: 'XL', label: 'Huge (~350)' },
];

export function Controls(props: {
  cfg: Config;
  presetId: string | null;
  onChange: (cfg: Config) => void;
  onPreset: (id: string) => void;
}) {
  const { cfg, onChange } = props;
  const set = (patch: Partial<Config>) => onChange({ ...cfg, ...patch });
  const setAttack = (id: AttackId, v: number) => onChange({ ...cfg, attacks: { ...cfg.attacks, [id]: v } });
  const setSafeguard = (id: SafeguardId, v: number) => onChange({ ...cfg, safeguards: { ...cfg.safeguards, [id]: v } });
  const speciesTotal = SPECIES.reduce((a, s) => a + (cfg.species[s.id] ?? 0), 0) || 1;
  const active = PRESETS.find((p) => p.id === props.presetId);

  return (
    <aside className="controls" id="settings" aria-label="Simulation settings">
      <details className="group" open>
        <summary>Presets</summary>
        <div className="group-body">
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className="preset" aria-pressed={p.id === props.presetId} onClick={() => props.onPreset(p.id)}>
                {p.kind === 'history' && <div className="preset-kind">Historical pattern</div>}
                <strong>{p.name}</strong>
                <span>{p.blurb}</span>
              </button>
            ))}
          </div>
          {active && (
            <div className="notice">
              <strong>Look for:</strong> {active.notice}
              {active.source && <div className="tiny muted" style={{ marginTop: 6 }}>{active.source}</div>}
            </div>
          )}
        </div>
      </details>

      <details className="group" open>
        <summary>Attacks</summary>
        <div className="group-body">
          <p className="group-note">How far each attack is pushed: the share of polling places, counting houses or boards it is tried in. Attackers pick the quietest first.</p>
          {ATTACKS.map((a) => (
            <Slider key={a.id} tone="attack" label={a.name} value={cfg.attacks[a.id]} onChange={(v) => setAttack(a.id, v)} format={(v) => (v === 0 ? 'off' : `${v}%`)} help={a.help} />
          ))}
          <div className="field">
            <label htmlFor="favored">The attackers work for</label>
            <select id="favored" className="input" value={cfg.favored} onChange={(e) => set({ favored: Number(e.target.value) })}>
              {cfg.candidates.map((c, j) => <option key={j} value={j}>{c.name} ({c.faction})</option>)}
            </select>
          </div>
        </div>
      </details>

      <details className="group" open>
        <summary>Safeguards</summary>
        <div className="group-body">
          {SAFEGUARDS.map((g) => (
            <Slider key={g.id} label={g.name} value={cfg.safeguards[g.id]} onChange={(v) => setSafeguard(g.id, v)} format={SAFEGUARD_FORMAT[g.id] ?? ((v) => `${v}%`)} help={g.help} />
          ))}
          <label className="radio-inline" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={cfg.rla} onChange={(e) => set({ rla: e.target.checked })} />
            Risk-limiting audit: sample until confident
          </label>
          <Slider label="Risk limit" value={cfg.riskLimit} min={1} max={20} onChange={(v) => set({ riskLimit: v })} format={(v) => `${v}%`} help="The largest chance the audit lets a wrong winner stand." />
          <Slider label="Patronage" value={cfg.patronage} onChange={(v) => set({ patronage: v })} format={(v) => `${v}%`} help="Where staffing is not mixed, the share of polling places the attackers' own faction staffs. At 100% one faction holds every role: a city machine." />
        </div>
      </details>

      <details className="group">
        <summary>Ballot</summary>
        <div className="group-body">
          <div className="field">
            <label htmlFor="ballot">Contest</label>
            <select id="ballot" className="input" value={cfg.ballotId} onChange={(e) => onChange(withBallot(cfg, e.target.value))}>
              {BALLOTS.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
          {cfg.candidates.map((c, j) => (
            <div key={j} className="field">
              <div className="cand-row">
                <Swatch j={j} />
                <input
                  className="input"
                  aria-label={`Candidate ${j + 1} name`}
                  value={c.name}
                  maxLength={40}
                  onChange={(e) => set({ candidates: cfg.candidates.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)) })}
                />
                <span className="tiny muted">{c.faction}</span>
              </div>
              <Slider label="Council loyalty" value={Math.round(c.x * 100)} min={-100} max={100} onChange={(v) => set({ candidates: cfg.candidates.map((x, k) => (k === j ? { ...x, x: v / 100 } : x)) })} format={(v) => (v > 0 ? `for ${v}` : v < 0 ? `against ${-v}` : 'neutral')} />
              <Slider label="Who gets a vote" value={Math.round(c.y * 100)} min={-100} max={100} onChange={(v) => set({ candidates: cfg.candidates.map((x, k) => (k === j ? { ...x, y: v / 100 } : x)) })} format={(v) => (v > 30 ? 'every species' : v < -30 ? 'goblins only' : 'mixed')} />
            </div>
          ))}
          <p className="group-note">Each species votes for the candidate nearest its own views, with local swings.</p>
        </div>
      </details>

      <details className="group">
        <summary>Population</summary>
        <div className="group-body">
          {SPECIES.map((s) => (
            <Slider
              key={s.id}
              label={s.name}
              value={cfg.species[s.id] ?? 0}
              onChange={(v) => set({ species: { ...cfg.species, [s.id]: v } })}
              format={(v) => `${Math.round((v / speciesTotal) * 100)}% of residents`}
              help={s.id === 'leafy' ? 'Goblins the Council reclassified as houseplants. Mostly still registered.' : undefined}
            />
          ))}
          <Slider label="Enclaves" value={cfg.clustering} onChange={(v) => set({ clustering: v })} format={(v) => `${v}%`} help="0: every precinct has the isle-wide mix. 100: each species lives in its own neighbourhoods." />
          <Slider label="Mail voting" value={cfg.mailShare} onChange={(v) => set({ mailShare: v })} format={(v) => `${v}% of voters`} />
        </div>
      </details>

      <details className="group">
        <summary>Island and seed</summary>
        <div className="group-body">
          <div className="field">
            <label htmlFor="size">Polling places</label>
            <select id="size" className="input" value={cfg.size} onChange={(e) => set({ size: e.target.value as GridSize })}>
              {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="seed">Seed</label>
            <div className="btn-row">
              <input id="seed" className="input mono" style={{ flex: 1 }} inputMode="numeric" value={cfg.seed} onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, '')); if (Number.isFinite(v)) set({ seed: Math.min(v, 2 ** 31) }); }} />
              <button type="button" className="btn btn-small" onClick={() => set({ seed: Math.floor(Math.random() * 1e6) })}>New island</button>
            </div>
          </div>
          <p className="group-note">The seed fixes the island, its voters and every random draw. The same link replays the same election.</p>
        </div>
      </details>
    </aside>
  );
}
