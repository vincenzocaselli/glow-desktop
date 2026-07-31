#!/usr/bin/env bash
# ============================================================
# Glow — Module: theme-tweaks
# Installs GTK3 and GTK4 CSS overrides: square corners + Dodger
# Blue accent. Uses a marked block inside gtk.css so other user
# CSS is preserved on install / remove.
# ============================================================

set -euo pipefail

GTK4_DIR="$HOME/.config/gtk-4.0"
GTK3_DIR="$HOME/.config/gtk-3.0"
GTK4_FILE="$GTK4_DIR/gtk.css"
GTK3_FILE="$GTK3_DIR/gtk.css"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../assets/css" && pwd)"
GTK4_SRC="$SRC_DIR/gtk4.css"
GTK3_SRC="$SRC_DIR/gtk3.css"

MARK_START="/* === GLOW START === */"
MARK_END="/* === GLOW END === */"

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

remove_block() {
    local file="$1"
    [[ -f "$file" ]] || return 0
    local tmp
    tmp=$(mktemp)
    awk -v s="$MARK_START" -v e="$MARK_END" '
        $0 == s { skip=1; next }
        $0 == e { skip=0; next }
        !skip { print }
    ' "$file" > "$tmp"
    sed -i -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}' "$tmp"
    if [[ -s "$tmp" ]]; then
        mv "$tmp" "$file"
    else
        rm -f "$file" "$tmp"
    fi
}

append_block() {
    local file="$1"
    local src="$2"
    mkdir -p "$(dirname "$file")"
    remove_block "$file"
    {
        [[ -f "$file" && -s "$file" ]] && echo ""
        echo "$MARK_START"
        cat "$src"
        echo "$MARK_END"
    } >> "$file"
}

cmd="${1:-install}"

case "$cmd" in
    install)
        step "theme-tweaks: GTK4 + GTK3 CSS overrides"
        append_block "$GTK4_FILE" "$GTK4_SRC"
        ok "GTK4 → $GTK4_FILE"
        append_block "$GTK3_FILE" "$GTK3_SRC"
        ok "GTK3 → $GTK3_FILE"
        ;;
    remove)
        step "theme-tweaks: removing CSS overrides"
        remove_block "$GTK4_FILE"
        ok "Cleaned $GTK4_FILE"
        remove_block "$GTK3_FILE"
        ok "Cleaned $GTK3_FILE"
        ;;
    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
