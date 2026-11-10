# Research log

Development notes, kept for people who fork the project or need to update it after an FM patch. Older entries describe approaches that were later replaced.


Personal real-time save editor for Football Manager 27 — a browser-based GUI
(like FM Live Editor) plus a CLI, both built on Frida. Edit player
attributes, CA/PA, and club finances (transfer/wage budget, balance)
directly in the running game.

Offsets and the attribute-encoding formula come from the open-source GPL-3
project [barak14/fm-editor](https://github.com/barak14/fm-editor), verified
live against this FM27 Steam build.

## Requirements

- Node.js (any recent version)
- Football Manager 27 (Steam build) running with a save loaded
- Windows

## Setup (one-time)

```
cd tool
npm install
npm install-scripts approve frida@17.25.0
npm rebuild frida
```

## Using the GUI (recommended — easiest way)

```
node server.js
```

Then open **http://localhost:4727** in your browser. Leave the terminal
window open while you use it (it holds the connection to FM27). The page:

- **Players tab**: type a name or UID, click a result, every attribute
  (Technical / Set Pieces / Mental / Physical / Goalkeeping / Footedness /
  Hidden), CA and PA are shown as editable boxes. Change a number and
  click elsewhere (or press Enter) — it saves instantly, and the box
  flashes green when it does.
- **Clubs tab**: type a club name, click a result, edit Balance, Transfer
  Budget, Wage Budget, Youth Grant the same way. If a club shows a warning
  instead of numbers, it doesn't have FM27's "full finance" data (true for
  most clubs below the top ~885 in the world — only major European sides
  like Man City or Arsenal reliably have it).

To run the server in the background on Windows so it keeps running without
a visible window:
```
powershell -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '<this folder>' -WindowStyle Hidden"
```

## Using the CLI (scripting / automation)

```
# Find a player
node fm-editor.js player find-uid 61094101
node fm-editor.js player find-name "Alex Lowry"

# Show everything about a player (all attributes, CA/PA, morale)
node fm-editor.js player show 0x12560dd3110

# Edit one attribute (1-20 scale) or CA/PA (1-200 scale)
node fm-editor.js player set 0x12560dd3110 finishing 18
node fm-editor.js player set 0x12560dd3110 ca 150
node fm-editor.js player set 0x12560dd3110 pa 170

# Clubs
node fm-editor.js club find-name "Man City"
node fm-editor.js club show 0x127dd9987e0
node fm-editor.js club set 0x127dd9987e0 transferBudget 100000000
node fm-editor.js club set 0x127dd9987e0 wageBudget 10000000
node fm-editor.js club set 0x127dd9987e0 balance 500000000
```

Addresses change every time you relaunch FM27 (ASLR) — always `find-uid` /
`find-name` first in a session, then reuse that address for `show`/`set`
calls in the same session. The GUI handles this automatically (search ->
click -> edit); only the CLI needs you to pass addresses around manually.

## Supported player fields (`set` / shown by `show`)

All of: `crossing dribbling finishing heading long_shots marking passing
tackling technique first_touch corners free_kicks long_throws
penalty_taking aggression anticipation bravery composure concentration
decisions flair leadership off_the_ball positioning teamwork vision
work_rate determination acceleration agility balance jumping_reach
natural_fitness pace stamina strength handling aerial_reach command_of_area
communication kicking throwing one_on_ones reflexes eccentricity
rushing_out punching left_foot right_foot consistency injury_proneness
important_matches dirtiness versatility` — plus `ca` and `pa`.

## Supported club finance fields

`balance`, `transferBudget`, `wageBudget`, `youthGrant` — **only works for
clubs with the "full finance" object** (roughly the 885 biggest clubs
worldwide, e.g. Man City, Arsenal — NOT every league's top side, e.g.
Rangers/Celtic/Motherwell in a Scottish save do not have it). `club show`
tells you `hasFullFinance: true/false`; `club set` refuses to write to a
club without it rather than corrupting unrelated data.

## Important caveats

- **Back up your save before editing.** This writes directly into FM's
  process memory. A write only becomes permanent once you save the game in
  FM.
- **FM caches a profile once you've viewed it.** If you've already opened a
  player/club screen in FM this session, edits won't show on that screen
  until you advance one in-game day (Calendar > Go On Holiday) or FM
  reloads it some other way. The underlying data (and a save made after
  the edit) is correct immediately regardless.
- Use on **offline, single-player saves only**.
- If `player set`/`club set` reports success but FM doesn't reflect it
  after a day passes, double check you used the right address from the
  same FM session (addresses are not stable across game restarts).

## How it works / extending it

- `agent.js` is the Frida script injected into `fm.exe`. It finds the
  player/club arrays at fixed addresses inside `game_plugin.dll` (no
  scanning needed), walks them, and exposes `rpc.exports` functions.
- `fm-editor.js` is the Node CLI that attaches Frida to `fm.exe` and calls
  those functions.
- To add more fields (contracts, positions, traits, staff, stadiums...),
  read `../README.md` (the full research notes) and the downloaded
  `../  ../re-tools/fm-editor-*.rs` source files from barak14/fm-editor —
  they document dozens more fields (contract wage/expiry, squad number,
  nationality, injuries, name editing, staff attributes, stadium capacity,
  etc.) with the exact same offset/encoding pattern used here.

### v0.1.1 — FM27 patch 0.9.2435 (Game Pass)
- Player vector moved to RVA 0x53b7de0 (delta -0x34b9f0 from the Steam baseline), outside the old ±1 MB search window, and its first element is now an `ACTUAL_PLAYER_AND_NON_PLAYER` (player-coach). `agent.js` now accepts both classes and, if the nearby search fails, scans the whole module image and picks the player vector whose club vector sits at the baseline's relative slot (+0x1B8). `native.js` gained `readByteArray`. Load takes about 12 s. Players 72,426, clubs 26,217. Player/club/contract offsets unchanged (verified on Haaland and Wycombe).
- `GameReceiver.SendDataResponse` changed from `(Span<ulong> keys, Span<byte> items)` to `(Span<ulong> keys, Span<uint> sizes, Span<byte> items)`, and `items` now starts with a u32 item count. fmhook v6 logs each method's parameter types when the signature differs, hooks the 3-parameter form, strips the count prefix and logs sizes on a separate `RESPSZ` line, so the `RESP` log format is unchanged for the readers. `SendEvent` is unchanged.
- research/vecscan.js: whole-image vector scanner used to find the new layout.
