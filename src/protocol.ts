import type { Config, ElectionResult, ForensicReport, MonteCarloSummary, Table } from '../engine';

export type Request =
  | { id: number; type: 'run'; config: Config }
  | { id: number; type: 'mc'; config: Config; runs: number }
  | { id: number; type: 'csv'; text: string };

export type Response =
  | { id: number; type: 'run'; result: ElectionResult }
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'mc'; summary: MonteCarloSummary }
  | { id: number; type: 'csv'; table: Table; warnings: string[]; report: ForensicReport }
  | { id: number; type: 'error'; message: string };
