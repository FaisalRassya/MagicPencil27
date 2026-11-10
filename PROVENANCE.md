# Provenance / third-party code audit

Audit date: November 2026. Scope: everything that ships in the packaged app (repo root minus `research/`, `probe*`, `test_*`, `hook/test`, `hook/live`).

## Relationship to barak14/fm-editor (GPL-3)

fm-editor is a Rust/egui editor licensed under GPL-3. Our app is a separate JavaScript/Electron codebase. During development we read fm-editor's public files (`docs/fm27/memory-layout.md`, `src/fields/fm27/*.rs`, `ratings.rs`, `best_xi.rs`) to learn where FM27 keeps its data.

| What | Status | Notes |
|---|---|---|
| Memory offsets (e.g. player CA at +0x264, contract at +0x330, club budget +0x7C4) | **Facts, kept** | Numeric descriptions of FM27's memory layout. Each one was verified live against FM27 (Steam + Game Pass, README v14). Facts are not copyrightable; we still credit the project as a source. |
| Field names / labels (e.g. "Finishing", "Judging Player Ability") | Kept | These are Football Manager's own attribute names, not fm-editor's expression. |
| Attribute byte encoding, date encoding (day-of-year + year) | Kept | Facts about FM27's storage format, re-verified with our own write/read tests. |
| Position rating weights (`POS_WEIGHTS`, from `ratings.rs`) | **Replaced** | Rewritten as our own model (`POS_PROFILE` in `public/extras2.js`): different attribute sets per position, 5/3/1 tiers, different averaging. |
| PA projection (Genie-style tiers from `ratings.rs`) | **Replaced** | New model: CA headroom spread over the attributes of the player's best position, physical growth reduced by age. |
| Best XI assignment (Hungarian algorithm, shape followed `best_xi.rs`) | **Replaced** | New exact dynamic program over filled-slot bitmasks. Tested on 300 random squads: same optimal total as the old solver. |
| Formation slot coordinates (`best_xi.rs` slot x/y) | **Replaced** | New pitch grid. |
| Rust source code | Never used | Nothing was translated line by line, except the three items above, which are now gone. |


Everything else in the app is our own work: the RTTI address resolver, the koffi memory backend, the UI, the tactics advisor, the training planner, the in-game hook (`hook/fmhook.c`), the interop decoder, the tactic and Tactical-Effectiveness readers, the transfer advisor and the contract page. Discovered with our own tools: the IL2CPP dump of the user's own game copy, memory diffs, and recordings of the game's own UI events.

## Other third-party components (permissive licences, attribution required)

| Component | Licence | Where |
|---|---|---|
| Electron | MIT | runtime |
| Node.js / Chromium (inside Electron) | MIT / BSD and others | runtime |
| express | MIT | `node_modules` |
| koffi | MIT | `node_modules` |
| MinHook (Tsuda Kageyu) | BSD-2-Clause | compiled into `hook/fmhook.dll` |
| Barlow Semi Condensed, IBM Plex Sans | SIL OFL 1.1 | `public/fonts` |

None of these force the app to be open source. Their licence texts must ship with the app (`THIRD_PARTY_LICENSES.txt`, next release task).

## Game data

- The app ships no files from Football Manager.
- `hook/tactic_options.json` holds the numeric IDs of FM's tactic option enum, read from the user's own installation. It is interoperability data, not game content.
- The IL2CPP dump, `dump.cs`, metadata and saves stay outside the distributed package.

## Remaining caution

This audit is a good-faith engineering review, not legal advice. Before selling:

1. Keep the credit line for the offset source.
2. Optionally ask the fm-editor author for a quick written OK.
3. Don't publish the `research/` folder.
