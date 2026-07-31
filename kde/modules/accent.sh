#!/usr/bin/env bash
# ============================================================
# Glow for KDE — Module: accent
# Sets the global accent color to Dodger Blue (#1e90ff) using
# Plasma's NATIVE accent system. This covers selections, checked
# states, sliders, focused elements, folder-icon tint, etc. —
# everywhere, automatically. No CSS hacks needed (unlike GNOME).
#
# On KDE the accent color is a first-class setting, so this is
# the single cleanest part of the whole port.
# ============================================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

ACCENT="30,144,255"   # Dodger Blue in R,G,B (KDE stores accent as decimal RGB)

cmd="${1:-install}"

if ! detect_kde_tools; then
    err "kwriteconfig6/5 not found — is this a KDE Plasma system?"
    exit 1
fi

case "$cmd" in
    install)
        step "accent: setting Dodger Blue as the global accent color"

        # AccentColor lives in kdeglobals [General]. Setting it makes
        # Plasma use a custom accent (overrides scheme-default accent).
        $KWRITE --file kdeglobals --group General --key AccentColor "$ACCENT"
        ok "Accent color set to Dodger Blue ($ACCENT)"

        # Optionally tint all colors slightly with the accent for a more
        # cohesive look (comment out if too much). Off by default to stay subtle.
        # $KWRITE --file kdeglobals --group General --key accentColorFromWallpaper false

        info "Some running apps may need a restart to pick up the new accent."
        info "Plasma shell itself updates live or after: ${DIM}plasmashell --replace &${NC}"
        ;;

    remove)
        step "accent: reverting accent color to scheme default"
        # Deleting the key returns to 'From current color scheme'
        $KWRITE --file kdeglobals --group General --key AccentColor --delete 2>/dev/null || true
        ok "Accent color reset"
        ;;

    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
