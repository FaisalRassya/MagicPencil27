# Contributing to MagicPencil27

Thanks for helping! Bug reports, Steam test results, translations and code are all welcome.

## Reporting a bug

Please include:
- Your FM version and store: Steam or Game Pass. The Game Pass version is shown in the folder name, e.g. `0.9.2409.0`.
- What you clicked, what you expected and what happened, with screenshots if you can.
- For hook features (training, tactic, shortlist): `%LOCALAPPDATA%\MagicPencil27\hook\fmhook.log`.

Never attach save files that contain other people's data, and never share game files.

## Project layout

| Path | What |
|---|---|
| `main.js` | Electron entry: window and the local server |
| `server.js` | Local HTTP API used by the UI |
| `native.js` | Process memory backend (koffi → ReadProcessMemory/WriteProcessMemory) plus a small runtime that runs the `agent*.js` scripts |
| `agent.js` | Address resolution (RTTI and patterns) and player data |
| `agent_entities.js`, `agent_extra*.js`, `agent_medical.js`, `agent_scout.js` | Staff, clubs, competitions, medical, scouting and contracts |
| `hookctl.js` | Injects and controls the hook. Commands go through `cmd.txt` in `%LOCALAPPDATA%\MagicPencil27\hook` |
| `hook/fmhook.c` | The hook DLL (MinHook). It resolves `GameReceiver.SendEvent` / `SendDataResponse` through the IL2CPP API at runtime |
| `hook/tvdecode.js` | Encoder and decoder for FM's interop `TypedValue` / `InteropReference` format |
| `tactic_reader.js`, `te_reader.js` | Read the tactic and Tactical Effectiveness from interop responses |
| `training_apply.js`, `hook/training_builder.js` | Replay training-calendar UI actions |
| `shortlist.js` | Replays "Add to Shortlist" |
| `public/` | UI (plain JS and CSS, no framework) |
| `research/` | Throwaway tools used to find all of the above (memory diff, RTTI scan, recording decoders). Not shipped in builds |
| `docs/research-log.md` | Chronological development notes |

## Ground rules

- **Verify before you write.** Never write memory at an offset that hasn't been confirmed live (write, read back, restore). Unverified features stay read-only.
- **Prefer FM's own actions.** If FM has a UI action for something (training, shortlist…), replaying it through the hook is safer than editing memory.
- **Write your own code.** Don't copy code from other editors or tools, even open-source ones with incompatible licences. Facts such as offsets are fine; credit the source in `PROVENANCE.md`.
- **Don't add game content.** No extracted game files, IL2CPP dumps, database files or SI/SEGA logos.
- Only legitimate copies (Steam, Game Pass) are supported. Please don't open issues about pirated builds.

## After an FM patch

1. Run the app and click **Load Data**. Most addresses are found by scanning, so usually nothing needs changing.
2. If players or clubs don't load, `agent.js` reports which scan failed. The research log describes how each address was found.
3. Hook features use the IL2CPP API and named exports, so they normally survive patches. Interop event IDs live in the game's `InteropEventIDs` / `ActionID` enums. You can regenerate them with an IL2CPP dumper on your own install.

## License

By contributing, you agree that your contributions are licensed under GPL-3.0-or-later.
