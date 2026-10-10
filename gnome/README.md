# Glow

A soft colored aura around the focused window in GNOME Shell, plus a coherent
set of theme tweaks for a unified Dodger Blue + yellow-folders look.

Designed for **Zorin OS 18** and any GNOME-based desktop running GNOME 45–52.

License: **GPL-3.0-or-later**

## What it does

Five independent modules, applied in sequence:

### 1. `focus-glow`
GNOME Shell extension that draws a thin Dodger Blue (`#1e90ff`) aura around the
currently focused window. Works with **every** application — GTK3, GTK4 /
libadwaita, Electron, Sublime Text, Eclipse, Qt — because it operates at the
compositor level.

- Strip thickness: 2px
- Blur: 6px
- Opacity: 0.95
- Fully configurable in `extension.js` (no repackage needed)

A compact free-space indicator shows the free gigabytes of `/` (for example
`33 GB`) in a small box filled in light blue in proportion to the space used:
amber below 15% free, red below 7%. On laptops it sits next to the battery,
in the same font; elsewhere it gets its own panel button, whose click opens
Disk Usage Analyzer. Hovering shows the details (`diskSpace`, `diskPath` in
`extension.js`).

On laptops the same extension also restyles the battery in the top bar:

- **Battery icon in the style of Windows 11** — horizontal, with a fill
  proportional to the charge: light green, amber at 20% and below, red at 10%
  and below. The percentage is written inside in bold, followed by a smaller
  `%`, in the panel's text color: the fills are light enough to keep it
  readable. When the charger is plugged in, a yellow bolt with a thin dark
  outline appears inside, before the digits. The digits never shrink: the
  icon widens when the bolt or a third digit needs the room
- **Remaining time on hover** — resting the pointer on the battery icon shows
  the remaining time on battery, or the time to a full charge. In Italian on
  an Italian system, in English otherwise
- On machines without a battery, nothing changes

### 2. `theme-tweaks`
GTK3 + GTK4 CSS overrides:

- **Square window corners** — all four corners straight (GNOME defaults to
  rounded top corners only)
- **Dodger Blue accent everywhere** — selected rows, checked toggles,
  breadcrumbs, switches, progress bars, calendars, menu hovers — every accent
  state matches the focus-glow color
- **Glass selection** — selected rows, checked buttons, the current directory
  in the path bar, menu items under the pointer, and the selected calendar day
  are translucent and rounded, in focused and unfocused windows alike.
  Selected text uses a lighter glass, so it stays readable. In Nemo (GTK3), a thin gap separates adjacent
  selected rows. In Files (GTK4) the rows touch, because a gap would shift
  the rows
- **White backgrounds (GTK4)** — windows, title bars, and sidebars are white,
  with or without focus, instead of the theme's blue-gray and gray. Applies to
  every GTK4 / libadwaita app, not just Files
- **Same selection in Eclipse** — Eclipse (SWT) reads its selection colors
  from the GTK theme file, not from `gtk.css`. The module activates
  `<theme>-Glow`, a theme that imports the current one and only replaces the
  selection colors with the opaque equivalent of the glass (`#8fc8ff`)
- **Light blue title bar** — the focused window's title bar is light blue
  (`#c7e3ff`, Dodger Blue at 25% over white), the others stay white. Covers
  GTK3, GTK4, and the title bars the window manager draws for apps such as
  Nemo and Eclipse; those update after logging out and back in
- **Window buttons in the style of Windows 11** — minimize, maximize, and
  close become wide flat buttons with thin line icons, a light gray hover,
  and a red close button on hover. Similar to Windows 11, not a copy: the
  icons are drawn for Glow and the buttons keep slightly rounded corners
- **Light gray dividers (GTK4)** — thin `#dedede` lines below the title bars,
  between the sidebar and the content, and between list column headers, so
  the areas stay distinct on white
- **Sidebar icons at full strength (GTK4)** — the theme dims sidebar icons to
  70%, which washes out the color icons of `yellow-folders`
- **Compact taskbar (Zorin OS)** — lowers the Zorin taskbar from 48 to 42px.
  The taskbar sizes the app icons from its height, so more pinned apps fit

Applied as a marked block (`GLOW START / END`) inside `~/.config/gtk-{3,4}.0/gtk.css`.
Existing user CSS is preserved.

### 3. `yellow-folders`
Installs the **Papirus** icon theme with yellow folders.

- Installs `papirus-icon-theme` via apt
- Installs `papirus-folders` from upstream GitHub
- Sets folder color to yellow on all Papirus variants
- **Colorize fix** — copies the colored 64×64 yellow folder SVGs into the
  small-size icon directories (16, 22, 24, 32, 48 px), so Nemo / Files show
  yellow folders even in list view at standard zoom (Papirus serves symbolic
  monochrome icons at those sizes by default)
- **Color sidebar icons** — builds **Papirus-Light-Glow**, a theme that
  inherits Papirus-Light and replaces the monochrome sidebar icons of Nemo and
  Files (folders, trash, drives) with color ones. Dialog icons stay monochrome.
  The theme needs `python3-gi`: without it, the module falls back to
  Papirus-Light.
- **Wi-Fi and volume icons in the style of Windows 11** — the same theme
  replaces the top bar's Wi-Fi icons (a fan of arcs, with the levels not
  reached shown faint) and volume icons (a speaker with one to three waves,
  a cross when muted). They are symbolic, so they take the panel's text color
- Forces the light variant even when the desktop is in dark mode, so folders
  stay yellow

### 4. `nemo-icon`
Overrides Nemo's default grey "drawer" icon in the taskbar / app menu with a
yellow folder, matching the rest of the file manager UI.

Implemented as a user-level `.desktop` override in
`~/.local/share/applications/nemo.desktop` — only the `Icon=` field is
changed, the system file is untouched.

### 5. `nemo-zoom`
Sets a compact default zoom level for Nemo so the content-area font size
matches the sidebar / menu (Nemo defaults to a slightly larger size in icon
view and standard list view, which often looks oversized next to the
sidebar).

- Sets icon-view, list-view and compact-view default zoom to `'smaller'`
- Clears stale per-folder metadata so previously-visited folders don't keep
  old larger-zoom overrides
- `--remove` resets the three zoom defaults to their schema defaults

## Installation

```bash
tar -xzf glow.tar.gz
cd glow
bash install.sh
```

Requires `sudo` (for apt packages and `/usr/share/icons` modifications).
Password is requested once and kept alive for the duration of the script.

After install: **log out and back in**. Wayland does not reload GNOME Shell
extensions or some CSS without a fresh session.

## Usage

```bash
# Single modules
bash install.sh focus-glow
bash install.sh theme-tweaks
bash install.sh yellow-folders
bash install.sh nemo-icon
bash install.sh nemo-zoom

# Remove everything
bash install.sh --remove

# Remove a single module
bash install.sh nemo-icon --remove

# List modules
bash install.sh --list

# Help
bash install.sh --help
```

The installer is **idempotent**: running it again over an existing install
updates files in place rather than duplicating them.

## What it modifies

### focus-glow
- Creates: `~/.local/share/gnome-shell/extensions/glow@nebula.local/`
- Enables the extension via `gnome-extensions enable`

### theme-tweaks
- Appends a `GLOW START / END` block in `~/.config/gtk-4.0/gtk.css`
- Same block in `~/.config/gtk-3.0/gtk.css`
- Pre-existing user CSS in those files is preserved
- Copies the window button icons to `~/.config/gtk-{3,4}.0/glow/`
- Creates `~/.themes/<theme>-Glow/` and sets it as the GTK theme (also as the
  Zorin day theme, when present)
- State file in `~/.config/glow/theme-tweaks.state` (used by `--remove`)
- On Zorin OS, sets `org.gnome.shell.extensions.zorin-taskbar panel-size` to
  42; the previous value is saved in `~/.config/glow/taskbar.state`

### yellow-folders
- `apt install papirus-icon-theme`
- `wget` install of `papirus-folders` to `/usr/local/bin`
- Modifies small-size folder SVGs in
  `/usr/share/icons/Papirus{,-Light,-Dark}/<size>/places/` (full backup at
  `/usr/share/icons/_glow-colorize-backup/`)
- Creates the `Papirus-Light-Glow` theme in
  `~/.local/share/icons/Papirus-Light-Glow/`
- Changes `gsettings` `icon-theme` on GNOME and Cinnamon schemas
- State file in `~/.config/glow/yellow-folders.state` (used by `--remove`)

### nemo-icon
- Creates `~/.local/share/applications/nemo.desktop` (user-level override)

### nemo-zoom
- Sets `org.nemo.{icon,list,compact}-view default-zoom-level` to `'smaller'` via gsettings
- On install, clears `~/.local/share/gvfs-metadata/*` (per-folder Nemo metadata cache) so previously-visited folders use the new defaults
- On `--remove`, resets the three gsettings keys; per-folder metadata is left as-is

### What it does NOT modify
- Distribution themes (`/usr/share/themes/*`) — untouched
- Adwaita — untouched
- Critical system files — untouched
- The Papirus apt package stays installed after `--remove`. To fully remove:
  `sudo apt remove papirus-icon-theme`

## Customization

### Glow color, thickness, blur
Edit `~/.local/share/gnome-shell/extensions/glow@nebula.local/extension.js`:

```javascript
const CFG = {
    color: 'rgba(30, 144, 255, 0.95)',   // change here
    blur: 6,
    stripWidth: 2,
    fadeMs: 180,
    followMove: true,
    // ...
    batteryTooltip: true,        // remaining time on hover
    batteryIcon: true,           // false: keep the stock battery icon
    batteryPercentInside: true,
    batteryFont: 'Inter SemiBold',
    batteryIconWidth: 30,
    batteryIconHeight: 15,
};
```

Then log out / log in.

### Accent color
Find / replace `#1e90ff` in `assets/css/gtk4.css` and `assets/css/gtk3.css`,
then re-run `bash install.sh theme-tweaks`.

### Folder color
Replace `yellow` in `modules/yellow-folders.sh` (function `apply_yellow_color`)
with one of the colors supported by papirus-folders:

```
adwaita, black, blue, bluegrey, breeze, brown, carmine, cyan, darkcyan,
deeporange, green, grey, indigo, magenta, nordic, orange, palebrown,
paleorange, pink, red, teal, violet, white, yaru
```

Or change it manually:

```bash
sudo papirus-folders -t Papirus -C <color>
```

## Requirements

- GNOME Shell 45–52
- Tested on Zorin OS 18 / 18.1 (GNOME 46) — Wayland and X11
- `sudo`
- Internet (for apt + wget)

## Honest limitations

The tweaks operate at the GNOME / GTK level. The following apps do **not** read
the package's CSS, and keep their own internal colors:

- **Electron apps** (VS Code, Slack, Discord) — the focus glow surrounds them,
  but title bars / selections inside are decided by the app
- **Sublime Text, Eclipse, JetBrains IDEs** — proprietary toolkits (SWT, Skia)
- **Qt / KDE apps** — do not read GTK CSS

The focus-glow extension itself **does work everywhere**, because it runs at
the Mutter compositor level above all windows.

## Repo structure

```
glow/
├── install.sh             ← master orchestrator
├── README.md
├── LICENSE                ← GPL-3.0-or-later
├── assets/
│   ├── extension/         ← extension.js + metadata.json
│   ├── css/               ← gtk3.css + gtk4.css
│   ├── titlebuttons/      ← window button icons (minimize, maximize, restore, close)
│   └── icons/             ← build-theme.py (Papirus-Light-Glow)
└── modules/
    ├── _lib.sh            ← shared logging helpers
    ├── focus-glow.sh
    ├── theme-tweaks.sh
    ├── yellow-folders.sh
    ├── nemo-icon.sh
    └── nemo-zoom.sh
```

## Full uninstall

```bash
bash install.sh --remove
```

Removes everything in reverse order:
- Nemo override
- Papirus icon backups restored
- Papirus-Light-Glow theme deleted
- Previous icon theme restored (read from state file)
- CSS blocks removed (preserving any other user CSS)
- GNOME Shell extension disabled and deleted

After logout / login, you are exactly where you were before the install.
