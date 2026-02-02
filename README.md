# Generative Video Utilities

A collection of focused utilities for generative video workflows (conversion, sequencing, prompt prep, metadata, and repeatable transforms). This repo is intentionally **utility-first**: small, sharp tools with clear inputs/outputs and strong regression coverage.

## Repository Layout

- `src/` — Implementation (one primary file per utility).
- `tests/` — Unit + integration tests.
- `tests/sanity/` — Golden fixtures that encode user-visible behavior.
- `docs/` — Design notes, heuristics, and decisions.
- `scripts/` — Thin CLI wrappers.

## How to Add a New Utility

1. Create `src/<utility_name>.<ext>` as the primary module.
2. Add a matching `tests/<utility_name>.test.<ext>`.
3. Add a `tests/sanity/` fixture if the utility has end-to-end behavior.
4. Document behavior in the **Heuristic Rule Index** below.

## Testing

Define a single canonical test command for this repo and keep it here.

Example (update once real tests exist):
```bash
# TODO: replace with the real command
./run_tests.sh
```

## Heuristic Rule Index

This is the behavioral contract for the repo. Every behavior change must:
- update this list, and
- add/adjust matching fixtures in `tests/sanity/`.

1. **Repo bootstrap** — `bootstrap`  
   Initial structure, deterministic defaults, and no side effects on import.

2. **Utility contract** — `utility_contract`  
   Each utility defines explicit inputs/outputs, validates arguments, and provides deterministic results with seeded randomness where applicable.

3. **Sanity fixtures required** — `sanity_fixtures_required`  
   User-visible behavior is covered by golden fixtures; tests must fail if behavior changes without updates.

4. **Heuristics stay in sync** — `heuristics_sync`  
   README heuristics and sanity fixtures are updated together; changes without both are incomplete.

## Conventions

- Prefer pure functions for transforms and keep IO in thin wrappers.
- Expose seeds, config, and defaults in a single place per utility.
- Use clear, small diffs and update docs/tests alongside code.
