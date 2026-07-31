#!/usr/bin/env bash
# ============================================================
# Glow — Module: nemo-icon
# Overrides Nemo's taskbar / app menu icon. Default Nemo icon
# in Papirus is a stylized grey "drawer" — this module replaces
# it with the standard yellow folder icon, matching the rest of
# the file manager UI.
#
# Mechanism: a user-level .desktop in ~/.local/share/applications
# that overrides the system /usr/share/applications/nemo.desktop.
# Only Icon= is changed, the rest is kept identical.
# ============================================================

set -euo pipefail

DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/nemo.desktop"

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cmd="${1:-install}"

case "$cmd" in
    install)
        step "nemo-icon: installing yellow-folder icon override for Nemo"

        if ! command -v nemo &>/dev/null; then
            warn "Nemo is not installed on this system — skipping."
            exit 0
        fi

        mkdir -p "$DESKTOP_DIR"
        cat > "$DESKTOP_FILE" <<'EOF'
[Desktop Entry]
Type=Application
Name=Files
GenericName=File Manager
Comment=Access and organize files
Exec=nemo %U
Icon=folder
Terminal=false
StartupNotify=false
Categories=GNOME;GTK;Utility;Core;FileManager;
MimeType=inode/directory;application/x-gnome-saved-search;
StartupWMClass=Nemo
EOF
        chmod 644 "$DESKTOP_FILE"

        if command -v update-desktop-database &>/dev/null; then
            update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
        fi

        killall nemo nemo-desktop 2>/dev/null || true

        ok "Override installed at $DESKTOP_FILE"
        info "Nemo will use the yellow folder icon next time it's launched."
        ;;

    remove)
        step "nemo-icon: removing override"
        rm -f "$DESKTOP_FILE"
        if command -v update-desktop-database &>/dev/null; then
            update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
        fi
        killall nemo nemo-desktop 2>/dev/null || true
        ok "Override removed — Nemo will fall back to the system icon"
        ;;

    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
