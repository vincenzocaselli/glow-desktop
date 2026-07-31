# Glow · KDE

The KDE Plasma counterpart of **Glow** (the GNOME/Zorin package). Same visual
identity — Dodger Blue accent, active-window highlight, square corners, yellow
Papirus folders — but built on Plasma's native configuration system instead of
Shell extensions and CSS hacks.

Designed for **KDE Plasma 6** (Kubuntu 24.04+, KDE neon, Fedora KDE, etc.).
Works on Plasma 5 too where the keys match.

License: **GPL-3.0-or-later**

## Why this is simpler than the GNOME version

On GNOME we had to write a Shell extension (for the focus glow) and inject CSS
overrides (for the accent), because GNOME deliberately resists theming. KDE is
the opposite: accent color, active-window coloring, corner radius and icon
theme are all **first-class settings**. So this package mostly drives the
native Plasma config tools (`kwriteconfig6`, `plasma-apply-icontheme`) rather
than hacking around the toolkit.

## Modules

### 1. `accent`
Sets the global accent color to Dodger Blue (`#1e90ff`) via Plasma's native
accent system (`kdeglobals [General] AccentColor`). This colors selections,
checked states, sliders, focused elements and folder-icon tint everywhere,
automatically — no per-widget rules.

### 2. `focus-border`
Highlights the active window in the accent color (titlebar / border), the
idiomatic KDE equivalent of the GNOME focus-glow. KDE tints the window
decoration rather than drawing an external blur halo — this looks native and
needs no compositor extension.

### 3. `square-corners`
Disables Plasma's rounded window corners (sets Breeze `CornerRadius` to 0 and
turns off the rounded-corners KWin effect if present), matching the GNOME
square-corners tweak.

### 4. `yellow-folders`
Installs Papirus with yellow folders and applies it through
`plasma-apply-icontheme`. Includes the same small-size colorize fix used on
GNOME, so Dolphin shows yellow folders at every size (including compact details
view). Full backup at `/usr/share/icons/_glow-colorize-backup`.

### 5. `dolphin`
Tunes Dolphin to be compact and visually consistent with the rest of Glow:

- Default view = **Details** (list-like, compact)
- Smaller icon sizes (16px in Details/Compact, 48px in Icons)
- `GlobalViewProps = true` so every folder opens with the same view
- Overrides Dolphin's launcher icon with `folder` (the yellow Papirus folder),
  via a user-level `.desktop` in `~/.local/share/applications/`

### 6. `overview`
Binds the **Meta (Super / Windows) key alone** to KWin's Overview effect, the
KDE equivalent of GNOME's Activities Overview. Pressing Meta shows all open
windows + a grid of virtual desktops.

By default on Plasma 6 the Meta key opens the Application Launcher; this module
remaps it to Toggle Overview instead. The launcher remains accessible via
Alt+F1 or its panel button.

- Enables the Overview KWin effect (already on by default in Plasma 6)
- Binds `Meta` → Overview
- Unbinds `Meta` from the Application Launcher to avoid conflict
- `--remove` restores both defaults

## Install

```bash
tar -xzf glow-kde.tar.gz
cd glow-kde
bash install.sh
```

Requires `sudo` (apt + icon dirs). Log out / back in afterward to be sure
everything is applied; most changes also apply live or after reloading KWin
(`kwin_wayland --replace &`) and Plasma (`plasmashell --replace &`).

## Usage

```bash
bash install.sh accent
bash install.sh focus-border
bash install.sh square-corners
bash install.sh yellow-folders
bash install.sh dolphin
bash install.sh overview

bash install.sh --remove
bash install.sh <module> --remove
bash install.sh --list
```

## What it modifies

- `~/.config/kdeglobals` — accent color, active-window WM colors, icon theme
- `~/.config/kwinrc` — corner / decoration settings, Overview plugin
- `~/.config/breezerc` — Breeze corner radius
- `~/.config/dolphinrc` — Dolphin default view, icon sizes, global view props
- `~/.config/kglobalshortcutsrc` — Meta key shortcut (Overview module)
- `~/.local/share/applications/org.kde.dolphin.desktop` — Dolphin icon override
- `papirus-icon-theme` via apt; `papirus-folders` via upstream installer
- Small-size folder SVGs in `/usr/share/icons/Papirus*` (backed up)
- State file: `~/.config/glow-kde/yellow-folders.state`

Nothing in the distribution's own theme files is overwritten; all changes live
in your user config (except the Papirus icon colorize, which is backed up and
restored on `--remove`).

## Honest notes

- KDE's active-window highlight tints the **titlebar/decoration**, it is not an
  external glowing halo like the GNOME Clutter version. This is the native KDE
  idiom and integrates better than a faked halo would.
- Exact pixel parity with the GNOME build is not a goal — Breeze widgets, fonts
  and decorations differ from Adwaita by design. The identity (blue accent,
  highlighted active window, square corners, yellow folders) is preserved.
- If a specific key name differs on your Plasma build, the script fails soft
  (`2>/dev/null || true`) on the optional keys, so it won't break; tell me the
  Plasma version and I can tune it.

## Full uninstall

```bash
bash install.sh --remove
```

Resets accent, active-window colors, corners and icon theme, and restores the
Papirus folder icons from backup. Log out / in to finish.
