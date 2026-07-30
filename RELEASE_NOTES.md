# Spire 0.2.0

**Spire** is a cross-platform **Hytale instance launcher** for Windows, macOS, and Linux. Isolated profiles, mods, and worlds — without redistributing the game.

> Not affiliated with Hypixel Studios, Riot Games, or Prism Launcher.

## Downloads

| Platform | File | Notes |
| --- | --- | --- |
| **Windows** | `Spire-Setup-0.2.0.exe` | Recommended installer (shortcuts, optional startup) |
| **Windows** | `Spire-0.2.0-portable.exe` | Portable — run from any folder |
| **macOS** | `Spire-0.2.0-arm64.dmg` (or `.dmg` / `.zip`) | Drag Spire into Applications |
| **Linux** | `Spire-0.2.0.AppImage` | `chmod +x` then run |
| **Linux** | `Spire-0.2.0.deb` | `sudo dpkg -i …` |
| **Linux** | `Spire-0.2.0.tar.gz` | Extract and run `Spire` |

macOS / Linux installers are built by GitHub Actions when this tag is published; they appear on this release as soon as CI finishes.

## Highlights

### Appearance
- More built-in themes (including plain graphite / black / white)
- **Custom theme**: background, surface, text, and accent via picker, HEX, or RGB
- Credits chip in the toolbar

### Accounts
- Toolbar **Accounts** entry and **Sign in** when you’re not signed in
- Settings → **Accounts** for manage / switch flows
- Multi-account + game profile switching stays local

### Mods
- Check whether installed store mods are on the latest file
- **Update** / **Update all** for outdated mods
- Browse + detail show **Installed** / **Update available**

### Instances
- Choose a **preset icon** or your own image (PNG / JPG / WebP / GIF)
- Icons show on home cards and the active-instance toolbar chip

### Updates & docs
- Clearer update-check UX; Setup builds can use GitHub Releases updater metadata when present
- Public **roadmap** on the site: https://streats22.github.io/spire-launcher/docs/

## Requirements

- A legitimate **Hytale** install / account for play and official client downloads
- **Node is not required** to run the app — only to build from source (Node 22.12+)

## Install tips

- **Windows:** run the Setup exe; SmartScreen may warn on unsigned builds — choose More info → Run anyway if you trust the release.
- **macOS:** Unsigned builds often show **“Spire is damaged and can’t be opened.”** After dragging to Applications, run:

```bash
xattr -cr /Applications/Spire.app
```

- **Linux AppImage:** `chmod +x Spire-0.2.0.AppImage && ./Spire-0.2.0.AppImage`

## What's next

See the [roadmap](https://streats22.github.io/spire-launcher/docs/) on the project site. Feedback and issues welcome.

## Links

- Source: https://github.com/Streats22/spire-launcher
- Site: https://streats22.github.io/spire-launcher/
- Docs / roadmap: https://streats22.github.io/spire-launcher/docs/
