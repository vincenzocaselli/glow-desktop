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

# Zorin's tray in compact mode sets an inline padding on every icon,
# which overrides the tighter spacing in stylesheet.css.
TRAY_SCHEMA="org.gnome.shell.extensions.zorin-appindicator"
TRAY_STATE="$HOME/.config/glow/tray.state"

set_tray_compact_off() {
    gsettings list-schemas 2>/dev/null | grep -qx "$TRAY_SCHEMA" || return 0
    if [[ ! -f "$TRAY_STATE" ]]; then
        mkdir -p "$(dirname "$TRAY_STATE")"
        gsettings get "$TRAY_SCHEMA" compact-mode-enabled > "$TRAY_STATE"
    fi
    gsettings set "$TRAY_SCHEMA" compact-mode-enabled false
    ok "Zorin tray: compact mode off (Glow's tighter spacing applies)"
}

restore_tray_compact() {
    [[ -f "$TRAY_STATE" ]] || return 0
    gsettings set "$TRAY_SCHEMA" compact-mode-enabled "$(cat "$TRAY_STATE")" 2>/dev/null || true
    rm -f "$TRAY_STATE"
}

cmd="${1:-install}"

case "$cmd" in
    install)
        step "focus-glow: installing GNOME Shell extension"

        rm -rf "$EXT_DIR"
        mkdir -p "$EXT_DIR"
        cp "$SRC_DIR/extension.js"  "$EXT_DIR/extension.js"
        cp "$SRC_DIR/metadata.json" "$EXT_DIR/metadata.json"
        cp "$SRC_DIR/stylesheet.css" "$EXT_DIR/stylesheet.css"
        ok "Extension files copied → $EXT_DIR"
        set_tray_compact_off

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
        restore_tray_compact
        ok "Extension removed"
        ;;
    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
