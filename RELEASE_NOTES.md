# Spire 0.1.0 — First public release

**Spire** is a cross-platform **Hytale instance launcher** for Windows, macOS, and Linux. Isolated profiles, mods, and worlds — without redistributing the game. You own Hytale through official channels; Spire manages what surrounds it.

> Not affiliated with Hypixel Studios, Riot Games, or Prism Launcher.

## Downloads

| Platform | File | Notes |
| --- | --- | --- |
| **Windows** | `Spire-Setup-0.1.0.exe` | Recommended installer (shortcuts, optional startup) |
| **Windows** | `Spire.0.1.0.exe` | Portable — run from any folder |
| **macOS** | `Spire-0.1.0.dmg` | Drag Spire into Applications |
| **Linux** | `Spire-0.1.0.AppImage` | `chmod +x` then run |
| **Linux** | `Spire-0.1.0.deb` | `sudo dpkg -i …` |
| **Linux** | `Spire-0.1.0.tar.gz` | Extract and run `Spire` |

macOS / Linux installers are built by GitHub Actions when this tag is published; they appear on this release as soon as CI finishes.

## Highlights

### Instances & isolation
- Create, rename, duplicate, delete, and **group** profiles
- Per-instance mods, userdata, prefabs, servers, and logs
- Launch-time isolation checks: `--user-dir` stays under Spire; Mods junction repaired when needed
- Shared client / JRE via `--app-dir` / `--java-exec` (expected)

### Auth & game install
- Official **Hytale** OAuth (device flow), multi-account + game profile selection
- Point at an existing official install, or download / repair clients through Spire
- Release and pre-release channels; optional pinned build

### Mods & content
- **CurseForge**, **Nexus Mods** (`nxm://`), **Thunderstore**, Modtale / Modifold, Modrinth-ready
- Prefabs, world packs, bootstraps, translations
- Local file import + download-folder watch / auto-import
- Rich mod descriptions (Markdown / HTML) and a resizable detail pane

### Worlds
- Adventure / Creative / Flat create presets (+ seed)
- **Apply mod set** to all saves or selected ones

### Share packs
- Export / import **`.spirepack`** (mods + profile; optional world saves)
- Always imports as a new instance

### Privacy & polish
- Local-first: no Spire accounts, no telemetry, optional update JSON check
- Themes, density, grid/list home layout
- Clear CurseForge/Nexus keys or wipe all Spire AppData from Settings
- Branded Windows / macOS installers

## Requirements

- A legitimate **Hytale** install / account for play and official client downloads
- **Node is not required** to run the app — only to build from source (Node 22.12+)

## Install tips

- **Windows:** run the Setup exe; SmartScreen may warn on unsigned builds — choose More info → Run anyway if you trust the release.
- **macOS (important):** Unsigned builds often show **“Spire is damaged and can’t be opened.”** That is Gatekeeper quarantine, not a bad download. After dragging Spire to Applications, run in Terminal:

```bash
xattr -cr /Applications/Spire.app
```

Then open Spire normally (or right-click → Open the first time).
- **Linux AppImage:** `chmod +x Spire-0.1.0.AppImage && ./Spire-0.1.0.AppImage`

## What's next

See the [roadmap](https://github.com/Streats22/spire-launcher#roadmap) in the README. Feedback and issues welcome.

## Links

- Source: https://github.com/Streats22/spire-launcher
- Site: https://streats22.github.io/spire-launcher/
- Docs: https://github.com/Streats22/spire-launcher#readme
