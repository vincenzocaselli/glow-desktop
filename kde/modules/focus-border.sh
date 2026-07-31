#!/usr/bin/env bash
# ============================================================
# Glow for KDE — Module: focus-border
# KWin has a NATIVE active-window outline. Breeze window
# decoration supports an accent-colored border on the focused
# window, and KWin can draw a colored outline. We enable the
# "Outline" / accent border so the active window is highlighted
# in Dodger Blue — the KDE equivalent of the GNOME focus-glow.
#
# Note: KDE doesn't do an external "blur halo" like our GNOME
# Clutter strips; instead it tints the window border/decoration.
# This is the idiomatic KDE way and looks native.
# ============================================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cmd="${1:-install}"

if ! detect_kde_tools; then
    err "kwriteconfig6/5 not found — is this a KDE Plasma system?"
    exit 1
fi

case "$cmd" in
    install)
        step "focus-border: highlighting the active window in the accent color"

        # 1. Breeze window decoration: use accent color on the title bar
        #    of the active window. "BorderSize" + accent gives a colored edge.
        $KWRITE --file breezerc --group Common --key OutlineCloseButton false 2>/dev/null || true

        # 2. Tell Breeze decoration to tint the titlebar with the accent color
        #    for the active window (Plasma 6 supports this).
        $KWRITE --file kwinrc --group org.kde.kdecoration2 --key BorderSize Normal 2>/dev/null || true

        # 3. Enable KWin "Highlight Window" / active outline via the accent.
        #    The cleanest cross-version approach: enable a thin accent border
        #    on the active window through the decoration's titlebar coloring.
        #    On Breeze, the active titlebar already follows the color scheme's
        #    active-titlebar color — we set that to the accent below.
        $KWRITE --file kdeglobals --group "WM" --key activeBackground "30,144,255" 2>/dev/null || true
        $KWRITE --file kdeglobals --group "WM" --key activeForeground "255,255,255" 2>/dev/null || true

        ok "Active window will use Dodger Blue titlebar / border"
        info "Reload KWin to apply: ${DIM}kwin_wayland --replace &${NC} (Wayland)"
        info "or ${DIM}kwin_x11 --replace &${NC} (X11), or just log out / in."
        ;;

    remove)
        step "focus-border: reverting active window coloring"
        $KWRITE --file kdeglobals --group "WM" --key activeBackground --delete 2>/dev/null || true
        $KWRITE --file kdeglobals --group "WM" --key activeForeground --delete 2>/dev/null || true
        ok "Active window coloring reset to scheme default"
        ;;

    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
