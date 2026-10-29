#!/usr/bin/env bash
# ============================================================
# Glow — Module: theme-tweaks
# Installs GTK3 and GTK4 CSS overrides: 12px rounded corners
# (square with GLOW_SQUARE_CORNERS=1) + Dodger Blue accent. Uses a
# marked block inside gtk.css so other user CSS is preserved on
# install / remove. The CSS takes its surface and text colors from
# the GTK theme, so the same block serves the light and the dark
# theme and follows a switch between them.
#
# Also builds <Theme>-Glow-Light and <Theme>-Glow-Dark, copies of
# the light and the dark variant of the current GTK theme that
# change only their selection colors. Toolkits that read the theme
# file instead of gtk.css (Eclipse / SWT) then paint the same
# selection as GTK apps. The one that matches the desktop's style
# (Settings > Appearance, or the Dark Style toggle) is activated;
# the Glow extension switches between the two when the style
# changes. On Zorin OS the dark copy is built from ZorinGrey-Dark,
# neutral dark gray with white text as in Windows 11, instead of
# the color variant, whose text and accents are a pale tint;
# GLOW_DARK_THEME=<theme> picks another source.
#
# On Zorin OS it also lowers the taskbar to 42px, so more pinned
# apps fit; --remove restores the previous height.
# ============================================================

set -euo pipefail

GTK4_DIR="$HOME/.config/gtk-4.0"
GTK3_DIR="$HOME/.config/gtk-3.0"
GTK4_FILE="$GTK4_DIR/gtk.css"
GTK3_FILE="$GTK3_DIR/gtk.css"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../assets/css" && pwd)"
GTK4_SRC="$SRC_DIR/gtk4.css"
GTK3_SRC="$SRC_DIR/gtk3.css"
# Extra rules of the rounded mode: 12px corners on GTK 3 and GTK 4 windows,
# window buttons that follow the corners of the frame.
GTK3_ROUND_SRC="$SRC_DIR/gtk3-round.css"
GTK4_ROUND_SRC="$SRC_DIR/gtk4-round.css"
# Window button icons, referenced by the CSS as glow/<name>.svg
ICONS_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../assets/titlebuttons" && pwd)"
ICONS_SUBDIR="glow"

STATE_FILE="$HOME/.config/glow/theme-tweaks.state"
GLOW_SUFFIX="-Glow"

# Glow's tints, written into the theme copies as named colors that the CSS
# in gtk.css reads (glow_titlebar_color, glow_titlebar_fg_color,
# glow_glass_color, glow_selection_color, glow_selection_fg_color): the
# accent over the theme's base color, by style. Light: the accent itself
# (100%) on the title bar and on the selection. Dark: the accent has to
# work against a dark surface, so 80% for both, the same blue on the title
# bar and on the selection (#207bd4). A tint darker than mid-grey gets
# white text, a paler one (25% on white, say) the theme's text color.
ACCENT="#1e90ff"
LIGHT_TITLE_PCT=100
LIGHT_GLASS_PCT=100
DARK_TITLE_PCT=80
DARK_GLASS_PCT=80
# The dark copy lifts the neutral greys of its source: ZorinGrey-Dark's
# #1b1b1b views become #262626 and its #2a2a2a windows #323232, a black
# that is less harsh next to the glow. 0 keeps the source's greys.
DARK_LIFT=11
DARK_WINDOW_LIFT=8
INTERFACE_SCHEMA="org.gnome.desktop.interface"
AUTO_THEME_SCHEMA="com.zorin.desktop.auto-theme"

MARK_START="/* === GLOW START === */"
MARK_END="/* === GLOW END === */"

# Windows get rounded corners, 12px on all four like libadwaita, and the
# extension rounds the bottom ones of framed windows to match. With
# GLOW_SQUARE_CORNERS=1 the CSS squares every window instead; set
# cornerRadius and windowCornerRadius to 0 in extension.js to match.
ROUND_CORNERS=1
[[ "${GLOW_SQUARE_CORNERS:-0}" == "1" ]] && ROUND_CORNERS=0
CORNERS_START="/* GLOW-SQUARE-CORNERS-START"
CORNERS_END="/* GLOW-SQUARE-CORNERS-END"

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

# The CSS source: in the rounded mode without the square-corners part,
# plus the rules that give every window the same 12px corners.
css_source() {
    local src="$1"
    if [[ "$ROUND_CORNERS" == "1" ]]; then
        awk -v s="$CORNERS_START" -v e="$CORNERS_END" '
            index($0, s) == 1 { skip=1; next }
            index($0, e) == 1 { skip=0; next }
            !skip { print }
        ' "$src"
        echo ""
        if [[ "$src" == "$GTK3_SRC" ]]; then
            cat "$GTK3_ROUND_SRC"
        elif [[ "$src" == "$GTK4_SRC" ]]; then
            cat "$GTK4_ROUND_SRC"
        fi
    else
        cat "$src"
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
        css_source "$src"
        echo "$MARK_END"
    } >> "$file"
}

find_theme_dir() {
    local name="$1" dir
    [[ -n "$name" ]] || return 1
    for dir in "$HOME/.themes/$name" "$HOME/.local/share/themes/$name" "/usr/share/themes/$name"; do
        [[ -d "$dir/gtk-3.0" ]] && { echo "$dir"; return 0; }
    done
    return 1
}

state_get() {
    grep "^$1=" "$STATE_FILE" 2>/dev/null | cut -d= -f2- | tr -d "'" || true
}

gsettings_get() {
    gsettings get "$1" "$2" 2>/dev/null | tr -d "'" || true
}

has_schema() {
    gsettings list-schemas 2>/dev/null | grep -x "$1" >/dev/null
}

# Name of the Glow copy of a theme. The variant word stays last: Zorin's
# Dark Style toggle swaps the last word of a Zorin theme name, so from
# ZorinBlue-Glow-Light it lands on ZorinBlue-Glow-Dark, which exists.
derived_name() {
    local base="$1"
    case "$base" in
        *-Light|*-Dark) echo "${base%-*}$GLOW_SUFFIX-${base##*-}" ;;
        *) echo "$base$GLOW_SUFFIX" ;;
    esac
}

# The theme a Glow copy was made from. Also understands the name of the
# copies before 1.2 (<Theme>-Light-Glow).
base_of() {
    local name="$1"
    case "$name" in
        *$GLOW_SUFFIX-Light) echo "${name%"$GLOW_SUFFIX-Light"}-Light" ;;
        *$GLOW_SUFFIX-Dark)  echo "${name%"$GLOW_SUFFIX-Dark"}-Dark" ;;
        *$GLOW_SUFFIX)       echo "${name%"$GLOW_SUFFIX"}" ;;
        *) echo "$name" ;;
    esac
}

is_dark_name() {
    case "$1" in *-Dark|*-dark) return 0 ;; *) return 1 ;; esac
}

# The other variant of a theme, by name: ZorinBlue-Light and ZorinBlue-Dark,
# Adwaita and Adwaita-dark, WhiteSur-Light and WhiteSur-Dark. Nothing when
# it is not installed.
variant_sibling() {
    local base="$1" other
    case "$base" in
        *-Light) other="${base%-Light}-Dark" ;;
        *-Dark)  other="${base%-Dark}-Light" ;;
        *-light) other="${base%-light}-dark" ;;
        *-dark)  other="${base%-dark}-light" ;;
        *)       other="$base-dark" ;;
    esac
    if find_theme_dir "$other" >/dev/null; then
        echo "$other"
        return 0
    fi
    case "$base" in
        *-dark)
            other="${base%-dark}"
            find_theme_dir "$other" >/dev/null && { echo "$other"; return 0; }
            ;;
    esac
    return 1
}

# The theme the dark copy is built from: GLOW_DARK_THEME when set, else
# ZorinGrey-Dark for a Zorin theme (neutral dark gray and white text, as
# in Windows 11; the color variants tint text and accents), else the dark
# variant itself.
dark_source_for() {
    local dark="$1"
    if [[ -n "${GLOW_DARK_THEME:-}" ]] && find_theme_dir "$GLOW_DARK_THEME" >/dev/null; then
        echo "$GLOW_DARK_THEME"
    elif [[ "$dark" == Zorin*-Dark ]] && find_theme_dir "ZorinGrey-Dark" >/dev/null; then
        echo "ZorinGrey-Dark"
    else
        echo "$dark"
    fi
}

# The desktop's style, dark or light, from the color scheme that
# Settings, the Dark Style toggle, and Zorin Appearance set.
current_style() {
    if [[ "$(gsettings_get "$INTERFACE_SCHEMA" color-scheme)" == "prefer-dark" ]]; then
        echo dark
    else
        echo light
    fi
}

# A CSS color as #rrggbb: "white" and #rgb are expanded, anything else
# falls back to white.
hex6() {
    local c="$1"
    case "$c" in
        white) c="#ffffff" ;;
        \#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) c="#${c:1:1}${c:1:1}${c:2:1}${c:2:1}${c:3:1}${c:3:1}" ;;
    esac
    [[ "$c" =~ ^#[0-9a-fA-F]{6}$ ]] && echo "$c" || echo "#ffffff"
}

# mix_hex BG FG PCT: FG at PCT percent over BG, opaque, rounded. The glass
# selection for SWT, which cannot use translucent colors: #8fc8ff on white.
mix_hex() {
    local bg fg pct="$3" r g b
    bg=$(hex6 "$1"); fg=$(hex6 "$2")
    r=$(( (0x${bg:1:2} * (100 - pct) + 0x${fg:1:2} * pct + 50) / 100 ))
    g=$(( (0x${bg:3:2} * (100 - pct) + 0x${fg:3:2} * pct + 50) / 100 ))
    b=$(( (0x${bg:5:2} * (100 - pct) + 0x${fg:5:2} * pct + 50) / 100 ))
    printf '#%02x%02x%02x' "$r" "$g" "$b"
}

# alpha_of PCT: the alpha for alpha(), 0.50 for 50 and 1 for 100.
alpha_of() {
    if [[ "$1" -ge 100 ]]; then echo 1; else printf '0.%02d' "$1"; fi
}

# selection_fg COLOR FG: white when the opaque COLOR is darker than
# mid-grey (perceived luma below 150), else FG, the theme's text color.
# #1e90ff and #207bd4 get white, #8fc8ff and #c7e3ff keep dark text.
selection_fg() {
    local c luma
    c=$(hex6 "$1")
    luma=$(( (299 * 0x${c:1:2} + 587 * 0x${c:3:2} + 114 * 0x${c:5:2}) / 1000 ))
    if [[ "$luma" -lt 150 ]]; then echo "#ffffff"; else echo "$2"; fi
}

# lift_hex COLOR LIFT: a grey (or any color) with every channel moved up
# by LIFT, clamped.
lift_hex() {
    local c r g b
    c=$(hex6 "$1")
    r=$(( 0x${c:1:2} + $2 )); g=$(( 0x${c:3:2} + $2 )); b=$(( 0x${c:5:2} + $2 ))
    printf '#%02x%02x%02x' "$(( r > 255 ? 255 : r ))" "$(( g > 255 ? 255 : g ))" "$(( b > 255 ? 255 : b ))"
}

# lift_greys FILE LIFT WINDOW_FROM WINDOW_LIFT: every neutral grey darker
# than #606060 in FILE (as #rrggbb or rgba) moves up by LIFT; the one
# WINDOW_FROM (the source's window background) by WINDOW_LIFT instead.
# Black stays black: it is the shadows.
lift_greys() {
    local file="$1"
    L="$2" F="$(hex6 "$3")" W="$4" perl -pi -e '
        my ($lift, $from, $wlift) = ($ENV{L}, hex(substr($ENV{F}, 1, 2)), $ENV{W});
        sub up { my $v = shift; return $v if $v == 0 || $v > 0x5f; my $d = ($v == $from) ? $wlift : $lift; my $n = $v + $d; $n > 255 ? 255 : $n }
        s/#([0-9a-f]{2})\1\1\b/sprintf("#%02x%02x%02x", (up(hex($1))) x 3)/ge;
        s/rgba\((\d+), \1, \1,/sprintf("rgba(%d, %d, %d,", (up($1)) x 3)/ge;
    ' "$file"
}

# build_derived_theme SOURCE SOURCE_DIR DEST_DIR NAME STYLE: a copy of the
# SOURCE theme named NAME, with Glow's tints for the light or dark STYLE as
# named colors, and the dark copy's greys lifted.
build_derived_theme() {
    local base="$1" base_dir="$2" dir="$3" name="$4" style="$5"
    local fg bg win sel sel_fg title title_fg selection title_pct glass_pct v f
    fg=$(grep -m1 -oP '@define-color theme_fg_color\s+\K#[0-9a-fA-F]{3,6}' "$base_dir/gtk-3.0/gtk.css" 2>/dev/null || true)
    fg="${fg:-#2e3436}"
    bg=$(hex6 "$(grep -m1 -oP '@define-color theme_base_color\s+\K[^;]+' "$base_dir/gtk-3.0/gtk.css" 2>/dev/null || echo white)")
    win=$(hex6 "$(grep -m1 -oP '@define-color theme_bg_color\s+\K[^;]+' "$base_dir/gtk-3.0/gtk.css" 2>/dev/null || echo white)")
    if [[ "$style" == dark ]]; then
        title_pct="$DARK_TITLE_PCT"; glass_pct="$DARK_GLASS_PCT"
        [[ "$DARK_LIFT" -gt 0 ]] && bg=$(lift_hex "$bg" "$DARK_LIFT")
    else
        title_pct="$LIGHT_TITLE_PCT"; glass_pct="$LIGHT_GLASS_PCT"
    fi
    sel=$(mix_hex "$bg" "$ACCENT" "$glass_pct")
    title=$(mix_hex "$bg" "$ACCENT" "$title_pct")
    selection="alpha($ACCENT, $(alpha_of "$glass_pct"))"
    sel_fg=$(selection_fg "$sel" "$fg")
    title_fg=$(selection_fg "$title" "$fg")

    rm -rf "$dir"
    mkdir -p "$dir"
    if [[ -f "$base_dir/index.theme" ]]; then
        sed -e "s/^Name=.*/Name=$name/" \
            -e "s/^GtkTheme=.*/GtkTheme=$name/" \
            "$base_dir/index.theme" > "$dir/index.theme"
    fi
    # The base theme is copied, not imported by its absolute path: a flatpak
    # app sees ~/.themes through the home directory but not /usr/share/themes,
    # and a failed @import leaves its GTK dialogs without a background.
    for v in gtk-2.0 gtk-3.0 gtk-4.0; do
        [[ -d "$base_dir/$v" ]] && cp -r "$base_dir/$v" "$dir/$v"
    done
    for v in gtk-3.0 gtk-4.0; do
        [[ -f "$dir/$v/gtk.css" ]] || continue
        mv "$dir/$v/gtk.css" "$dir/$v/base.css"
        if [[ -f "$dir/$v/gtk-dark.css" ]]; then
            mv "$dir/$v/gtk-dark.css" "$dir/$v/base-dark.css"
        fi
        if [[ "$style" == dark && "$DARK_LIFT" -gt 0 ]]; then
            for f in "$dir/$v/base.css" "$dir/$v/base-dark.css"; do
                [[ -f "$f" ]] && lift_greys "$f" "$DARK_LIFT" "$win" "$DARK_WINDOW_LIFT"
            done
        fi
        # gtk.css and gtk-dark.css: GTK 4 loads the second one under the
        # dark color scheme, so both carry Glow's names.
        for f in gtk.css gtk-dark.css; do
            [[ "$f" == gtk.css || -f "$dir/$v/base-dark.css" ]] || continue
            cat > "$dir/$v/$f" <<CSS
/* Glow: $base, $style. The tints below are Glow's, read by the rules in
   ~/.config/$v/gtk.css; the selection colors are for SWT (Eclipse), which
   reads them from the theme file and cannot use translucent colors. */
@import url("${f/gtk/base}");

@define-color glow_titlebar_color $title;
@define-color glow_titlebar_fg_color $title_fg;
@define-color glow_glass_color $sel;
@define-color glow_selection_color $selection;
@define-color glow_selection_fg_color $sel_fg;

@define-color theme_selected_bg_color $sel;
@define-color theme_selected_fg_color $sel_fg;
@define-color theme_unfocused_selected_bg_color $sel;
@define-color theme_unfocused_selected_fg_color $sel_fg;
CSS
        done
    done
}

install_derived_theme() {
    local current base base_dir light dark dark_src other dir name style target
    local prev_gtk prev_day prev_night key value
    current=$(gsettings_get "$INTERFACE_SCHEMA" gtk-theme)
    base=$(state_get base)
    [[ -n "$base" ]] || base=$(base_of "$current")
    if [[ -z "$base" ]] || ! base_dir=$(find_theme_dir "$base"); then
        warn "GTK theme '$base' not found; Eclipse keeps the theme's selection colors"
        return 0
    fi

    # The pair: the current theme and its other variant, when installed.
    # The copies take their names from the pair (ZorinBlue-Glow-Light and
    # ZorinBlue-Glow-Dark); the dark one may be built from another theme.
    other=$(variant_sibling "$base" || true)
    if is_dark_name "$base"; then
        dark="$base"; light="$other"
    else
        light="$base"; dark="$other"
    fi
    dark_src=""
    [[ -n "$dark" ]] && dark_src=$(dark_source_for "$dark")

    # Copies named before 1.2, <Theme>-Light-Glow, go away.
    for name in "$light" "$dark"; do
        [[ -n "$name" && -d "$HOME/.themes/$name$GLOW_SUFFIX" ]] && rm -rf "$HOME/.themes/$name$GLOW_SUFFIX"
    done
    if [[ -n "$light" ]]; then
        dir=$(find_theme_dir "$light")
        build_derived_theme "$light" "$dir" "$HOME/.themes/$(derived_name "$light")" "$(derived_name "$light")" light
    fi
    if [[ -n "$dark" ]]; then
        dir=$(find_theme_dir "$dark_src")
        build_derived_theme "$dark_src" "$dir" "$HOME/.themes/$(derived_name "$dark")" "$(derived_name "$dark")" dark
    fi

    # What to put back on --remove: the values before the first install.
    prev_gtk=$(state_get previous_gtk_theme)
    [[ -n "$prev_gtk" ]] || prev_gtk=$(base_of "$current")
    prev_day=$(state_get previous_zorin_day_theme)
    [[ -n "$prev_day" ]] || prev_day=$(base_of "$(gsettings_get "$AUTO_THEME_SCHEMA" day-theme)")
    prev_night=$(state_get previous_zorin_night_theme)
    [[ -n "$prev_night" ]] || prev_night=$(base_of "$(gsettings_get "$AUTO_THEME_SCHEMA" night-theme)")
    mkdir -p "$(dirname "$STATE_FILE")"
    {
        echo "base='$base'"
        echo "light='$light'"
        echo "dark='$dark'"
        echo "gtk_light='${light:+$(derived_name "$light")}'"
        echo "gtk_dark='${dark:+$(derived_name "$dark")}'"
        # The Shell themes of the two styles, for the extension.
        echo "shell_light='$light'"
        echo "shell_dark='$dark_src'"
        echo "previous_gtk_theme='$prev_gtk'"
        echo "previous_zorin_day_theme='$prev_day'"
        echo "previous_zorin_night_theme='$prev_night'"
    } > "$STATE_FILE"

    # The copy that matches the desktop's style; the base when the style's
    # variant is not installed.
    style=$(current_style)
    target="$light"
    [[ "$style" == dark ]] && target="$dark"
    [[ -n "$target" ]] || target="$base"
    # A theme set to the name it already has is not reloaded by open apps:
    # go through the source for a moment, so they pick up the new copy.
    if [[ "$current" == "$(derived_name "$target")" ]]; then
        gsettings set "$INTERFACE_SCHEMA" gtk-theme "$target"
        sleep 0.5
    fi
    gsettings set "$INTERFACE_SCHEMA" gtk-theme "$(derived_name "$target")"
    ok "GTK theme → $(derived_name "$target") (Glow's tints, selection colors for Eclipse / SWT)"
    if [[ -n "$light" && -n "$dark" ]]; then
        info "Light and dark copies: $(derived_name "$light") from $light, $(derived_name "$dark") from $dark_src"
    fi

    # Zorin's day / night switch would put the plain themes back.
    if has_schema "$AUTO_THEME_SCHEMA"; then
        for key in day-theme night-theme; do
            value=$(base_of "$(gsettings_get "$AUTO_THEME_SCHEMA" "$key")")
            [[ -n "$value" && ( "$value" == "$light" || "$value" == "$dark" ) ]] || continue
            gsettings set "$AUTO_THEME_SCHEMA" "$key" "$(derived_name "$value")"
        done
    fi
}

remove_derived_theme() {
    local base light dark prev_gtk prev_day prev_night name
    base=$(state_get base)
    light=$(state_get light)
    dark=$(state_get dark)
    prev_gtk=$(state_get previous_gtk_theme)
    prev_day=$(state_get previous_zorin_day_theme)
    prev_night=$(state_get previous_zorin_night_theme)
    if [[ -z "$base" ]]; then
        info "No derived GTK theme to remove"
        return 0
    fi
    [[ -n "$prev_gtk" ]] && gsettings set "$INTERFACE_SCHEMA" gtk-theme "$prev_gtk"
    if has_schema "$AUTO_THEME_SCHEMA"; then
        [[ -n "$prev_day" ]] && gsettings set "$AUTO_THEME_SCHEMA" day-theme "$prev_day"
        [[ -n "$prev_night" ]] && gsettings set "$AUTO_THEME_SCHEMA" night-theme "$prev_night"
    fi
    for name in "$base" "$light" "$dark"; do
        [[ -n "$name" ]] || continue
        rm -rf "$HOME/.themes/$(derived_name "$name")" "$HOME/.themes/$name$GLOW_SUFFIX"
    done
    rm -f "$STATE_FILE"
    ok "GTK theme restored to ${prev_gtk:-default}"
}

install_icons() {
    local dir
    for dir in "$GTK4_DIR" "$GTK3_DIR"; do
        rm -rf "${dir:?}/$ICONS_SUBDIR"
        mkdir -p "$dir/$ICONS_SUBDIR"
        cp "$ICONS_SRC"/*.svg "$dir/$ICONS_SUBDIR/"
    done
}

remove_icons() {
    rm -rf "${GTK4_DIR:?}/$ICONS_SUBDIR" "${GTK3_DIR:?}/$ICONS_SUBDIR"
}

# Zorin's taskbar derives the app icon size from the panel height:
# 42px gives 26px icons and fits more pinned apps than the default 48.
TASKBAR_SCHEMA="org.gnome.shell.extensions.zorin-taskbar"
TASKBAR_SIZE=42
TASKBAR_STATE="$HOME/.config/glow/taskbar.state"

install_taskbar_size() {
    if ! has_schema "$TASKBAR_SCHEMA"; then
        info "Zorin taskbar not found; panel size unchanged"
        return 0
    fi
    if [[ ! -f "$TASKBAR_STATE" ]]; then
        mkdir -p "$(dirname "$TASKBAR_STATE")"
        gsettings get "$TASKBAR_SCHEMA" panel-size > "$TASKBAR_STATE"
    fi
    gsettings set "$TASKBAR_SCHEMA" panel-size "$TASKBAR_SIZE"
    ok "Zorin taskbar → ${TASKBAR_SIZE}px"
}

remove_taskbar_size() {
    [[ -f "$TASKBAR_STATE" ]] || return 0
    if has_schema "$TASKBAR_SCHEMA"; then
        gsettings set "$TASKBAR_SCHEMA" panel-size "$(cat "$TASKBAR_STATE")"
        ok "Zorin taskbar restored to $(cat "$TASKBAR_STATE")px"
    fi
    rm -f "$TASKBAR_STATE"
}

cmd="${1:-install}"

case "$cmd" in
    install)
        step "theme-tweaks: GTK4 + GTK3 CSS overrides"
        append_block "$GTK4_FILE" "$GTK4_SRC"
        ok "GTK4 → $GTK4_FILE"
        append_block "$GTK3_FILE" "$GTK3_SRC"
        ok "GTK3 → $GTK3_FILE"
        install_icons
        ok "Window button icons → $GTK4_DIR/$ICONS_SUBDIR, $GTK3_DIR/$ICONS_SUBDIR"
        install_derived_theme
        install_taskbar_size
        ;;
    remove)
        step "theme-tweaks: removing CSS overrides"
        remove_block "$GTK4_FILE"
        ok "Cleaned $GTK4_FILE"
        remove_block "$GTK3_FILE"
        ok "Cleaned $GTK3_FILE"
        remove_icons
        remove_derived_theme
        remove_taskbar_size
        ;;
    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
