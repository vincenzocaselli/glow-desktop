#!/usr/bin/env bash
# ============================================================
# Glow — Module: nemo-zoom
# Sets Nemo's default zoom level to "smaller" on all three views
# (icon, list, compact) for a compact, consistent layout where
# the content area font size matches the sidebar / menu.
#
# Also clears the per-folder metadata cache that Nemo accumulates
# over time (file managers remember zoom per visited folder), so
# previously-visited folders don't keep stale "large" overrides.
#
# Reversible: --remove resets all three zoom levels to their schema
# defaults (which is what Nemo / Zorin ship with out of the box).
# ============================================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

# Files where Nemo stores per-folder view metadata
GVFS_METADATA="$HOME/.local/share/gvfs-metadata"

cmd="${1:-install}"

case "$cmd" in
    install)
        step "nemo-zoom: setting compact default zoom levels for Nemo"

        if ! command -v nemo &>/dev/null; then
            warn "Nemo is not installed on this system — skipping."
            exit 0
        fi

        # Set the three zoom defaults to "smaller"
        gsettings set org.nemo.icon-view    default-zoom-level 'smaller'
        gsettings set org.nemo.list-view    default-zoom-level 'smaller'
        gsettings set org.nemo.compact-view default-zoom-level 'smaller'
        ok "Default zoom levels set to 'smaller' (icon / list / compact views)"

        # Clear stale per-folder metadata so previously-visited folders
        # don't keep their old (likely larger) zoom overrides
        info "Clearing per-folder metadata cache..."
        killall nemo nemo-desktop 2>/dev/null || true
        sleep 1
        if [[ -d "$GVFS_METADATA" ]]; then
            rm -rf "$GVFS_METADATA"/* 2>/dev/null || true
            ok "Cleared $GVFS_METADATA"
        fi
        ;;

    remove)
        step "nemo-zoom: resetting Nemo zoom levels to schema defaults"
        gsettings reset org.nemo.icon-view    default-zoom-level 2>/dev/null || true
        gsettings reset org.nemo.list-view    default-zoom-level 2>/dev/null || true
        gsettings reset org.nemo.compact-view default-zoom-level 2>/dev/null || true
        ok "Zoom defaults reset"
        info "Per-folder metadata is NOT touched on remove (your saved per-folder zooms are kept)."
        ;;

    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
