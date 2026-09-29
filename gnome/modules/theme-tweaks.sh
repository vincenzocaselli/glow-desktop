#!/usr/bin/env bash
# ============================================================
# Glow — Module: theme-tweaks
# Installs GTK3 and GTK4 CSS overrides: square corners + Dodger
# Blue accent. Uses a marked block inside gtk.css so other user
# CSS is preserved on install / remove.
#
# Also activates <theme>-Glow, a GTK theme that imports the current
# one and changes only its selection colors. Toolkits that read the
# theme file instead of gtk.css (Eclipse / SWT) then paint the same
# glass selection as GTK apps.
# ============================================================

set -euo pipefail

GTK4_DIR="$HOME/.config/gtk-4.0"
GTK3_DIR="$HOME/.config/gtk-3.0"
GTK4_FILE="$GTK4_DIR/gtk.css"
GTK3_FILE="$GTK3_DIR/gtk.css"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../assets/css" && pwd)"
GTK4_SRC="$SRC_DIR/gtk4.css"
GTK3_SRC="$SRC_DIR/gtk3.css"

STATE_FILE="$HOME/.config/glow/theme-tweaks.state"
GLOW_SUFFIX="-Glow"
# The glass selection (Dodger Blue at 50%) over a white background,
# as an opaque color: SWT cannot use translucent colors.
SELECTION_BG="#8fc8ff"

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

find_theme_dir() {
    local name="$1" dir
    for dir in "$HOME/.themes/$name" "$HOME/.local/share/themes/$name" "/usr/share/themes/$name"; do
        [[ -d "$dir/gtk-3.0" ]] && { echo "$dir"; return 0; }
    done
    return 1
}

state_get() {
    grep "^$1=" "$STATE_FILE" 2>/dev/null | cut -d= -f2- | tr -d "'" || true
}

zorin_day_theme() {
    gsettings get com.zorin.desktop.auto-theme day-theme 2>/dev/null | tr -d "'" || true
}

build_derived_theme() {
    local base="$1" base_dir="$2" dir="$3" fg
    fg=$(grep -m1 -oP '@define-color theme_fg_color\s+\K#[0-9a-fA-F]{3,6}' "$base_dir/gtk-3.0/gtk.css" 2>/dev/null || true)
    fg="${fg:-#2e3436}"

    rm -rf "$dir"
    mkdir -p "$dir/gtk-3.0"
    if [[ -f "$base_dir/index.theme" ]]; then
        sed -e "s/^Name=.*/Name=$base$GLOW_SUFFIX/" \
            -e "s/^GtkTheme=.*/GtkTheme=$base$GLOW_SUFFIX/" \
            "$base_dir/index.theme" > "$dir/index.theme"
    fi
    [[ -d "$base_dir/gtk-2.0" ]] && ln -s "$base_dir/gtk-2.0" "$dir/gtk-2.0"

    cat > "$dir/gtk-3.0/gtk.css" <<CSS
/* Glow: $base with the glass selection as opaque named colors.
   SWT (Eclipse) reads these from the theme file, not from gtk.css. */
@import url("$base_dir/gtk-3.0/gtk.css");

@define-color theme_selected_bg_color $SELECTION_BG;
@define-color theme_selected_fg_color $fg;
@define-color theme_unfocused_selected_bg_color $SELECTION_BG;
@define-color theme_unfocused_selected_fg_color $fg;
CSS
    [[ -f "$base_dir/gtk-3.0/gtk-dark.css" ]] && \
        echo "@import url(\"$base_dir/gtk-3.0/gtk-dark.css\");" > "$dir/gtk-3.0/gtk-dark.css"

    if [[ -d "$base_dir/gtk-4.0" ]]; then
        mkdir -p "$dir/gtk-4.0"
        local f
        for f in gtk.css gtk-dark.css; do
            [[ -f "$base_dir/gtk-4.0/$f" ]] && \
                echo "@import url(\"$base_dir/gtk-4.0/$f\");" > "$dir/gtk-4.0/$f"
        done
    fi
}

install_derived_theme() {
    local current base base_dir dir
    current=$(gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null | tr -d "'" || true)
    base=$(state_get base)
    [[ -n "$base" ]] || base="${current%"$GLOW_SUFFIX"}"
    if [[ -z "$base" ]] || ! base_dir=$(find_theme_dir "$base"); then
        warn "GTK theme '$base' not found; Eclipse keeps the theme's selection colors"
        return 0
    fi
    dir="$HOME/.themes/$base$GLOW_SUFFIX"
    build_derived_theme "$base" "$base_dir" "$dir"

    if [[ ! -f "$STATE_FILE" ]]; then
        mkdir -p "$(dirname "$STATE_FILE")"
        {
            echo "base='$base'"
            # A theme already switched to -Glow by hand restores to its base.
            echo "previous_gtk_theme='${current%"$GLOW_SUFFIX"}'"
            local day
            day=$(zorin_day_theme)
            echo "previous_zorin_day_theme='${day%"$GLOW_SUFFIX"}'"
        } > "$STATE_FILE"
    fi

    gsettings set org.gnome.desktop.interface gtk-theme "$base$GLOW_SUFFIX"
    # Zorin's day / night switch would put the plain theme back.
    if [[ "$(zorin_day_theme)" == "$base" || "$(zorin_day_theme)" == "$base$GLOW_SUFFIX" ]]; then
        gsettings set com.zorin.desktop.auto-theme day-theme "$base$GLOW_SUFFIX"
    fi
    ok "GTK theme → $base$GLOW_SUFFIX (selection colors for Eclipse / SWT)"
}

remove_derived_theme() {
    local base prev_gtk prev_day
    base=$(state_get base)
    prev_gtk=$(state_get previous_gtk_theme)
    prev_day=$(state_get previous_zorin_day_theme)
    if [[ -z "$base" ]]; then
        info "No derived GTK theme to remove"
        return 0
    fi
    [[ -n "$prev_gtk" ]] && gsettings set org.gnome.desktop.interface gtk-theme "$prev_gtk"
    if [[ -n "$prev_day" ]]; then
        gsettings set com.zorin.desktop.auto-theme day-theme "$prev_day" 2>/dev/null || true
    fi
    rm -rf "$HOME/.themes/$base$GLOW_SUFFIX"
    rm -f "$STATE_FILE"
    ok "GTK theme restored to ${prev_gtk:-default}"
}

cmd="${1:-install}"

case "$cmd" in
    install)
        step "theme-tweaks: GTK4 + GTK3 CSS overrides"
        append_block "$GTK4_FILE" "$GTK4_SRC"
        ok "GTK4 → $GTK4_FILE"
        append_block "$GTK3_FILE" "$GTK3_SRC"
        ok "GTK3 → $GTK3_FILE"
        install_derived_theme
        ;;
    remove)
        step "theme-tweaks: removing CSS overrides"
        remove_block "$GTK4_FILE"
        ok "Cleaned $GTK4_FILE"
        remove_block "$GTK3_FILE"
        ok "Cleaned $GTK3_FILE"
        remove_derived_theme
        ;;
    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
