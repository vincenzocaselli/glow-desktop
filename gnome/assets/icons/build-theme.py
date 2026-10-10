#!/usr/bin/env python3
# ============================================================
# Glow — builds the Papirus-Light-Glow icon theme
#
# Papirus serves the sidebar icons of Nemo and Files as
# symbolic (monochrome) SVGs. This theme inherits Papirus-Light
# and overrides those names with color PNGs rendered from the
# Papirus 24x24 icons, so folders stay yellow in the sidebar too.
#
# The PNG format matters: GTK recolors any file named
# *-symbolic.svg, but draws *-symbolic.png as a plain image.
# The directories are Scalable so that GTK 4 picks these files
# over the scalable SVGs of the parent theme.
#
# Usage: build-theme.py DEST_DIR SOURCE_DIR
#   DEST_DIR    theme directory to create (replaced if present)
#   SOURCE_DIR  Papirus size directory, e.g. .../Papirus-Light/24x24
# ============================================================

import math
import os
import shutil
import sys

import gi

gi.require_version("GdkPixbuf", "2.0")
from gi.repository import GdkPixbuf

SIZE = 24

# Symbolic names shown in the Nemo and Files sidebars, by context.
# Dialog icons (errors, warnings, passwords) stay monochrome.
ICONS = {
    "actions": ["document-open-recent"],
    "devices": [
        "computer", "drive-harddisk", "drive-optical",
        "drive-removable-media", "media-optical", "media-removable",
    ],
    "places": [
        "folder", "folder-documents", "folder-download", "folder-music",
        "folder-open", "folder-pictures", "folder-publicshare",
        "folder-templates", "folder-videos", "network-workgroup",
        "user-desktop", "user-home", "user-trash", "user-trash-full",
        "xapp-user-favorites",
    ],
    "status": ["folder-open", "starred", "user-trash-full"],
}

# Names drawn from a Papirus icon with a different name. Nemo shows
# Favorites with xapp-user-favorites-symbolic, which Papirus lacks, so
# it falls back to a dark hicolor star; the yellow Papirus bookmark
# star matches the yellow folders.
SOURCE_NAMES = {"xapp-user-favorites": "user-bookmarks"}

INDEX_HEAD = """[Icon Theme]
Name=Papirus-Light-Glow
Comment=Papirus-Light with color sidebar icons (Glow)
Inherits=Papirus-Light,breeze,hicolor
Directories={dirs}
"""

INDEX_DIR = """
[symbolic/{ctx}]
Context={context}
Size=16
MinSize=8
MaxSize=512
Type=Scalable
"""


# ---------- Wi-Fi and volume icons in the style of Windows 11 ----------
# Drawn here as 16x16 symbolic SVGs, so the top bar recolors them with
# the panel's text color. The shell's stylesheet for symbolic icons
# forces the fill color, so every shape is a filled path, never a
# stroke; levels not reached are the same shapes at low opacity.

DIM = 0.3


def band(cx, cy, r_in, r_out, a0, a1):
    """Annular sector from angle a0 to a1 (degrees, 0 = right, clockwise
    as y grows downward), with round ends."""
    cap = (r_out - r_in) / 2

    def pt(r, a):
        t = math.radians(a)
        return cx + r * math.cos(t), cy + r * math.sin(t)

    large = 1 if a1 - a0 > 180 else 0
    o0, o1 = pt(r_out, a0), pt(r_out, a1)
    i1, i0 = pt(r_in, a1), pt(r_in, a0)
    return (f"M{o0[0]:.2f},{o0[1]:.2f} "
            f"A{r_out},{r_out} 0 {large} 1 {o1[0]:.2f},{o1[1]:.2f} "
            f"A{cap},{cap} 0 0 1 {i1[0]:.2f},{i1[1]:.2f} "
            f"A{r_in},{r_in} 0 {large} 0 {i0[0]:.2f},{i0[1]:.2f} "
            f"A{cap},{cap} 0 0 1 {o0[0]:.2f},{o0[1]:.2f} Z")


def sector(cx, cy, r, a0, a1):
    """Pie slice, the dot at the base of the Wi-Fi fan."""
    t0, t1 = math.radians(a0), math.radians(a1)
    x0, y0 = cx + r * math.cos(t0), cy + r * math.sin(t0)
    x1, y1 = cx + r * math.cos(t1), cy + r * math.sin(t1)
    return (f"M{cx},{cy} L{x0:.2f},{y0:.2f} "
            f"A{r},{r} 0 0 1 {x1:.2f},{y1:.2f} Z")


def bar(cx, cy, length, width, angle):
    """Rounded bar centered on (cx, cy), rotated by angle degrees."""
    return (f'<rect x="{cx - length / 2:.2f}" y="{cy - width / 2:.2f}" '
            f'width="{length}" height="{width}" rx="{width / 2}" '
            f'transform="rotate({angle} {cx} {cy})"/>')


def svg(*shapes):
    body = "\n  ".join(shapes)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" '
            f'viewBox="0 0 16 16">\n  {body}\n</svg>\n')


def path(d, on=True):
    return f'<path d="{d}"/>' if on else f'<path d="{d}" opacity="{DIM}"/>'


# Wi-Fi: a 90-degree fan pointing up, a dot and three arcs.
WIFI_C = (8, 14.2)
WIFI_SHAPES = [
    sector(*WIFI_C, 2.6, -135, -45),
    band(*WIFI_C, 3.9, 5.5, -135, -45),
    band(*WIFI_C, 6.7, 8.3, -135, -45),
    band(*WIFI_C, 9.5, 11.1, -135, -45),
]


def wifi(level, extra=()):
    return svg(*(path(d, i < level) for i, d in enumerate(WIFI_SHAPES)), *extra)


# Volume: a speaker and up to three waves on its right.
SPEAKER = ("M1.5,6 H4 L7.6,2.8 A0.6,0.6 0 0 1 8.6,3.25 V12.75 "
           "A0.6,0.6 0 0 1 7.6,13.2 L4,10 H1.5 A0.5,0.5 0 0 1 1,9.5 "
           "V6.5 A0.5,0.5 0 0 1 1.5,6 Z")
WAVES = [band(8.6, 8, r, r + 1.3, -50, 50) for r in (2.0, 4.0, 6.0)]


def volume(level):
    return svg(path(SPEAKER), *(path(d) for d in WAVES[:level]))


SLASH = bar(8, 8, 17, 1.4, 45)

# Eject: a triangle with rounded corners above a bar with round ends.
EJECT = svg(
    # Aligned to the 16px grid: whole-pixel base and a 2px bar stay sharp.
    path("M7.2,3.1 Q8,2.2 8.8,3.1 L13.3,8.1 Q14,9 12.8,9 "
         "H3.2 Q2,9 2.7,8.1 Z"),
    '<rect x="2" y="11" width="12" height="2" rx="1"/>',
)

STATUS_ICONS = {
    "network-wireless-signal-excellent-symbolic": wifi(4),
    "network-wireless-signal-good-symbolic": wifi(3),
    "network-wireless-signal-ok-symbolic": wifi(2),
    "network-wireless-signal-weak-symbolic": wifi(1),
    "network-wireless-signal-none-symbolic": wifi(0),
    "network-wireless-symbolic": wifi(4),
    "network-wireless-connected-symbolic": wifi(4),
    "network-wireless-acquiring-symbolic": wifi(1),
    "network-wireless-no-route-symbolic": wifi(0, [
        bar(13.5, 9.6, 4, 1.4, 90), '<circle cx="13.5" cy="13.6" r="0.8"/>']),
    "network-wireless-offline-symbolic": wifi(0, [SLASH]),
    "network-wireless-disabled-symbolic": wifi(0, [SLASH]),
    "audio-volume-muted-symbolic": svg(path(SPEAKER),
                                       bar(12.6, 8, 5.6, 1.4, 45),
                                       bar(12.6, 8, 5.6, 1.4, -45)),
    "audio-volume-low-symbolic": volume(1),
    "audio-volume-medium-symbolic": volume(2),
    "audio-volume-high-symbolic": volume(3),
    "audio-volume-overamplified-symbolic": volume(3),
    "media-eject-symbolic": EJECT,
}


def write_status_icons(dest):
    out_dir = os.path.join(dest, "symbolic", "status")
    os.makedirs(out_dir, exist_ok=True)
    for name, content in STATUS_ICONS.items():
        with open(os.path.join(out_dir, name + ".svg"), "w") as f:
            f.write(content)
    return len(STATUS_ICONS)


# Insync's tray icons, drawn here: the Insync glyph (two arcs and an
# "i") in the Dodger Blue of the focus glow, and a status badge at the
# bottom left whose color tells the state at a glance. They are color
# icons, not symbolic ones, so the panel does not recolor them.
INSYNC_BLUE = "#1e90ff"
INSYNC_GLYPH = (
    f'<path d="M7 14a10 10 0 0 1 10-10" fill="none" stroke="{INSYNC_BLUE}" stroke-width="2"/>'
    f'<path d="M11 14a6 6 0 0 1 6-6" fill="none" stroke="{INSYNC_BLUE}" stroke-width="2"/>'
    f'<rect x="14" y="15" width="3" height="4" fill="{INSYNC_BLUE}"/>'
    f'<circle cx="15.5" cy="12.5" r="1.5" fill="{INSYNC_BLUE}"/>'
)
_W = 'fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'
INSYNC_BADGES = {
    # name: (badge color, white glyph drawn inside a circle at (5.5, 16.5))
    "insync-synced": ("#22a35a", f'<path d="M3.3 16.6l1.5 1.5 3-3.2" {_W}/>'),
    "insync-syncing": ("#1e90ff",
                       f'<path d="M7.6 15.3a2.4 2.4 0 1 0 .2 2.2" {_W}/>'
                       '<path d="M8.4 13.6v2.1h-2.1z" fill="#fff"/>'),
    "insync-paused": ("#e0a000", '<rect x="3.9" y="14.4" width="1.2" height="4.2" fill="#fff"/>'
                                  '<rect x="5.9" y="14.4" width="1.2" height="4.2" fill="#fff"/>'),
    "insync-offline": ("#8a8f98", f'<path d="M4 15l3 3M7 15l-3 3" {_W}/>'),
    "insync-error": ("#e5484d", '<rect x="4.85" y="13.9" width="1.3" height="3.2" rx="0.6" fill="#fff"/>'
                                '<circle cx="5.5" cy="18.6" r="0.75" fill="#fff"/>'),
    "insync-normal": (None, ""),
}
INSYNC_BADGES["insync-alert"] = INSYNC_BADGES["insync-error"]


def insync_svg(color, glyph):
    badge = ""
    if color:
        badge = (f'<circle cx="5.5" cy="16.5" r="5.5" fill="#fff"/>'
                 f'<circle cx="5.5" cy="16.5" r="4.5" fill="{color}"/>{glyph}')
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" '
            f'viewBox="0 0 22 22">{INSYNC_GLYPH}{badge}</svg>\n')


# CopyQ's tray icon: CopyQ looks up "copyq-normal" in the icon theme
# before falling back to its built-in scissors. A blue clipboard.
COPYQ_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">'
    '<rect x="3.5" y="3.5" width="15" height="17" rx="2.5" fill="#1e90ff"/>'
    '<rect x="6" y="6.5" width="10" height="11.5" rx="1" fill="#fff"/>'
    '<rect x="7.5" y="1.5" width="7" height="4" rx="1.5" fill="#123354"/>'
    '<rect x="8" y="9.5" width="6" height="1.4" rx=".7" fill="#1e90ff"/>'
    '<rect x="8" y="12.3" width="6" height="1.4" rx=".7" fill="#8fc8ff"/>'
    '<rect x="8" y="15.1" width="4" height="1.4" rx=".7" fill="#8fc8ff"/>'
    '</svg>\n'
)


def write_app_tray_icons(dest):
    out_dir = os.path.join(dest, "symbolic", "status")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "copyq-normal.svg"), "w") as f:
        f.write(COPYQ_SVG)
    return 1


def write_insync_icons(dest, src):
    out_dir = os.path.join(dest, "symbolic", "status")
    os.makedirs(out_dir, exist_ok=True)
    for name, (color, glyph) in INSYNC_BADGES.items():
        with open(os.path.join(out_dir, name + ".svg"), "w") as f:
            f.write(insync_svg(color, glyph))
    return len(INSYNC_BADGES)


def find_source(src, ctx, name):
    for c in (ctx, "places", "actions", "devices", "status"):
        path = os.path.join(src, c, name + ".svg")
        if os.path.exists(path):
            return path
    return None


def main(dest, src):
    if os.path.isdir(dest):
        shutil.rmtree(dest)

    written = 0
    for ctx, names in ICONS.items():
        out_dir = os.path.join(dest, "symbolic", ctx)
        os.makedirs(out_dir)
        for name in names:
            path = find_source(src, ctx, SOURCE_NAMES.get(name, name))
            if path is None:
                print(f"skipped {name}: no source icon", file=sys.stderr)
                continue
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(path, SIZE, SIZE)
            pixbuf.savev(os.path.join(out_dir, name + "-symbolic.png"), "png", [], [])
            written += 1

    written += write_status_icons(dest)
    written += write_insync_icons(dest, src)
    written += write_app_tray_icons(dest)

    dirs = [f"symbolic/{ctx}" for ctx in ICONS]
    with open(os.path.join(dest, "index.theme"), "w") as f:
        f.write(INDEX_HEAD.format(dirs=",".join(dirs)))
        for ctx in ICONS:
            f.write(INDEX_DIR.format(ctx=ctx, context=ctx.capitalize()))

    print(written)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: build-theme.py DEST_DIR SOURCE_DIR")
    main(sys.argv[1], sys.argv[2])
