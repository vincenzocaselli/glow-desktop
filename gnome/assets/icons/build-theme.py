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
    ],
    "status": ["folder-open", "starred", "user-trash-full"],
}

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
            path = find_source(src, ctx, name)
            if path is None:
                print(f"skipped {name}: no source icon", file=sys.stderr)
                continue
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(path, SIZE, SIZE)
            pixbuf.savev(os.path.join(out_dir, name + "-symbolic.png"), "png", [], [])
            written += 1

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
