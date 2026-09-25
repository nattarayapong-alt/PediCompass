# PediCompass tests

Zero dependencies — only Node.js. Run from the repo root:

    node tests/run.js

| Suite | What it checks |
|---|---|
| structure | `<div>` balance, CSS brace balance, JS syntax |
| drug-schema | DRUG_DB: unknown keys, caps the calculator ignores, bad `[lo, hi]` ranges, bad `freq`, broken `regimenIdx` in Newborn/renal groups, orphan formulations/tablets, missing th/en |
| drug-sweep | Every regimen × weights (0.8–120 kg) × TH/EN × every liquid/tablet form: no crash, no NaN / undefined / Infinity in output |
| dose-snapshot | Every computed dose (drug module + anaphylaxis/asthma helpers) vs `tests/dose-snapshot.txt` |

## When a dose changes on purpose
The snapshot test fails and prints the old and new lines. Check them, then accept:

    node tests/run.js --update-snapshot

Commit `tests/dose-snapshot.txt` together with the change.

## One-time setup (block pushes that fail tests)

    git config core.hooksPath .githooks

`!` lines are warnings (shown, never block).
