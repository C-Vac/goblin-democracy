/**
 * CSV in and out. Any table of units and counts can be checked: polling places, but also shops
 * and their sales by product, clinics and their claims by code, depots and their stock counts.
 *
 * Columns (case-insensitive). Only `unit` and two or more option columns are required:
 *   unit, name, x, y, node, eligible, registered, voters, mail_sent, mail_returned,
 *   <option>..., mail:<option>...
 * Every other numeric column is an option.
 */

import type { Table, Unit } from './forensics';
import type { ElectionResult } from './types';

const RESERVED = new Set(['unit', 'id', 'name', 'x', 'y', 'node', 'eligible', 'registered', 'voters', 'mail_sent', 'mail_returned']);

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export interface ParsedTable {
  table: Table;
  warnings: string[];
}

export function parseCsv(text: string, maxUnits = 20000): ParsedTable {
  const rows = parseCsvRows(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw new Error('Need a header row and at least one data row.');
  const header = rows[0].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const col = (name: string) => lower.indexOf(name);
  const unitCol = col('unit') >= 0 ? col('unit') : col('id');
  const warnings: string[] = [];
  const body = rows.slice(1, maxUnits + 1);
  if (rows.length - 1 > maxUnits) warnings.push(`Only the first ${maxUnits.toLocaleString('en-US')} rows were read.`);
  const isNum = (s: string | undefined) => s !== undefined && s.trim() !== '' && Number.isFinite(Number(s.replace(/[, _]/g, '')));
  const toNum = (s: string | undefined) => (isNum(s) ? Number((s as string).replace(/[, _]/g, '')) : undefined);

  const optionCols: number[] = [];
  const mailCols = new Map<string, number>();
  lower.forEach((h, i) => {
    if (i === unitCol || RESERVED.has(h)) return;
    if (h.startsWith('mail:')) { mailCols.set(h.slice(5), i); return; }
    const numeric = body.filter((r) => isNum(r[i])).length;
    if (numeric >= body.length * 0.9) optionCols.push(i);
  });
  if (optionCols.length < 2) throw new Error('Need at least two numeric option columns (for example the count for each candidate or category).');
  const options = optionCols.map((i) => header[i]);
  const mailIdx = options.map((o) => mailCols.get(o.toLowerCase()));
  const hasMail = mailIdx.every((i) => i !== undefined);
  if (mailCols.size && !hasMail) warnings.push('mail: columns were found but not one for every option, so the mail split is ignored.');

  const units: Unit[] = body.map((r, k) => {
    const g = (name: string) => (col(name) >= 0 ? toNum(r[col(name)]) : undefined);
    const nodeCol = col('node');
    return {
      id: unitCol >= 0 ? r[unitCol]?.trim() || String(k + 1) : String(k + 1),
      name: col('name') >= 0 ? r[col('name')]?.trim() : undefined,
      x: g('x'),
      y: g('y'),
      node: nodeCol >= 0 ? r[nodeCol]?.trim() : undefined,
      eligible: g('eligible'),
      registered: g('registered'),
      voters: g('voters'),
      mailSent: g('mail_sent'),
      mailReturned: g('mail_returned'),
      counts: optionCols.map((i) => Math.max(0, toNum(r[i]) ?? 0)),
      mail: hasMail ? mailIdx.map((i) => Math.max(0, toNum(r[i as number]) ?? 0)) : undefined,
    };
  });
  return { table: { options, units }, warnings };
}

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The published returns of a simulated election, in the same format the upload reads. */
export function resultToCsv(r: ElectionResult): string {
  const names = r.config.candidates.map((c) => c.name);
  const header = ['unit', 'name', 'x', 'y', 'node', 'eligible', 'registered', 'voters', 'mail_sent', 'mail_returned', ...names, ...names.map((n) => `mail:${n}`)];
  const lines = [header.map(esc).join(',')];
  for (const p of r.precincts) {
    const s = p.static;
    const mail = p.published.mail.map((v, j) => Math.min(v, p.reported[j]));
    lines.push([
      `${String.fromCharCode(65 + (s.col % 26))}${s.row + 1}`, s.name, s.col, s.row, r.nodes[s.node].name, s.eligible, s.registered,
      p.published.signins + p.published.mailReturned, p.published.mailSent, p.published.mailReturned, ...p.reported, ...mail,
    ].map((v) => esc(String(v))).join(','));
  }
  return lines.join('\n') + '\n';
}

export const CSV_TEMPLATE = `unit,name,node,x,y,registered,voters,Option A,Option B,Option C
1,North depot,East region,0,0,1200,830,410,300,120
2,South depot,East region,1,0,950,610,280,250,80
`;
