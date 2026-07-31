#!/usr/bin/env bash
# ============================================================
# Glow for KDE — Module: square-corners
# KWin rounds window corners by default in Plasma 6. This module
# disables the rounded-corners effect so windows have sharp 90°
# corners, matching the GNOME "square corners" tweak.
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
        step "square-corners: disabling rounded window corners"

        # Plasma 6 draws rounded corners via a KWin effect. Setting the
        # corner radius to 0 in the Breeze decoration squares them off.
        # The key lives in breezerc; 0 = perfectly square.
        $KWRITE --file breezerc --group Common --key CornerRadius 0 2>/dev/null || true

        # Some Plasma builds also expose a separate rounded-corners KWin
        # effect; disable it if present.
        $KWRITE --file kwinrc --group Plugins --key roundedcornersEnabled false 2>/dev/null || true

        ok "Window corners set to square (radius 0)"
        info "Reload KWin or log out / in to apply."
        ;;

    remove)
        step "square-corners: restoring rounded corners"
        $KWRITE --file breezerc --group Common --key CornerRadius --delete 2>/dev/null || true
        $KWRITE --file kwinrc --group Plugins --key roundedcornersEnabled --delete 2>/dev/null || true
        ok "Rounded corners restored (Breeze default)"
        ;;

    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
