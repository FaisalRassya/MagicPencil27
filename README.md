# MagicPencil27

**Free, open-source, unofficial real-time editor and assistant for Football Manager 27 (PC).**

MagicPencil27 reads and edits a running FM27 game. Alongside the usual editor features, it can plan your training around the tactic you actually use, read your Tactical Effectiveness, suggest transfers for your squad's weak spots and add them to your FM shortlist.

> MagicPencil27 is a fan project. It is **not affiliated with, endorsed by or connected to SEGA or Sports Interactive**. "Football Manager" is a trademark of SEGA / Sports Interactive.

## Features

**Editor**
- Search players, clubs, staff, managers, officials, competitions, nations and stadiums.
- Edit attributes, CA/PA, positions, personality, contracts, names and club finances.
- Pending changes → **Save Changes**, plus Edit History with **Undo**.
- Bulk edit, templates, freeze (lock values), Clone Center.
- Heal injuries and lift bans.
- My Club, Best XI and player pages.

**Assistant**
- **Tactic advisor**: suggests a formation, style, roles and team instructions based on your squad's attributes.
- **Read your FM tactic and Tactical Effectiveness**: open the Tactics screen in FM and the editor reads exactly what you set.
- **Training planner**: builds weeks of training around your tactic and fixtures. **Pasang ke FM** writes the schedule straight into FM's training calendar.
- **Saran transfer (transfer advisor)**: finds the weakest positions for your tactic and searches the whole database for realistic targets within your budget. **+ Shortlist** adds them to your shortlist in FM.
- **Kontrak (contracts)**: lists every contract by expiry, suggests renew or let go, and extends contracts in one click.

The interface is currently in **Indonesian**. Translations are welcome.

## Requirements

- Windows 10/11 64-bit.
- Football Manager 27 from **Steam** or **PC Game Pass / Xbox app**. Pirated copies are not supported.
- FM must be running with a save loaded.

## Install (release build)

1. Download the latest zip from [Releases](https://github.com/FaisalRassya/MagicPencil27/releases).
2. Extract it anywhere and run `MagicPencil27.exe`. No installer or admin rights are needed.
3. Start FM27, load your save, then click **Load Data** in MagicPencil27.

Windows SmartScreen may warn about an unsigned app: click *More info → Run anyway*. Some antivirus programs flag `fmhook.dll` (see below). You can build it yourself from source if you prefer.

## Important

- **Back up your save** before editing. Changes are written to the running game. Saving in FM makes them permanent.
- **Single-player only.** Do not use it in online or shared careers.
- **The in-game hook.** "Pasang ke FM", reading the tactic and Tactical Effectiveness, and the shortlist button load a small DLL (`hook/fmhook.dll`) into FM. That DLL sends the same UI actions you would click yourself. Everything else only reads and writes memory. The hook disappears when FM closes.
- Some features learn save-specific data the first time you use them. Before you use "Pasang ke FM", click any training session in FM and press Cancel. Before you use the shortlist button, add one player to a shortlist by hand.
- After an FM patch, the reading features usually keep working (addresses are resolved at runtime). If something breaks, open an issue and attach `%LOCALAPPDATA%\MagicPencil27\hook\fmhook.log`.
- Tested mainly on the Game Pass build. **Steam reports are very welcome.**

## Build from source

```bat
git clone https://github.com/FaisalRassya/MagicPencil27.git
cd MagicPencil27
npm install
npm start            :: run in development
```

The hook DLL is built separately, with [zig](https://ziglang.org/download/) as the C compiler and [MinHook](https://github.com/TsudaKageyu/minhook):

```bat
set ZIG=C:\tools\zig\zig.exe
set MINHOOK=C:\src\minhook
npm run build:hook   :: -> hook\fmhook.dll
npm run build        :: -> dist\MagicPencil27-win32-x64\MagicPencil27.exe
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the project is organised and how to update it after FM patches.

## How it works (short version)

- `native.js` reads and writes FM's memory through Windows APIs (via [koffi](https://koffi.dev)). Data addresses are found through RTTI and pattern scans, so the same code supports Steam and Game Pass.
- `agent*.js` contain the data-structure knowledge (players, clubs, staff, contracts…).
- `hook/fmhook.c` is a small MinHook DLL. It runs commands inside FM's main thread and logs the native↔UI interop traffic, which is how the tactic and Tactical Effectiveness are read and how training and shortlist actions are replayed.
- `public/` is the UI, served to the Electron window by `server.js`.

The full development story is in [docs/research-log.md](docs/research-log.md).

## Credits

- Memory-layout facts were cross-checked against the public notes of [barak14/fm-editor](https://github.com/barak14/fm-editor). No code from that project is used. See [PROVENANCE.md](PROVENANCE.md).
- [MinHook](https://github.com/TsudaKageyu/minhook) by Tsuda Kageyu.
- Electron, express and koffi; Barlow Semi Condensed and IBM Plex Sans fonts. See [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt).

## License

MagicPencil27 is free software, released under the **GNU General Public License v3.0 or later** ([LICENSE](LICENSE)). You may use, study, share and modify it. If you distribute a modified version, it must stay under the GPL with its source code available.

This program comes with ABSOLUTELY NO WARRANTY. You use it at your own risk.
