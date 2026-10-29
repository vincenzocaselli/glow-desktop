# Glow

A soft colored aura around the focused window in GNOME Shell, plus a coherent
set of theme tweaks for a unified Dodger Blue + yellow-folders look, in a
light and a dark version that follow the desktop's style.

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

The extension also fills in overview previews for windows created minimized.
A browser that restores its session at login creates its windows already
minimized and never draws them, so the overview showed them empty. Glow shows
each one for a moment at zero opacity, without animations, while the keyboard
and mouse are idle, then minimizes it again (`warmMinimized` in `extension.js`).

In Alt+Tab, Super+Tab, and the overview the selected preview gets a ring in
the glow color, as in the Windows switcher. In the overview the ring follows
the pointer, or the keyboard: press Tab to reach the first window, then the
arrow keys or Tab to move, Enter to activate. The keys reach the windows of
every monitor, where the Shell stops at the primary one (`previewRing` and
`previewKeys` in `extension.js`; the switcher ring is in `stylesheet.css`).
Alt+Tab draws its previews at 256px instead of the Shell's 128 and lays
them in rows, as many columns as fit the screen, so every window stays in
sight; Up and Down move by a row (`switcherPreviewSize` and `switcherRows`).
Each preview is painted at four times its size into an offscreen buffer and
halved twice, so the texture is averaged instead of sampled and the grain
of a one-step scale-down is gone (`switcherPreviewSupersample`).

The Bluetooth indicator in the top bar is drawn in Dodger Blue
(`bluetoothColor` in `extension.js`; `null` keeps the panel's text color).

The extension also follows the desktop's style: when it changes between
light and dark, the Glow GTK theme, icon theme, and Shell theme of the new
style go in place. See [Light and dark](#light-and-dark) (`followStyle` in
`extension.js`).

A small stylesheet tightens the tray: icons sit about 24px apart instead of
36px. On Zorin it turns off the tray's compact mode, whose inline padding
would override the stylesheet; `--remove` restores the previous setting.

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
  readable. On a panel with light text (the dark style, or a black panel)
  the fills are dark versions of the same colors, so white digits read on
  them. When the charger is plugged in, a yellow bolt with a thin dark
  outline appears inside, before the digits. The digits never shrink: the
  icon widens when the bolt or a third digit needs the room
- **Remaining time on hover** — resting the pointer on the battery icon shows
  the remaining time on battery, or the time to a full charge. In Italian on
  an Italian system, in English otherwise
- On machines without a battery, nothing changes

### 2. `theme-tweaks`
GTK3 + GTK4 CSS overrides. The CSS takes its surface and text colors from
the GTK theme, and the tints that differ by style (title bar, selection,
and their text colors) from the theme copies the module builds, so one block
serves the light and the dark theme and follows a switch between them, in
running apps too:

- **Rounded window corners, 12px on all four** — GNOME rounds the top
  corners only on frames drawn by the window manager; Glow gives GTK 3,
  GTK 4, and those frames the 12px of libadwaita, and the extension rounds
  the bottom corners in the compositor. `GLOW_SQUARE_CORNERS=1 bash
  install.sh theme-tweaks` squares every window instead
- **Dodger Blue accent everywhere** — selected rows, checked toggles,
  breadcrumbs, switches, progress bars, calendars, menu hovers — every accent
  state matches the focus-glow color
- **Solid, rounded selection** — selected rows, checked buttons, the current
  directory in the path bar, menu items under the pointer, and the selected
  calendar day are Dodger Blue with white text, rounded, in focused and
  unfocused windows alike: the accent itself on the light theme, 80% of it
  over the dark surface (`#207bd4`). Selected text gets the same solid accent
  and white text. In Nemo (GTK3), a thin gap separates adjacent
  selected rows. In Files (GTK4) the rows touch, because a gap would shift
  the rows. `LIGHT_GLASS_PCT` and `DARK_GLASS_PCT` in `modules/theme-tweaks.sh`
  set the strength; a paler selection (50, say) gets the theme's text color
  instead of white
- **One surface color (GTK4)** — windows, title bars, and sidebars take the
  theme's view background (white on the light theme, `#262626` on the dark
  one), with or without focus, instead of the theme's blue-gray and gray.
  Applies to every GTK4 / libadwaita app, not just Files
- **Same selection in Eclipse** — Eclipse (SWT) reads its selection colors
  from the GTK theme file, not from `gtk.css`. The module builds
  `<Theme>-Glow-Light` and `<Theme>-Glow-Dark`, copies of the light and the
  dark variant of the current theme that carry Glow's tints as named colors
  and replace the selection colors with the opaque selection (`#1e90ff` on
  the light theme, `#207bd4` on the dark surface, white text on both), and
  activates the one of the current style. They are copies, not imports: flatpak apps see
  `~/.themes` but not `/usr/share/themes`, and a theme that fails to import
  leaves their GTK dialogs without a background
- **Neutral dark theme** — on Zorin OS the dark copy is built from
  `ZorinGrey-Dark`, neutral dark gray with white text as in Windows 11,
  where `ZorinBlue-Dark` tints its text and accents a pale blue. Its greys
  are lifted a little: `#262626` views and `#323232` windows instead of
  `#1b1b1b` and `#2a2a2a`, a black that is less harsh next to the glow
  (`DARK_LIFT` in `modules/theme-tweaks.sh`; 0 keeps the source's greys).
  The accents stay Dodger Blue, stronger than on the light theme so they
  carry on the dark surface: title bar and selection both at 80%, the same
  blue (`DARK_TITLE_PCT`, `DARK_GLASS_PCT`). `GLOW_DARK_THEME` picks another
  source: `GLOW_DARK_THEME=ZorinBlue-Dark bash install.sh theme-tweaks`
  keeps the tinted one
- **Accent title bar** — the focused window's title bar is Dodger Blue with
  a white title and white window buttons (`#1e90ff` on the light theme;
  `#207bd4`, 80% over the dark surface, on the dark one), the others keep
  the surface color and the theme's text. A 1px lighter rim runs 1px
  inside the edge of the blue bar and follows the rounded corners
  (`glow_titlebar_rim_color` in the CSS, white at 70%). Checked buttons and
  the current directory in a title bar get a translucent white chip, so
  they still stand out on the blue. Covers GTK3, GTK4, and the title bars the window
  manager draws for apps such as Nemo and Eclipse; those update after
  logging out and back in. `LIGHT_TITLE_PCT` and `DARK_TITLE_PCT` in
  `modules/theme-tweaks.sh` set the strength; a pale tint (25, say) gets
  the theme's text color instead of white
- **Window buttons in the style of Windows 11** — minimize, maximize, and
  close become wide flat buttons with thin line icons, a light gray hover,
  and a red close button on hover. Similar to Windows 11, not a copy: the
  icons are drawn for Glow and the buttons keep slightly rounded corners
- **Thin dividers (GTK4)** — thin lines below the title bars, between the
  sidebar and the content, and between list column headers, so the areas
  stay distinct on one surface color: the surface moved 13% toward the text
  color (`#e0e4e9` on white, `#424242` on the dark surface)
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
- **Color sidebar icons** — builds **Papirus-Light-Glow** and
  **Papirus-Dark-Glow**, themes that inherit Papirus-Light and Papirus-Dark
  and replace the monochrome sidebar icons of Nemo and Files (folders, trash,
  drives) with color ones. Dialog icons stay monochrome. The one of the
  current style is activated; the dark one draws its monochrome icons in
  light gray, for the dark theme. The themes need `python3-gi`: without it,
  the module falls back to Papirus-Light and Papirus-Dark.
- **Favorites star** — Nemo's Favorites gets the yellow Papirus bookmark star
  instead of a dark one
- **Tray icons** — a cleaner eject icon (rounded triangle and bar, sharp at
  16px); a blue clipboard for CopyQ instead of its scissors; Insync's icon in
  Dodger Blue with a status badge at the bottom left: green check when
  synced, blue arrow while syncing, amber bars when paused, gray cross when
  offline, red "!" on errors
- **Wi-Fi and volume icons in the style of Windows 11** — the same theme
  replaces the top bar's Wi-Fi icons (a fan of arcs, with the levels not
  reached shown faint) and volume icons (a speaker with one to three waves,
  a cross when muted). They are symbolic, so they take the panel's text color
- Folders are yellow in the light and in the dark variant alike

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

## Light and dark

Glow has a light and a dark version, and the desktop's style chooses
between them: **Settings → Appearance → Style**, the **Dark Style** toggle
in the quick settings, or **Zorin Appearance → Light / Dark**. All three
write the `color-scheme` setting; the Glow extension watches it and, when it
changes, puts the GTK theme (`<Theme>-Glow-Light` or `<Theme>-Glow-Dark`),
the icon theme (`Papirus-Light-Glow` or `Papirus-Dark-Glow`), and the Shell
theme of the new style (`ZorinGrey-Dark` for the dark one on Zorin, neutral
like the GTK copy) in place. The GTK CSS needs no change: it takes its
colors from the theme, so open apps switch with it. Zorin's day and night
schedule works the same way, with the Glow copies as its day and night
themes.

The installer applies the style in use at install time. Without the
extension (only `theme-tweaks` or `yellow-folders` installed), re-run them
after changing the style:

```bash
bash install.sh theme-tweaks
bash install.sh yellow-folders
```

To switch from the terminal:

```bash
gsettings set org.gnome.desktop.interface color-scheme prefer-dark   # dark
gsettings set org.gnome.desktop.interface color-scheme default       # light
```

The dark copy is named after the dark variant of the GTK theme in use
(`ZorinBlue-Glow-Dark` for `ZorinBlue-Light`, the name Zorin's toggle
expects) and built from `ZorinGrey-Dark` on Zorin, or from that variant
elsewhere; with a theme that has no dark variant installed, Glow stays
light.

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
- Creates `~/.themes/<Theme>-Glow-Light/` and `~/.themes/<Theme>-Glow-Dark/`
  (copies of the two variants of the theme, about 1.6 MB each) and sets the
  one of the current style as the GTK theme (also as the Zorin day and night
  themes, when present)
- State file in `~/.config/glow/theme-tweaks.state` (used by `--remove` and
  by the extension when the style changes)
- On Zorin OS, sets `org.gnome.shell.extensions.zorin-taskbar panel-size` to
  42; the previous value is saved in `~/.config/glow/taskbar.state`

### yellow-folders
- `apt install papirus-icon-theme`
- `wget` install of `papirus-folders` to `/usr/local/bin`
- Modifies small-size folder SVGs in
  `/usr/share/icons/Papirus{,-Light,-Dark}/<size>/places/` (full backup at
  `/usr/share/icons/_glow-colorize-backup/`)
- Creates the `Papirus-Light-Glow` and `Papirus-Dark-Glow` themes in
  `~/.local/share/icons/`
- Changes `gsettings` `icon-theme` on GNOME and Cinnamon schemas
- State file in `~/.config/glow/yellow-folders.state` (used by `--remove` and
  by the extension when the style changes)

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
    cornerRadius: 12,            // the glow's corners, see below
    windowCornerRadius: 12,      // the windows' corners, 0 for square
    fadeMs: 180,
    followMove: true,
    // ...
    batteryTooltip: true,        // remaining time on hover
    batteryIcon: true,           // false: keep the stock battery icon
    batteryPercentInside: true,
    batteryFont: 'Inter Bold',
    batteryIconWidth: 34,
    batteryIconHeight: 17,
};
```

The changes apply after you reload the extension: log out and back in, or
on X11 press **Alt+F2**, type `r`, and press **Enter**.

### Rounded corners
Every window gets the same 12px corners, the radius of libadwaita:
theme-tweaks sets it on GTK 3 and GTK 4 windows and on the frames drawn by
the window manager, which round the top corners only and leave the bottom
ones to the application; `windowCornerRadius` in `extension.js` rounds those
bottom corners in the compositor, with a small shader that clears the corners
of the window's frame and leaves shadows alone. `cornerRadius` gives the glow
the same curve. Maximized, tiled, and fullscreen windows stay square.

For a desktop with square windows, install theme-tweaks with
`GLOW_SQUARE_CORNERS=1 bash install.sh theme-tweaks` and set both
`cornerRadius` and `windowCornerRadius` to 0.

Open apps pick up the corners when you restart them; the frames drawn by the
window manager change after you log out and back in.

### Accent color
Change `glow_accent_color` at the top of `assets/css/gtk4.css` and
`assets/css/gtk3.css` and `ACCENT` in `modules/theme-tweaks.sh`, then re-run
`bash install.sh theme-tweaks`. The module writes the title bar tint and the
selection, light and dark, into the `-Glow-` theme copies, mixed from
`ACCENT` at the percentages set next to it, with white text on a selection
darker than mid-grey and the theme's text color on a paler one.

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
- **GTK4 apps on a vanilla GNOME** — libadwaita there ignores the GTK theme,
  so the `-Glow-` theme copies and the title bar tint do not reach them; the
  CSS in `~/.config/gtk-4.0/gtk.css` still does. Zorin OS patches libadwaita
  to follow the GTK theme, so everything applies

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
│   └── icons/             ← build-theme.py (Papirus-Light-Glow, Papirus-Dark-Glow)
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
- Papirus-Light-Glow and Papirus-Dark-Glow themes deleted
- Previous icon theme restored (read from state file)
- CSS blocks removed (preserving any other user CSS)
- GNOME Shell extension disabled and deleted

After logout / login, you are exactly where you were before the install.
