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
}


def write_status_icons(dest):
    out_dir = os.path.join(dest, "symbolic", "status")
    os.makedirs(out_dir, exist_ok=True)
    for name, content in STATUS_ICONS.items():
        with open(os.path.join(out_dir, name + ".svg"), "w") as f:
            f.write(content)
    return len(STATUS_ICONS)


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
