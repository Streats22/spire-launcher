# Spire

**Spire** (Spire Launcher) is a cross-platform **Hytale instance launcher** for Windows, macOS, and Linux.

It follows a Prism Launcher–style model for Hytale: isolated profiles, separate mods and userdata per instance, and a straightforward launch flow — **without redistributing Hytale**. You get the game through official channels; Spire manages profiles and content around it.

> Not affiliated with Hypixel Studios, Riot Games, or Prism Launcher.

**Links:** [Website](https://streats22.github.io/spire-launcher/) · [Download](https://streats22.github.io/spire-launcher/download/) · [FAQ](https://streats22.github.io/spire-launcher/faq/) · [Releases](https://github.com/Streats22/spire-launcher/releases) · [Credits](#credits)

---

## Table of contents

- [Privacy](#privacy)
- [Features](#features)
- [Install](#install)
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
- [Credits](#credits)
- [License & disclaimer](#license--disclaimer)

---

## Privacy

Spire runs entirely on your machine. There is no Spire account and no cloud sync.

| Spire does **not** | Spire **does** |
| --- | --- |
| Create Spire accounts | Keep profiles, keys, mods, and settings on disk |
| Cloud-sync your data | Talk to CurseForge / Nexus / Hytale only when **you** use those features |
| Ship telemetry or analytics | Optionally check for updates (public JSON + GitHub Releases for installed builds) — can be disabled |

API keys and OAuth tokens stay in your Spire data folder except when sent to the service you chose (for example CurseForge or Hypixel auth).

---

## Features

### Instances (profiles)

- Create, rename, duplicate, delete, and group instances
- Import / export **`.spirepack`** (mods + profile; optional worlds)
- Per-instance **mods**, **userdata**, **prefabs**, **logs**, and **servers**
- Release / pre-release channels; optional pinned game version
- Custom Java args; drag-and-drop reorder between groups
- Home layout: **grid** or **list**
- Launch-time isolation: `--user-dir` verified under Spire; Mods junction repaired when needed

### Launch & auth

- Sign in with your **Hytale** account (official OAuth device flow)
- Multi-account + game profile selection
- Isolated userdata / mods dirs for the client
- Optional run-log window and minimize-on-launch

### Game install

- Point at an existing official Hytale install, or
- Download / repair client builds in Spire’s **Install** UI (official channels — Spire does not ship the game in its installer)

### Mods & content browsers

| Source | Notes |
| --- | --- |
| **CurseForge** | Search + install with optional API key; without a key use browser Files + Import |
| **Nexus Mods** | Free: Slow download / `nxm://` / Import; Premium key enables in-app quick download |
| **Thunderstore** | Zip packages; Spire extracts jars into `mods/` |
| **Modtale / Modifold** | Community catalogs |
| **Modrinth** | Client ready; Hytale listings may be empty until the platform adds them |

Also: **prefabs**, **world packs**, **bootstraps**, **translations**; file import; Downloads-folder watch / auto-import; dependency install when the source provides it.

### Worlds

- List / rename / duplicate / delete saves under `userdata/Saves/`
- Create with **Adventure**, **Creative**, or **Flat** presets (+ optional seed)
- **Apply mod set** to all saves or only selected ones
- Download world packs into Saves (when CurseForge allows CDN)

### Manage window

Tabs for profile, mods, worlds, prefabs, bootstrap, translations, servers, and logs (scrollable run output with export).

### Appearance

- Built-in themes (dark, light, plain grey / black / white, high contrast)
- **Custom** theme: pick background, surface, text, and accent via color picker, **HEX**, or **RGB** — saved locally
- Density (compact / comfortable / readable) and home layout
- Applied across the main, manage, and run windows

---

## Install

Download the latest build from **[GitHub Releases](https://github.com/Streats22/spire-launcher/releases)**.

| Platform | Artifact | How to install |
| --- | --- | --- |
| **Windows** | `Spire-Setup-<version>.exe` | Run the setup wizard (install folder, desktop shortcut, optional startup) |
| **Windows (portable)** | `Spire-<version>-portable.exe` | No installer — run from any folder |
| **macOS** | `Spire-<version>-arm64.dmg` (or `.dmg` / `.zip`) | Open the DMG → drag **Spire** into Applications. If macOS says the app is **damaged**, run `xattr -cr /Applications/Spire.app` once (unsigned build / Gatekeeper). |
| **Linux** | `Spire-<version>.AppImage` / `.deb` | Prefer these from Linux CI; `chmod +x` the AppImage, or `sudo dpkg -i …` |
| **Linux (archive)** | `Spire-<version>.tar.gz` | Extract and run `Spire` |

App id: `dev.spire.launcher` · Product name: **Spire**.

Unsigned Windows builds may show SmartScreen (“Windows protected your PC”) — use **More info → Run anyway** if you trust the release.

### Project site

Static pages in [`docs/`](docs/) are published on **GitHub Pages**:

**https://streats22.github.io/spire-launcher/**

| Page | URL |
| --- | --- |
| Home | [/](https://streats22.github.io/spire-launcher/) |
| Download | [/download/](https://streats22.github.io/spire-launcher/download/) |
| Features | [/features/](https://streats22.github.io/spire-launcher/features/) |
| FAQ | [/faq/](https://streats22.github.io/spire-launcher/faq/) |
| Hytale launcher | [/hytale-launcher/](https://streats22.github.io/spire-launcher/hytale-launcher/) |

Sitemap: [`sitemap.xml`](https://streats22.github.io/spire-launcher/sitemap.xml). To re-enable Pages if needed: repo **Settings → Pages** → Deploy from branch `main` · folder **/docs**.

For Google: [Search Console](https://search.google.com/search-console) → add the site URL → submit the sitemap. Indexing can take days to weeks for a new site.

---

## Quick start

1. Install Spire for your OS.
2. Open **Install** → sign in with your Hytale account.
3. Set or download a game client / install path.
4. **Add instance** on the home screen (pick channel / version as needed).
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

Official Hytale installs are detected under common paths (for example `%APPDATA%\Hytale` on Windows). Spire never replaces the need for a legitimate game license.

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

| Section | What it covers |
| --- | --- |
| **General** | Update check on launch, version status, download / install update (Setup builds) |
| **Game** | Official install path, detect / pick folder |
| **Launch** | Run-log window, minimize on launch |
| **Appearance** | Theme presets, **custom colors** (HEX / RGB), density, home layout |
| **Mods & keys** | CurseForge / Nexus keys, show mod photos |
| **Data** | Open Spire / logs folders; clear keys & sessions; **clear all Spire data** |

Themes include slate, ember, ocean, mist, midnight, daybreak, fog, graphite, black, white, high contrast, and **Custom**. Custom colors are stored in `settings.json` and apply to every Spire window.

---

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SPIRE_CURSEFORGE_API_KEY` | CurseForge API key (overrides Settings / embedded) |
| `SPIRE_NEXUS_API_KEY` | Nexus Premium API key (optional) |
| `SPIRE_UPDATE_URL` | Override the public update manifest URL |

Keys in Settings are equivalent and clearable. Do not commit real keys to git.

---

## Develop

**Requirements:** Node.js **22.12+** (Electron 43 / electron-builder), npm.

```bash
git clone https://github.com/Streats22/spire-launcher.git
cd spire-launcher
npm install
npm run dev
```

| Script | Description |
| --- | --- |
| `npm run dev` | Electron + Vite (patches Electron display name / AppUserModelId) |
| `npm run build` | Production main / preload / renderer → `out/` |
| `npm run preview` | Run the production Vite build in Electron |
| `npm run typecheck` | TypeScript (`tsconfig.node.json` + `tsconfig.web.json`) |
| `npm run generate:installer-assets` | Regenerate DMG / NSIS bitmaps from `scripts/generate-installer-assets.py` |

On macOS, quit and relaunch after `npm install` if the Dock still says “Electron”.

---

## Package / release builds

Produces installers under [`release/`](release/). Prefer the **Release** GitHub Action for shipping (Windows + macOS + Linux in one tag).

```bash
# Current platform’s configured targets
npm run dist

# Explicit
npm run dist:win     # NSIS Setup .exe + portable
npm run dist:mac     # .dmg + .zip  (must run on macOS)
npm run dist:linux   # AppImage + .deb (+ tar.gz)
```

| Target | Build host | Output (examples) |
| --- | --- | --- |
| Windows NSIS + portable | Windows | `Spire-Setup-<version>.exe`, `Spire-<version>-portable.exe` |
| macOS DMG / zip | **macOS** (`npm run dist:mac` or Actions `macos-latest`) | `Spire-<version>*.dmg` / `.zip` |
| Linux AppImage / deb | Linux recommended (`ubuntu-latest`) | `Spire-<version>.AppImage`, `.deb` |
| Linux tar.gz | electron-builder (including from Windows) | `Spire-<version>.tar.gz` |

> Use Node **22.12+**. Spire targets `electron-builder@26.15.x` (blockmap / icon tooling needs a current Node).

Branded installer chrome:

- **macOS** — DMG background, drag to Applications
- **Windows** — custom NSIS welcome / options / finish, desktop shortcut + startup toggles
- **Linux** — AppImage (portable) and `.deb` (system install)

```bash
npm run generate:installer-assets
```

Tag a `v*` release or run the **Release** workflow so Actions attach installers **and** updater metadata (`latest.yml`, `.blockmap`).

---

## Updates

Spire can check for a newer release in two ways:

1. **Public manifest** — [`updates/latest.json`](updates/latest.json) on the default branch (override with `SPIRE_UPDATE_URL`). One anonymous `GET`; no identity is sent. Toggle under Settings → General.
2. **In-app install** — installed **Setup** builds use `electron-updater` against GitHub Releases (`latest.yml` / blockmaps). Portable and `npm run dev` builds open the release page instead.

**To publish an update:**

1. Bump `"version"` in `package.json`.
2. Update [`updates/latest.json`](updates/latest.json) on the default branch.
3. Tag / run the Release workflow so installers and updater files are attached to the GitHub release.

---

## Credits

Spire is built by **[streats22](https://github.com/Streats22)** // streatsdesign.

In the app, open the credits chip in the toolbar (logo + name) for profile and repository links.

---

## License & disclaimer

Spire is a third-party launcher. Hytale is a trademark of Hypixel Studios / Riot Games. Spire does not include or redistribute the Hytale client in its installer; you must obtain the game through official means.

Use mod APIs and stores according to each provider’s terms.
