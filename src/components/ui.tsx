import { useId, type CSSProperties, type ReactNode } from 'react';
import type { DetectorStatus } from '../../engine';

/** A candidate's colour is their party's. The page maps --c<j> to the party of candidate j (partyVars). */
export const candColor = (j: number) => `var(--c${j % 5})`;

/** CSS variables mapping candidate slots to party colours. Set on any element that redefines --p-*. */
export function partyVars(cands: Array<{ party: string }>): CSSProperties {
  const out: Record<string, string> = {};
  cands.forEach((c, j) => { out[`--c${j}`] = `var(--p-${c.party})`; });
  return out as CSSProperties;
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const int = (x: number) => Math.round(x).toLocaleString('en-US');

export function Slider(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  help?: ReactNode;
  tone?: 'attack' | 'safeguard';
}) {
  const id = useId();
  const { min = 0, max = 100, step = 1 } = props;
  return (
    <div className={`slider ${props.tone ?? ''}`}>
      <div className="slider-top">
        <label htmlFor={id}>{props.label}</label>
        <output htmlFor={id}>{props.format ? props.format(props.value) : props.value}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-describedby={props.help ? `${id}-help` : undefined}
      />
      {props.help && <div className="help" id={`${id}-help`}>{props.help}</div>}
    </div>
  );
}

const STATUS_LABEL: Record<DetectorStatus, string> = { pass: '✓ Pass', warn: '! Warn', fail: '✕ Fail', na: '– n/a' };

export function Status({ s }: { s: DetectorStatus }) {
  return <span className={`status ${s}`}>{STATUS_LABEL[s]}</span>;
}

export function Swatch({ j, color }: { j?: number; color?: string }) {
  return <span className="swatch" style={{ background: color ?? candColor(j ?? 0) }} aria-hidden="true" />;
}

export function Tile({ k, v, s }: { k: string; v: ReactNode; s?: ReactNode }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}
