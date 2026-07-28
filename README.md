# Spire

**Spire** is a cross-platform **Hytale instance launcher** for macOS, Windows, and Linux.

It takes a Prism Launcher–style approach for Hytale: isolated profiles, separate mods and userdata per instance, and a clean launch flow — **without redistributing Hytale itself**. You own the game through official channels; Spire manages profiles and content around it.

> Not affiliated with Hypixel Studios, Riot Games, or Prism Launcher.

---

## Table of contents

- [Privacy](#privacy)
- [Features](#features)
- [Install](#install)
- [Project site](#project-site)
- [Quick start](#quick-start)
- [Profiles & data layout](#profiles--data-layout)
- [Isolation](#isolation)
- [Spire packs (`.spirepack`)](#spire-packs-spirepack)
- [Mods & content](#mods--content)
- [Worlds & mods](#worlds--mods)
- [Settings & appearance](#settings--appearance)
- [Environment variables](#environment-variables)
- [Develop](#develop)
- [Package / release builds](#package--release-builds)
- [Updates](#updates)
- [Roadmap](#roadmap)
- [License & disclaimer](#license--disclaimer)

---

## Privacy

Spire is an app you install on your machine. That’s it.

| Spire does **not** | Spire **does** |
| --- | --- |
| Create Spire accounts | Keep profiles, keys, and mods on disk |
| Cloud-sync your data | Talk to CurseForge / Nexus / Hytale only when **you** use those features |
| Ship telemetry or analytics | Optionally `GET` a public update JSON (no identity) — can be disabled |

API keys and OAuth tokens never leave your Spire data folder except to the service you chose (e.g. CurseForge, Hypixel auth).

---

## Features

### Instances (profiles)

- Create, rename, duplicate, delete, and group instances
- Import / export **`.spirepack`** (mods + profile; optional worlds)
- Per-instance **mods**, **userdata**, **prefabs**, **logs**
- Release / pre-release channels; optional pinned game version
- Custom Java args; drag-and-drop reorder between groups
- Home layout: **grid** or **list**
- Verified isolation: `--user-dir` + Mods junction repaired at launch

### Launch & auth

- Sign in with your **Hytale** account (official OAuth device flow)
- Multi-account + game profile selection
- Isolated userdata / mods dirs injected for the client
- Optional run-log window and minimize-on-launch

### Game install

- Point at an existing official Hytale install, or
- Download / manage client builds through Spire’s Install / Versions UI (official channels — Spire does not ship the game binary in the installer)

### Mods & content browsers

| Source | Notes |
| --- | --- |
| **CurseForge** | Search + install with optional API key; without a key use browser Files + Import |
| **Nexus Mods** | Free: Slow download / `nxm://` / Import; Premium key enables in-app quick download |
| **Thunderstore** | Zip packages; Spire extracts jars into `mods/` |
| **Modtale / Modifold** | Community catalogs |
| **Modrinth** | Client ready; Hytale listings may be empty until the platform adds them |

Also: **prefabs**, **world packs**, **bootstraps**, **translations**; file import; download-folder watch / auto-import; dependency install where the source provides it.

### Worlds

- List / rename / duplicate / delete saves under `userdata/Saves/`
- Create with **Adventure**, **Creative**, or **Flat** presets (+ optional seed)
- **Apply mod set** to all saves or only selected ones
- Download world packs into Saves (when CurseForge allows CDN)

### Manage window

Tabs for profile, mods, worlds, prefabs, bootstrap, translations, servers, and logs.

### Appearance

Themes (slate, ember, ocean, mist, midnight, daybreak, fog, contrast), density, and home layout — applied across main, manage, and run windows.

---

## Install

Prebuilt installers are written to [`release/`](release/) after packaging (and can be attached to GitHub Releases).

| Platform | Artifact | How to install |
| --- | --- | --- |
| **Windows** | `Spire-Setup-0.1.0.exe` | Run the setup wizard (choose install folder, desktop shortcut, optional startup) |
| **Windows (portable)** | `Spire 0.1.0.exe` | No installer — run from any folder |
| **macOS** | `Spire-0.1.0.dmg` | Open the DMG → drag **Spire** into Applications (**build on macOS** or via [Release workflow](.github/workflows/release.yml)) |
| **Linux** | `Spire-0.1.0.AppImage` / `.deb` | Prefer these from a Linux CI build; `chmod +x` the AppImage, or `sudo dpkg -i Spire-0.1.0.deb` |
| **Linux (portable archive)** | `Spire-0.1.0.tar.gz` | Extract and run `Spire` inside — this is the Linux package that can be produced from Windows |

App id: `dev.spire.launcher` · Product name: **Spire**.

### What this machine can produce

| Artifact | Status on Windows host |
| --- | --- |
| `Spire-Setup-*.exe` | ✅ `npm run dist:win` |
| `Spire-*.dmg` | ❌ Needs macOS (`npm run dist:mac` or GitHub Actions `macos-latest`) |
| `Spire-*.AppImage` / `.deb` | ❌ Needs Linux (symlink / `fpm`); use Actions `ubuntu-latest` |
| `Spire-*.tar.gz` | ✅ Linux portable bundle via electron-builder on Windows |

To build **all three** official installers in one go, push a `v*` tag or run the **Release** workflow in Actions.

---

## Project site

A small static landing page lives in [`docs/`](docs/) for **GitHub Pages**:

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` (or your default) · folder: **/docs**

After that it will be at `https://streats22.github.io/spire-launcher/` (or your custom domain).

---

## Quick start

1. Install Spire for your OS.
2. Open **Install** → sign in with your Hytale account.
3. Set or download a game client / install path.
4. **Add Instance** on the home screen (pick channel / version as needed).
5. Open **Mods** (or Manage → Mods) to install content into that profile.
6. Hit **Launch**.

---

## Profiles & data layout

Spire stores everything under the OS app-data folder:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\Spire` |
| macOS | `~/Library/Application Support/Spire` |
| Linux | `~/.config/Spire` |

Typical layout:

```text
Spire/
  settings.json
  auth/                 # Hytale accounts & tokens (local)
  game/                 # Client packages downloaded via Spire (if used)
  instances/
    <instance-id>/
      instance.json
      mods/
      userdata/         # Hytale userdata for this profile
        Saves/          # Singleplayer worlds (config.json + universe/…)
      prefabs/
      logs/
```

Official Hytale installs are detected under common paths (e.g. `%APPDATA%\Hytale` on Windows). Spire never replaces the need for a legitimate game license.

---

## Isolation

Each instance gets its own Hytale user data. At launch Spire verifies the user-dir stays under Spire’s `instances/` tree (never the official `%APPDATA%\Hytale\UserData` or OS equivalents) and repairs the Mods junction/symlink when needed.

| Isolated (per instance) | Shared across instances |
| --- | --- |
| Userdata (`--user-dir`, `HYTALE_USER_DATA`) | Client binaries (`--app-dir`) |
| Saves under `userdata/Saves/` | JRE (`--java-exec`) |
| Mods via `userdata/Mods` → `{instance}/mods` | Official / Spire `game/` install |

**Flags Spire sets:** `--user-dir`, `--app-dir`, `--java-exec`, auth args, and `HYTALE_USER_DATA`.

---

## Spire packs (`.spirepack`)

Share a profile as a zip named `Something.spirepack` (plain `.zip` also imports if `manifest.json` is present).

**Default export** (mods / profile pack):

```text
manifest.json     # formatVersion 1, name, notes, channel, gameVersion, javaArgs,
                  # includeWorlds, createdAt, spireMinVersion
mods/             # including disabled/ + spire-mods.json when present
prefabs/          # if non-empty
servers.json      # if present
```

Optional: check **Include world saves** to add `userdata/Saves/`. Never included: auth, absolute paths, the Mods junction target, logs, or empty legacy `worlds/`.

- **Export:** instance context menu, or Manage → Share pack
- **Import:** Home → **Import pack…** (always creates a **new** instance; Mods link is recreated)

---

## Mods & content

- Browse by source, sort, and category (where available).
- Detail pane is **resizable**; descriptions support **Auto / Markdown / HTML / Plain** rendering.
- Installed mods can be enabled/disabled (disabled packs move under `mods/disabled/`).
- CurseForge / Nexus keys are **optional** and stored only locally (Settings or env — see below).

### Nexus free downloads

1. Prefer **Mod Manager Download** on the site so Spire receives an `nxm://` link, or  
2. Finish a Slow download — Spire can watch your Downloads folder and import, or  
3. Paste an `nxm://` link / use **Import file**.

---

## Worlds & mods

Hytale’s in-game **Create World** screen starts with mods **unchecked**. Spire cannot flip those checkboxes.

What Spire can do:

1. **Play through Spire** — after you create a world (even with boxes off), Spire writes your enabled mods into that save’s `config.json`.
2. **Manage → Worlds → Create** — Adventure / Creative / Flat + seed, with mods enabled in the save config.
3. **Apply to all** / **Apply to selected** — push the current enabled mod set into existing saves anytime.

---

## Settings & appearance

- **General / Game** — install path, update check
- **Launch** — run log window, minimize on launch
- **Appearance** — theme, density, home layout
- **Mods & keys** — CurseForge / Nexus keys, show mod photos
- **Data** — open Spire folder, clear local credentials

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SPIRE_CURSEFORGE_API_KEY` | CurseForge API key (overrides Settings / embedded) |
| `SPIRE_NEXUS_API_KEY` | Nexus Premium API key (optional) |
| `SPIRE_UPDATE_URL` | Override update manifest URL |

Keys in Settings are equivalent and clearable. Do not commit real keys to git.

---

## Develop

**Requirements:** Node.js **22.12+** (Electron 43 / electron-builder tooling), npm.

```bash
git clone <repo-url>
cd spire-launcher
npm install
npm run dev
```

| Script | Description |
| --- | --- |
| `npm run dev` | Electron + Vite (patches Electron display name on macOS / AppUserModelId on Windows) |
| `npm run build` | Production renderer/main/preload bundles → `out/` |
| `npm run typecheck` | TypeScript (`tsconfig.node.json` + `tsconfig.web.json`) |
| `npm run preview` | Preview packaged Vite build |
| `npm run generate:installer-assets` | Regenerate DMG / NSIS bitmaps from `scripts/generate-installer-assets.py` |

On macOS, quit and relaunch after `npm install` if the Dock still says “Electron”.

---

## Package / release builds

Produces installers under [`release/`](release/).

```bash
# Current platform’s configured targets
npm run dist

# Explicit
npm run dist:win     # NSIS Setup .exe + portable
npm run dist:mac     # .dmg + .zip  (must run on macOS)
npm run dist:linux   # AppImage + .deb
```

### Platform notes

| Target | Host OS to build | Output (examples) |
| --- | --- | --- |
| Windows NSIS | Windows (recommended) | `Spire-Setup-<version>.exe` |
| macOS DMG | **macOS required** (`npm run dist:mac`) | `Spire-<version>.dmg` |
| Linux AppImage / deb | Linux recommended; can also be built from Windows via electron-builder | `Spire-<version>.AppImage`, `Spire-<version>.deb` |

> **Packaging tip:** Use Node **22.12+**. Spire targets `electron-builder@26.15.x` (blockmap / icon tooling is TypeScript-based and needs a current Node).

Branded installer chrome:

- **macOS** — DMG background (`resources/dmg-background.png`), drag to Applications
- **Windows** — custom NSIS welcome / options / finish (`resources/installer.nsh`, `resources/nsis/`), desktop shortcut + startup toggles
- **Linux** — AppImage (portable) and `.deb` (system install)

Regenerate art after icon/theme changes:

```bash
npm run generate:installer-assets
```

### CI tip

Use GitHub Actions (or similar) with `macos-latest`, `windows-latest`, and `ubuntu-latest` jobs so all three artifacts are produced on every release tag.

---

## Updates

1. Bump `"version"` in `package.json`.
2. Update [`updates/latest.json`](updates/latest.json) on the default branch (or point `SPIRE_UPDATE_URL` at your manifest).
3. Publish installers for each OS.

Users with **Check for updates** enabled fetch that JSON only — no account info is sent.

---

## Roadmap

- [x] Local profiles (create / rename / notes / duplicate / delete / groups)
- [x] Local credentials (CurseForge / Nexus) — clearable, never uploaded
- [x] Optional single-call update check
- [x] CurseForge + Nexus + Thunderstore (+ community catalogs)
- [x] Nexus `nxm://` handler
- [x] Worlds create presets + apply mod set to saves
- [x] Rich mod descriptions (Markdown / HTML) + resizable detail pane
- [x] Confirm Hytale client isolation flags
- [x] Pack import-export (`.spirepack`)

---

## License & disclaimer

Spire is a third-party launcher. Hytale is a trademark of Hypixel Studios / Riot Games. Spire does not include or redistribute the Hytale client in its installer; you must obtain the game through official means.

Use mod APIs and stores according to each provider’s terms.
