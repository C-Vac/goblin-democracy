/// <reference lib="webworker" />
// The engine runs here so a thousand Monte Carlo elections never freeze the page.
import { parseCsv, runElection, runForensics, runMonteCarlo } from '../engine';
import type { Request, Response } from './protocol';

const post = (msg: Response) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    if (req.type === 'run') {
      post({ id: req.id, type: 'run', result: runElection(req.config) });
    } else if (req.type === 'mc') {
      const summary = runMonteCarlo(req.config, req.runs, (done) => post({ id: req.id, type: 'progress', done, total: req.runs }));
      post({ id: req.id, type: 'mc', summary });
    } else if (req.type === 'csv') {
      const { table, warnings } = parseCsv(req.text);
      post({ id: req.id, type: 'csv', table, warnings, report: runForensics(table) });
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
