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

## Usage (Video Splicer)

1. Open `src/index.html` in a modern browser.
2. Load a base video.
3. Scrub to the frame you want and click **Capture Bookmark** (this stores a cut point).
4. Select the bookmark you want to splice to, then upload the next clip to replace the tail.
5. Repeat steps 3–4 as needed, then export the stitched result.

## Testing

Run the test suite with:
```bash
npm test
```

## Heuristic Rule Index

This is the behavioral contract for the repo. Every behavior change must:
- update this list, and
- add/adjust matching fixtures in `tests/sanity/`.

1. **Frame/time mapping** — `frame_time_mapping`  
   Frame index conversion respects the configured FPS and round-trips frame → time → frame.

2. **Splice replaces tail** — `splice_replaces_tail`  
   A replacement clip keeps everything before the cut and drops everything after it.

3. **Splice at start** — `splice_at_start`  
   Cutting at 0 replaces the entire timeline with the new clip.

4. **Splice at end appends** — `splice_at_end_appends`  
   Cutting at the end keeps the full original and appends the replacement clip.

5. **Composite time resolution** — `find_segment_at_time`  
   Composite time resolves to the correct segment, local time, and segment offset.

6. **Timeline duration math** — `timeline_duration`  
   Total duration equals the sum of trimmed segment lengths.

7. **Export settings** — `export_settings`  
   Export format selection resolves to a stable MIME type/base type and uses `.webm` outputs.

8. **Recording audio settings** — `recording_settings`  
   Recording preserves audio tracks while muting playback volume during capture.

9. **Bookmark creation** — `bookmark_create`  
   Capturing a frame stores a bookmark with time + frame index and a preview image.

10. **Bookmark selection** — `bookmark_resolve`  
   The selected bookmark resolves to a concrete cut time for splicing.

## Conventions

- Prefer pure functions for transforms and keep IO in thin wrappers.
- Expose seeds, config, and defaults in a single place per utility.
- Use clear, small diffs and update docs/tests alongside code.
