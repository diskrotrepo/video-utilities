# AGENTS.md — Generative Video Utilities

> **Purpose**: Baseline operating guidance for this repo. It defines conventions, quality gates, and the documentation/testing loop so changes stay consistent over time.

## Core Principles

- **Single source of truth**: This file is the canonical operational guide. If it conflicts with other docs, default here and update the docs afterward.
- **Living spec**: Treat this as a changelog for process. When we learn something, we write it down.
- **Functional core, imperative shell**: Keep domain logic pure; isolate IO/CLI/UI/FFmpeg calls in thin adapters.
- **Determinism first**: Seed randomness and expose seed inputs for reproducible outputs.
- **Small, safe diffs**: Prefer incremental changes with tests and clear intent.

## Repo Structure (Default)

- `src/` — Implementation (prefer one primary file per utility).
- `tests/` — Tests mirror `src/` layout; add regression cases for every bug.
- `tests/sanity/` — Golden or snapshot fixtures for end-to-end behavior.
- `docs/` — Design notes, heuristics, and rationale (when needed).
- `scripts/` — CLI wrappers or tool runners (thin and well-documented).

## Monolithic Utility Pattern

- Each utility should have a **single primary module** (e.g., `src/<utility>.py` or `src/<utility>.js`).
- Organize the file with section headers and a mini TOC so it is scan-friendly.
- **No side effects on import**. All IO happens inside explicit entrypoints.

## Heuristics + Regression Loop (Mandatory)

- The README contains a **Heuristic Rule Index** that describes behavior in human terms.
- **Every behavior change** must update the README index **and** add/adjust a matching sanity fixture in `tests/sanity/`.
- Treat heuristics as living specs, not afterthoughts.

## Testing Doctrine

- Every change must add or update regression tests.
- Bug fixes require a failing test first, then the fix.
- The canonical test command is defined in the README. Always run it when code changes.

## 50% Rule (Project Operationalized)

For any substantive change, spend **at least half** of the diff/effort on:
- Tests
- Documentation/clarification
- Maintainability improvements (refactors, invariants, determinism)

## LLM Collaboration Rules

- Use **multiple documentation angles** for important changes: section summaries, function-purpose comments, and short inline notes where needed.
- Keep AGENTS.md and README aligned with the current structure and behaviors.
- Prefer explicit examples over vague descriptions.
