# Mudwick Isle Election Fraud Simulator: Agile Specification

> **Status:** 🔄 In Progress. v0.1 built 2026-11-13; hosting at www.goblinlife.org/democracy waits on the site PR.
> **Repo:** `C-Vac/goblin-democracy`, a git submodule of the site monorepo at `packages/democracy`.
> **Route:** `www.goblinlife.org/democracy` (static Vite build copied into `apps/www/public/democracy` at www build time).
> **Owner brief:** 2026-11-13 (session request plus the "Model design" notes pasted the same day).

## Overview

A parody of interactive "explorable" simulations about accountability, played straight. You rig an election on
Mudwick Isle, a fictional goblin island, by turning up attacks and turning down safeguards, press Start, and watch
one election cycle play out on a grid of polling places. The headline answers three questions: **did the result
flip, was it caught, and at which layer**. The forensic tests are real published methods, and the same tests run on
any CSV of units and counts, so the toy doubles as a working tool for spotting suspicious patterns in any system.

The in-world framing: Mudwick has not held an election since Parliament closed, and GoblinLife Labs built the
simulator for the Council of Elders to find out what holding one would involve.

## Owner decisions (2026-11-13)

| Topic | Decision |
|---|---|
| Stack | Vite + React SPA in its own repo, like the original GoblinBench. Base path `/democracy/` from the start. |
| Engine | Pure TypeScript (`engine/`), no DOM, run in a Web Worker. Tests cover the invariants. |
| Attacks vs safeguards | Separate slider groups. Attacks: ballot stuffing, impersonation, mail-ballot harvesting, tabulator tampering, canvass collusion, refusal to certify. Safeguards: paper ballots, sign-in reconciliation, mixed-faction staffing, observers, audit sample rate, recount trigger, courts. |
| Insular nodes | A number: each polling place's oversight score counts the independent parties present. Score 1 = insular. |
| Conspirators | Every corrupted layer adds people; each has a chance of leaking. |
| Headline | Did it flip, was it caught, where. Plus a generated one-line headline for the result card. |
| False positive | A clean election that looks guilty ships as a preset. |
| Forensics | Published methods only, cited on an "About the model" page. |
| Audits | Risk-limiting audit math shown: ballots needed against the margin. |
| CSV | Upload or paste any table of units and counts; same tests; nothing leaves the browser. |
| Reproducibility | Seeded randomness; the config and seed live in the URL hash. |
| Monte Carlo | Many runs give the probability of flipping and of detection, and each test's false-alarm rate. |
| Framing | Goblin universe only: Mudwick Isle precincts, Council candidates, no real parties, no red-versus-blue colours. Screenshots and the result card must read as fiction on their own. |
| History presets | Labelled "Historical pattern": a one-party city machine, the 2018 North Carolina absentee scheme, paperless machines with no audit, a close race with a strong audit. |

## Epics and stories

### Epic 1: Engine — ✅ Completed (v0.1)

#### Story 1.1: Seeded world — ✅ Completed
`engine/world.ts`, `engine/rng.ts`. An island-shaped grid (S/M/L/XL, about 50 to 350 polling places), six species
with enclaves (Goblins, Gnomes, Trolls, Pixies, Dwarves, Leafies), a spatial voting model (each species votes for
the candidate nearest its views on two axes, with local swings), mail voting, deadwood on the rolls, counting houses
by k-means. Every draw comes from a named stream, so attacks never change the honest voters underneath.
- AC: same seed, same island and votes; attacks leave `honest` unchanged (test).

#### Story 1.2: Staffing and oversight — ✅ Completed
Three poll roles per polling place, held by the local majority faction, or the ruling faction under **patronage**,
or mixed under **mixed staffing**. Observers, paper and reconciliation per polling place from the safeguard sliders.
Oversight score = distinct staff factions + 1 for an observer. Canvass boards per counting house follow the same rule.

#### Story 1.3: Attacks, safeguards, conspirators — ✅ Completed
`engine/election.ts`. Eight phases: rolls and staffing, mail voting, election day, count, canvass, audit and recount,
certification, aftermath. Attackers target the safest polling places and counting houses first. Recruiting someone
from another faction usually fails and reports the attempt. Leak rates: insiders 3%, paid hands 5 to 6%, recruits
from other factions 25% (illustrative; stated on the About page).
- AC: zero attacks returns the honest result precinct by precinct (test).
- AC: ballots equal voters in every precinct unless stuffing, tabulator or canvass attacks act there (test).

#### Story 1.4: Forensics — ✅ Completed
`engine/forensics.ts`, generic over a `Table` of units. Ballots against voters, turnout against vote share
(Klimek), last digits (Beber and Scacco), whole-number percentages (Kobak et al.), outliers against neighbours,
mail-ballot anomalies, jumps between counting houses, second-digit Benford (marked contested). Outlier thresholds
(`TUNING`) were calibrated so the honest default election fails each test about 1 run in 100.

#### Story 1.5: Audit math — ✅ Completed
`engine/audit.ts`. BRAVO ballot-polling audit, fixed-rate or sample-until-confident; escalation to a full hand count;
Wald approximation of the average sample number. AC: halving the margin needs about four times the ballots (test).

#### Story 1.6: Monte Carlo — ✅ Completed
`engine/montecarlo.ts`. Each run is paired with the same island with attacks off. Reports P(flip), P(caught),
P(caught | flip), P(flip and never caught), where it was caught, crew size against chance of being caught, and
each test's fail rate on rigged and clean runs.

#### Story 1.7: Links and CSV — ✅ Completed
`engine/config.ts`, `engine/csv.ts`. Base64url JSON config in the hash, clamped on read. CSV import (header row,
`unit` plus two or more count columns; optional `registered`, `voters`, `eligible`, `x`, `y`, `node`,
`mail:<option>`, `mail_sent`, `mail_returned`) and export of a simulated election in the same format.
- AC: config round-trips; garbage is rejected; an exported election re-imports with the same test results (tests).

### Epic 2: Interface — ✅ Completed (v0.1)

- **Simulate tab** (`src/App.tsx`): presets, attack and safeguard sliders, ballot editor, population, seed. Start
  animates the eight phases; Skip jumps to the end; after the first run, slider changes update live.
- **Map** (`src/components/IsleMap.tsx`): Reported, Honest, Tampering (only the simulator sees it), Oversight
  (score per tile, insular ones dashed), Turnout, Flags. Counting-house borders and coastline drawn; "MUDWICK ISLE"
  lettering on the sea so a screenshot reads as fiction.
- **Verdict** (`Verdict.tsx`): the three answers, the headline, honest / counted / certified bars, conspirators and
  the chance nobody talks.
- **Forensics** (`Forensics.tsx`): test cards, turnout-versus-share scatter, digit charts.
- **Audit math** (`AuditPanel.tsx`): ballots needed against margin on log scales, with this election marked.
- **Result card** (`ResultCard.ts`): 1200x630 PNG with the headline, the three answers, the island and a footer
  that says Mudwick Isle is fictional.
- **Monte Carlo tab**, **Your data tab** (runs in the browser, says so), **About the model** with sources.
- Palette: violet, aqua, yellow, magenta, green (validated for colour-blind separation in both themes); no red
  against blue. Light and dark follow the site's `gl_color_scheme` cookie, else the device.

### Epic 3: Hosting on www — 🔄 In Progress
- Site monorepo: submodule at `packages/democracy`; `apps/www/scripts/build-democracy.mjs` builds it into
  `apps/www/public/democracy` before `next build`; rewrite `/democracy` to the built `index.html`.
- Squash-merge site changes that only bump the submodule with `Deploy-Apps: www`.
- AC: `www.goblinlife.org/democracy` loads, the worker loads from `/democracy/assets/`, deep links with `#c=` replay.

### Epic 4: Later (not built)
- A real OG image per link (needs a server; the PNG card covers sharing for now).
- GNN tie-in: each result card headline as a GNN story stub.
- A labs page entry and a lore registry row (`tech:` entry) through the lore room.
- A "your system" preset gallery for non-election CSVs (expenses, stock counts).

## Testing
`pnpm test` (vitest, `engine/**/*.test.ts`), `pnpm lint` (tsc), `pnpm build`.
