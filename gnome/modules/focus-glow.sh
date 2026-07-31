#!/usr/bin/env bash
# ============================================================
# Glow — Module: focus-glow
# Installs the GNOME Shell extension that draws a colored aura
# around the currently focused window.
# ============================================================

set -euo pipefail

UUID="glow@nebula.local"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../assets/extension" && pwd)"

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cmd="${1:-install}"

case "$cmd" in
    install)
        step "focus-glow: installing GNOME Shell extension"

        rm -rf "$EXT_DIR"
        mkdir -p "$EXT_DIR"
        cp "$SRC_DIR/extension.js"  "$EXT_DIR/extension.js"
        cp "$SRC_DIR/metadata.json" "$EXT_DIR/metadata.json"
        ok "Extension files copied → $EXT_DIR"

        if command -v gnome-extensions &>/dev/null; then
            if gnome-extensions enable "$UUID" 2>/dev/null; then
                ok "Extension enabled"
            else
                info "Extension will be enabled after logout / login"
            fi
        fi
        ;;
    remove)
        step "focus-glow: removing"
        if command -v gnome-extensions &>/dev/null; then
            gnome-extensions disable "$UUID" 2>/dev/null || true
        fi
        rm -rf "$EXT_DIR"
        ok "Extension removed"
        ;;
    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
