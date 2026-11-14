# Mudwick Isle Election Fraud Simulator

Rig an election on Mudwick Isle, a fictional goblin island, then find out which safeguard catches you.

Six attacks (ballot stuffing, impersonation, mail-ballot harvesting, tabulator tampering, canvass collusion, refusal
to certify) against seven safeguards (paper ballots, sign-in reconciliation, mixed-faction staffing, observers,
audits, recount triggers, courts). Every corrupted layer adds conspirators, and every conspirator might talk. The
result answers three questions: did the result flip, was it caught, and where.

The forensic tests are real, published methods (turnout-versus-share fingerprints, last digits, whole-number
percentages, neighbour outliers, reconciliation, mail anomalies, border jumps, risk-limiting audits). The **Your
data** tab runs them on any CSV of units and counts, in the browser.

Live at **https://www.goblinlife.org/democracy**. Part of [GoblinLife.org](https://www.goblinlife.org).

## Develop

```bash
pnpm install
pnpm dev      # http://localhost:3009/democracy/
pnpm test     # engine invariants and forensics
pnpm lint     # tsc
pnpm build    # dist/, or $DEMOCRACY_OUT_DIR
```

- `engine/` is pure TypeScript with no DOM. It runs in a Web Worker (`src/worker.ts`).
- `src/` is the React interface.
- `docs/SPEC.md` is the living spec.

In the GoblinLife monorepo this repo is the submodule `packages/democracy`; the www build copies its build into
`apps/www/public/democracy`.

Mudwick Isle, its residents, factions and candidates are fictional. The statistics are not.
