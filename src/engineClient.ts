import type { Config, ElectionResult, ForensicReport, MonteCarloSummary, Table } from '../engine';
import type { Request, Response } from './protocol';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Pending = { resolve: (r: Response) => void; reject: (e: Error) => void; onProgress?: (done: number, total: number) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Response>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') { p.onProgress?.(msg.done, msg.total); return; }
    pending.delete(msg.id);
    if (msg.type === 'error') p.reject(new Error(msg.message));
    else p.resolve(msg);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'The simulation worker failed.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function ask(req: WithoutId<Request>, onProgress?: Pending['onProgress']): Promise<Response> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ ...req, id } as Request);
  });
}

/** Runs are cheap, so only the newest one matters: older answers are dropped. */
let latestRun = 0;
export async function runInWorker(config: Config): Promise<ElectionResult | null> {
  const mine = ++latestRun;
  const res = await ask({ type: 'run', config });
  if (mine !== latestRun) return null;
  return res.type === 'run' ? res.result : null;
}

export async function monteCarloInWorker(config: Config, runs: number, onProgress: (done: number, total: number) => void): Promise<MonteCarloSummary> {
  const res = await ask({ type: 'mc', config, runs }, onProgress);
  if (res.type !== 'mc') throw new Error('Unexpected reply');
  return res.summary;
}

export async function csvInWorker(text: string): Promise<{ table: Table; warnings: string[]; report: ForensicReport }> {
  const res = await ask({ type: 'csv', text });
  if (res.type !== 'csv') throw new Error('Unexpected reply');
  return res;
}
