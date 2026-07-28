# Spire

Cross-platform **Hytale instance launcher** (macOS, Windows, Linux).

Spire is inspired by what Prism Launcher does for Minecraft: isolated profiles, separate mods/userdata, and a clean launch flow — without redistributing Hytale itself.

## Privacy first

Spire is an app you install. That’s it.

- **No Spire accounts**
- **No cloud sync**
- **No telemetry / analytics**
- Profiles, API keys, and mods stay in your local Spire data folder
- The **only** Spire-initiated network call is an optional update check: one `GET` to a public version JSON (`updates/latest.json`). No user identity is sent. You can turn this off in Settings.

Third-party calls (CurseForge / Nexus / launching Hytale) only happen when **you** use those features, and go to those services — not to Spire.

## Approach

- **Official install only** — you own the game via the official launcher; Spire points at that folder
- **Profile isolation** — each profile gets its own `mods/`, `userdata/`, and `logs/`
- **Electron + React** — one codebase, packages for Mac / Windows / Linux via `electron-builder`

> Not affiliated with Hypixel Studios, Riot Games, or Prism Launcher.

## Develop

```bash
npm install
npm run dev
```

## Package

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Mod stores

| Source | Notes |
| --- | --- |
| **CurseForge** | Game ID `70216`. Needs an API key from [console.curseforge.com](https://console.curseforge.com/). |
| **Nexus Mods** | Domain `hytale`. Needs a personal API key. **Premium** required for one-click API downloads. |

Keys are saved locally only (or via `SPIRE_CURSEFORGE_API_KEY` / `SPIRE_NEXUS_API_KEY`).

## Updates

Publish a new version by bumping `package.json` and updating [`updates/latest.json`](updates/latest.json) on the default branch (or set `SPIRE_UPDATE_URL`).

## Roadmap

- [x] Local profiles (create / rename / notes / duplicate / delete)
- [x] Local credentials (CurseForge / Nexus) — clearable, never uploaded
- [x] Optional single-call update check
- [x] CurseForge + Nexus Mods browse / install
- [ ] Confirm Hytale client isolation flags
- [ ] Nexus `nxm://` handler for free-account downloads
- [ ] Pack import-export (`.spirepack`)
