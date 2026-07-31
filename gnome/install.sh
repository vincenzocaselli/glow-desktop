#!/usr/bin/env bash
# ============================================================
# Glow — master installer for GNOME-based Linux desktops
#
# Five tweaks in one pass:
#   1. focus-glow     — GNOME Shell extension: blue aura around
#                       the active window (works on every app,
#                       GTK / Electron / SWT / Qt — any toolkit)
#   2. theme-tweaks   — GTK3+GTK4 CSS: square top corners on all
#                       windows + Dodger Blue accent everywhere
#   3. yellow-folders — Papirus icon theme with yellow folders,
#                       including the list-view colorize fix
#   4. nemo-icon      — replaces Nemo's grey drawer icon in the
#                       taskbar / app menu with a yellow folder
#   5. nemo-zoom      — compact default zoom for Nemo (icon /
#                       list / compact view) so font size in the
#                       content area matches the sidebar
#
# Usage:
#   bash install.sh                     # install everything
#   bash install.sh --remove            # remove everything
#   bash install.sh <module>            # install only one module
#   bash install.sh <module> --remove   # remove only one module
#   bash install.sh --list              # list available modules
#
# Module names: focus-glow theme-tweaks yellow-folders nemo-icon nemo-zoom
#
# Safe to re-run. Idempotent. All changes are reversible.
#
# License: GPL-3.0-or-later
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULES_DIR="$SCRIPT_DIR/modules"

source "$MODULES_DIR/_lib.sh"

ALL_MODULES=("focus-glow" "theme-tweaks" "yellow-folders" "nemo-icon" "nemo-zoom")

banner() {
    cat <<'EOF'

   ╔═══════════════════════════════════════╗
   ║              G L O W                  ║
   ║   Soft focus aura for GNOME Shell     ║
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
  bash install.sh --help              this help

Modules: ${ALL_MODULES[*]}

EOF
}

list_modules() {
    echo ""
    info "Available modules:"
    for m in "${ALL_MODULES[@]}"; do
        echo "  - $m"
    done
    echo ""
}

preflight() {
    step "Preflight checks"

    if [[ -r /etc/os-release ]]; then
        . /etc/os-release
        info "OS: ${PRETTY_NAME:-unknown}"
    fi

    if command -v gnome-shell &>/dev/null; then
        local sv
        sv=$(gnome-shell --version 2>/dev/null | awk '{print $3}')
        info "GNOME Shell: $sv"
    else
        warn "gnome-shell not found — focus-glow won't apply, others will."
    fi

    if ! sudo -v; then
        err "sudo access required. Aborting."
        exit 1
    fi
    (while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done) 2>/dev/null &
    SUDO_KEEPALIVE=$!
    trap 'kill $SUDO_KEEPALIVE 2>/dev/null || true' EXIT

    command -v gsettings &>/dev/null || { err "gsettings missing"; exit 1; }

    ok "Preflight OK"
}

run_module() {
    local module="$1"
    local action="$2"
    local script="$MODULES_DIR/$module.sh"

    if [[ ! -f "$script" ]]; then
        err "Unknown module: $module"
        echo "Available: ${ALL_MODULES[*]}"
        exit 1
    fi

    bash "$script" "$action"
}

final_notes() {
    local action="$1"

    cat <<EOF

${BOLD}${GREEN}Done.${NC}

EOF

    if [[ "$action" == "install" ]]; then
        cat <<EOF
${YELLOW}Next step — log out and back in.${NC}
  Wayland does not reload GNOME Shell extensions or some CSS
  without a fresh session. After the new login:

  - The Glow extension will be enabled automatically, or you can
    enable it from the Extensions app.
  - Square corners, Dodger Blue accent, yellow folders, and the
    yellow Nemo icon are all active immediately.

${DIM}If the Glow extension does not appear after login, run:${NC}
  gnome-extensions enable glow@nebula.local

EOF
    else
        cat <<EOF
${YELLOW}A logout / login is recommended${NC} to fully unload cached icons,
CSS, and extension state.

EOF
    fi
}

# ---------- arg parsing ----------
action="install"
target="all"

for arg in "$@"; do
    case "$arg" in
        --help|-h)
            usage
            exit 0
            ;;
        --list|-l)
            list_modules
            exit 0
            ;;
        --remove|-r)
            action="remove"
            ;;
        focus-glow|theme-tweaks|yellow-folders|nemo-icon|nemo-zoom)
            target="$arg"
            ;;
        *)
            err "Unknown argument: $arg"
            usage
            exit 1
            ;;
    esac
done

# ---------- main ----------
banner
preflight

if [[ "$target" == "all" ]]; then
    if [[ "$action" == "install" ]]; then
        for m in "${ALL_MODULES[@]}"; do
            run_module "$m" install
        done
    else
        for ((i=${#ALL_MODULES[@]}-1; i>=0; i--)); do
            run_module "${ALL_MODULES[$i]}" remove
        done
    fi
else
    run_module "$target" "$action"
fi

final_notes "$action"
