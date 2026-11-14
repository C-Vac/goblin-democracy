# Mudwick Isle Election Fraud Simulator: Agile Specification

> **Status:** 🔄 In Progress. v0.1 built 2026-11-13; v0.2 (the real Mudwick map) 2026-11-14; hosting at
> www.goblinlife.org/democracy waits on the site PR.
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
| Off-map voters, gerrymandering, parties (2026-11-14) | Blocks drawn whole across zone borders. An Abroad district (goblin dual citizens, all mail) bottom left with an arrow off the map; a Dwarven alien voters district on the right with an arrow in (lawful resident voters, not a fraud vector). A gerrymandering attack whose reach sets how far the commission redraws. Party colours: Council purple, Gallery green, Independent orange (plus two minor parties); zones tinted by district winner and patterned by canvass board (stripes one faction, dots mixed, zigzag colluded). Candidate types: incumbent, Council-aligned, reformer, radical, protest. |
| The real map (2026-11-14) | The island is the GoblinLife.org Mudwick map with the map room's districts drawn over it. Polling places sit on a grid over the districts; each district is a counting house. Who lives where follows the lore. |

## Epics and stories

### Epic 1: Engine — ✅ Completed (v0.1)

#### Story 1.1: Seeded world on the real map — ✅ Completed (2026-11-14)
`engine/world.ts`, `engine/mudwick.ts`, `engine/mudwickDistricts.ts`, `engine/mudwickMask.ts`, `engine/rng.ts`. The
painted map is never committed (owner 2026-11-14: "have it fetch the map from cdn at a static address, which we can push
updated maps to in the future, with caching and cachebusting, instead of committing the map to the repo"). The page
fetches `https://cdn.goblinlife.org/site/map/manifest.json` (short cache) and takes the content-hashed image it names
under `base["2048"]` (immutable), in `src/mapArt.ts`; `VITE_MAP_MANIFEST` overrides the address. Until the art loads, or
if it can't (the CDN is empty until the owner calls the map finished), the isle is drawn from the land mask with a
parchment panel for the lettering; in development a gitignored local copy (`public/map-local/mudwick.webp`, cut by
`scripts/bake-map.mjs`) stands in. The result card draws the same art (CORS). The land mask was cut once from the frozen base layer and holds across bakes. Polling places
are a square grid over the map, kept where the centre lies in a district and the cell is mostly land. The 16 districts
are the map room's draft (`~/rooms/map/plan/districts-draft.json`, synced into `engine/mudwickDistricts.ts` by
`scripts/sync-districts.mjs`): whole blocks of the street grid, one piece each, meeting along streets, never
overlapping; bare mountain blocks belong to none. Names and edges ✅ signed off by the owner 2026-11-14 ("sign off the
districts as drawn"); the dwelling counts are from bake v43.
Each district has a species affinity from published lore
(pixies in Pixie Village, gnomes in the Revenue District, trolls in the Low Marsh and Docks, dwarves in the Works, Leafies on
Broadcast Hill and Southside), blurred across district lines (`SPREAD` 7% of the map width) so honest borders don't look
like tampering; the Enclaves slider sets how strongly species keep to their districts. Electorate per polling place
follows district density (Uptown and the Press dense, Gunner's Head empty). Spatial voting model (each species votes for
the candidate nearest its views on two axes, with local swings), mail voting, deadwood on the rolls. Every draw comes
from a named stream, so attacks never change the honest voters underneath.
- AC: same seed, same island and votes; attacks leave `honest` unchanged (test).
- AC: every polling place is on land inside its own district at every size; every district has one; each district is
  its own counting house (tests).
- New districts: `node scripts/sync-districts.mjs ~/rooms/map/plan/districts-draft.json`, then rerun the calibration
  below; the "preset stories" tests say which presets need a new seed. A new map needs nothing here: the map room pushes
  it to the CDN. Local dev copy: `SHARP_FROM=~/rooms/lore/engine/x.mjs IMAGE_ONLY=1 node scripts/bake-map.mjs <bake.jpg> vNN`.
- AC: no map image in the repo; an unreachable manifest shows the land-mask map, never a broken image (checked in a
  browser 2026-11-14 against a mock CDN: CDN art, CDN down, result card).

#### Story 1.1a: Polling places follow people — ✅ Completed (2026-11-14); figures 🔄 pending canon
Owner 2026-11-14: Pixie Village and Gunner's Head had far too many polling places; almost nobody lives there. Each district
now has a resident count (`population` in `engine/mudwick.ts`) and gets polling places in proportion to it (about
80/150/260/440 places in all for S/M/L/XL, at least one per district, capped by its cells), kept on the cells with the
most dwellings nearby (the map room's per-block `settled` counts, synced with the outlines; Gaussian pull, σ 2.5% of the
map width), else nearest the district's label. Electorate per place = 80% of residents / places. The counts are **working figures, not
canon**: canon has no census of Mudwick, and the lore room owns that. Proposed (residents):

| District | Residents | Why |
|---|---:|---|
| Press Quarter | 42,000 | crowded centre, tallest and densest |
| Southside | 26,000 | terraces and allotments |
| Midtown | 24,000 | town houses |
| The Backstreets | 18,000 | shacks, crowded and crooked |
| Uptown | 15,000 | six blocks of towers |
| Abroad | 12,000 | dual citizens registered to vote from elsewhere |
| The Strip | 9,000 | more visitors than residents |
| The Works | 8,000 | sheds and yards |
| Campus Mesa | 7,000 | mostly students |
| Revenue District | 6,000 | three blocks of gnomes |
| The Docks | 5,000 | warehouses |
| Fort Cope | 4,000 | the garrison |
| Dwarven alien voters | 4,000 | dwarves from Over There on the rolls |
| Broadcast Hill | 3,500 | cottages and small farms |
| Naval Station Grungle Bay | 2,500 | sailors |
| The Low Marsh | 1,200 | stilt houses |
| Pixie Village | 600 | a few mushroom houses |
| Gunner's Head | 300 | mostly empty on purpose |
| **On the isle** | **~172,000** | |

When the lore room settles real numbers, change `population` and re-run the calibration and preset checks.

#### Story 1.1b: Off-map districts — ✅ Completed (2026-11-14)
`engine/mudwick.ts` (`offMap`, `mailOnly`, `turnoutShift`). **Abroad** (sea box, bottom left, arrow off the map): goblin dual
citizens, every ballot by post, return rate 0.7, turnout −12 points, out of harvesters' reach. **Dwarven alien voters**
(mountain box, right edge, arrow in from Over There through Gimlet's Bore): dwarves voting as lawful residents. Both keep
their composition whatever the Enclaves slider says, are skipped by the land mask and the blur, and can't be redrawn.
The mail test compares overseas units within their own stratum (`Unit.stratum`), as analysts do.

#### Story 1.1c: Parties and candidate types — ✅ Completed (2026-11-14)
`engine/catalog.ts` (`PARTIES`, `CANDIDATE_TYPES`), `engine/world.ts` (`typeLift`). Each candidate has a party (sets the
colour: Council purple, Gallery green, Independent orange, minor parties magenta and sky; validated for colour-blind
separation in both themes) and a type: incumbent (+0.3 everywhere; their faction gets the patronage posts), Council-aligned
(+0.25 x Council loyalty among loyal species), reformer (the mirror), radical (local swings 2.2x, −0.05), protest (−0.6,
swings 1.3x). The Chair race has no incumbent: Mudwick has not voted since Parliament closed. Win rule: most votes, or
most districts (`Config.rule`); results carry districts won (`Tally.seats`).

#### Story 1.1d: Gerrymandering — ✅ Completed (2026-11-14)
`engine/gerrymander.ts`. A boundary commission (the favoured faction plus two seats that mixed staffing may give the
other side; refusal = caught at the commission) moves border polling places between neighbouring on-map districts (the same
eight-way neighbours the forensic tests use, so the map test weighs the moves the commission weighed),
greedily maximising the favoured candidate's expected districts on last election's numbers (honest vote ±6%), keeping
every district in one piece; the slider sets the move budget (up to 40% of polling places). Moved places are tampered
with `gerrymander`; audits can't undo it. Evidence (a leak, or the map test failing) goes to court; a court that strikes the
map tallies the count on the old lines. Forensic test `map-outlier` (Chikina, Frieze and Pegden 2017 random-walk outlier
test: 20,000 steps, each district held within ±15% of its size as real uses hold districts near equal population, each
candidate's expected districts scored in turn with Bonferroni over candidates, p ≤ √(2ε)·C) with the efficiency gap shown
for reference. Without the size band the walk drifts to big districts eating small ones and 21% of honest maps failed.
Measured on draft 2.1 (size M, 120 runs; before per-block dwellings): honest maps fail under 1%; at full reach gerrymanders fail 21% and warn another
26%, at half reach 17% and 10%.
- AC: ballots and honest totals unchanged; off-map districts never move; gains ≥ 1.5 districts on average; a popular-vote
  result never flips (tests).

#### Story 1.2: Staffing and oversight — ✅ Completed
Three poll roles per polling place, held by the local majority faction, or the ruling faction under **patronage**,
or mixed under **mixed staffing**. Observers, paper and reconciliation per polling place from the safeguard sliders.
Oversight score = distinct staff factions + 1 for an observer. Canvass boards per district counting house follow the same rule.

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
(`TUNING`) were calibrated so the honest default election fails each test about 1 run in 100. Re-measured on the map room's
districts with per-block dwellings (dc45203), 2026-11-14 (200 clean runs per size, S/M/L): any test failing 1% (S),
2% (M), 2% (L); no single test above 1.5%.

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
- **Map** (`src/components/IsleMap.tsx`): the painted bake with district outlines and names, polling places as
  translucent blocks (drawn whole, across zone borders), zones tinted by their district winner's party and patterned by
  canvass board, the commission's redrawn lines in yellow over the old ones dashed, off-map districts with arrows. A
  Canvass boards view shows the patterns at full strength. Reported, Honest, Tampering (only the simulator sees it), Oversight
  (score per cell, insular ones dashed), Turnout, Flags. "MUDWICK ISLE", the ballot and the seed are lettered on the
  map's cartouche scroll so a screenshot reads as fiction. The art keeps its dark overlay colours in light mode; on a
  phone the map scrolls sideways inside its card.
- **Verdict** (`Verdict.tsx`): the three answers, the headline, honest / counted / certified bars, conspirators and
  the chance nobody talks.
- **Forensics** (`Forensics.tsx`): test cards, turnout-versus-share scatter, digit charts.
- **Audit math** (`AuditPanel.tsx`): ballots needed against margin on log scales, with this election marked.
- **Result card** (`ResultCard.ts`): 1200x630 PNG with the headline, the three answers, the painted map with each
  polling place coloured by its leader, and a footer that says Mudwick Isle is fictional.
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
