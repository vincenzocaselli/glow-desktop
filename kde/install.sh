#!/usr/bin/env bash
# ============================================================
# Glow for KDE — master installer for KDE Plasma 6 (Kubuntu etc.)
#
# The KDE counterpart of the GNOME "Glow" package. Same visual
# identity (Dodger Blue accent, active-window highlight, square
# corners, yellow Papirus folders) but implemented with Plasma's
# NATIVE configuration system — no Shell extension or CSS hacks
# needed, because KDE exposes all of this as first-class settings.
#
# Modules:
#   1. accent         — global Dodger Blue accent (native Plasma)
#   2. focus-border   — active window highlighted in the accent
#   3. square-corners — disable rounded window corners
#   4. yellow-folders — Papirus icon theme + yellow folders + the
#                       small-size colorize fix (for Dolphin)
#   5. dolphin        — compact view defaults + yellow folder icon
#                       override for the Dolphin file manager
#   6. overview       — bind the Meta (Super) key alone to KWin's
#                       Overview effect (GNOME-like Activities)
#
# Usage:
#   bash install.sh                     # everything
#   bash install.sh --remove            # remove everything
#   bash install.sh <module>            # one module
#   bash install.sh <module> --remove   # remove one module
#   bash install.sh --list
#
# Module names: accent focus-border square-corners yellow-folders dolphin overview
#
# Reversible, re-runnable. License: GPL-3.0-or-later.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULES_DIR="$SCRIPT_DIR/modules"

source "$MODULES_DIR/_lib.sh"

ALL_MODULES=("accent" "focus-border" "square-corners" "yellow-folders" "dolphin" "overview")

banner() {
    cat <<'EOF'

   ╔═══════════════════════════════════════╗
   ║          G L O W   ·   K D E          ║
   ║   Dodger Blue identity for Plasma 6   ║
   ╚═══════════════════════════════════════╝

EOF
}

usage() {
    cat <<EOF

Usage:
  bash install.sh                     install all modules
  bash install.sh --remove            remove all modules
  bash install.sh <module>            install a single module
  bash install.sh <module> --remove   remove a single module
  bash install.sh --list              list modules

Modules: ${ALL_MODULES[*]}

EOF
}

list_modules() {
    echo ""
    info "Available modules:"
    for m in "${ALL_MODULES[@]}"; do echo "  - $m"; done
    echo ""
}

preflight() {
    step "Preflight checks"

    if [[ -r /etc/os-release ]]; then
        . /etc/os-release
        info "OS: ${PRETTY_NAME:-unknown}"
    fi

    if ! detect_kde_tools; then
        err "This is the KDE package but kwriteconfig6/5 was not found."
        err "Are you on KDE Plasma? For GNOME/Zorin use the other Glow package."
        exit 1
    fi
    info "Plasma config tools: $KWRITE (Plasma $PLASMA_VER)"

    if command -v plasmashell &>/dev/null; then
        info "plasmashell: $(plasmashell --version 2>/dev/null | awk '{print $2}')"
    fi

    if ! sudo -v; then
        err "sudo access required. Aborting."
        exit 1
    fi
    (while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done) 2>/dev/null &
    SUDO_KEEPALIVE=$!
    trap 'kill $SUDO_KEEPALIVE 2>/dev/null || true' EXIT

    ok "Preflight OK"
}

run_module() {
    local module="$1" action="$2"
    local script="$MODULES_DIR/$module.sh"
    [[ -f "$script" ]] || { err "Unknown module: $module"; echo "Available: ${ALL_MODULES[*]}"; exit 1; }
    bash "$script" "$action"
}

final_notes() {
    local action="$1"
    cat <<EOF

${BOLD}${GREEN}Done.${NC}

EOF
    if [[ "$action" == "install" ]]; then
        cat <<EOF
${YELLOW}To apply everything cleanly:${NC} log out and back in.

  Most changes apply live or after reloading KWin / Plasma:
    Wayland:  ${DIM}kwin_wayland --replace &${NC}
    X11:      ${DIM}kwin_x11 --replace &${NC}
    Shell:    ${DIM}plasmashell --replace &${NC}

  A full log out / in is the simplest way to be sure.

EOF
    else
        cat <<EOF
${YELLOW}Log out / in${NC} to fully revert all cached state.

EOF
    fi
}

# ---------- arg parsing ----------
action="install"
target="all"

for arg in "$@"; do
    case "$arg" in
        --help|-h) usage; exit 0 ;;
        --list|-l) list_modules; exit 0 ;;
        --remove|-r) action="remove" ;;
        accent|focus-border|square-corners|yellow-folders|dolphin|overview) target="$arg" ;;
        *) err "Unknown argument: $arg"; usage; exit 1 ;;
    esac
done

# ---------- main ----------
banner
preflight

if [[ "$target" == "all" ]]; then
    if [[ "$action" == "install" ]]; then
        for m in "${ALL_MODULES[@]}"; do run_module "$m" install; done
    else
        for ((i=${#ALL_MODULES[@]}-1; i>=0; i--)); do run_module "${ALL_MODULES[$i]}" remove; done
    fi
else
    run_module "$target" "$action"
fi

final_notes "$action"
