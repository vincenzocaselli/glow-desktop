#!/usr/bin/env bash
# ============================================================
# Glow for KDE — Module: dolphin
# Tunes Dolphin (KDE's file manager) for a compact, consistent
# look matching the rest of Glow:
#   - Default view = Details (list-like, compact)
#   - Smaller icon size in Details view so font ~ sidebar
#   - Override Dolphin's app icon with the standard "folder" icon
#     (so the yellow Papirus folder is used in taskbar / launcher),
#     equivalent to the nemo-icon module on GNOME.
#
# Reversible: --remove resets all Dolphin keys we set and removes
# the .desktop override.
# ============================================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/org.kde.dolphin.desktop"

cmd="${1:-install}"

if ! detect_kde_tools; then
    err "kwriteconfig6/5 not found — is this a KDE Plasma system?"
    exit 1
fi

case "$cmd" in
    install)
        step "dolphin: compact view + yellow folder app icon"

        if ! command -v dolphin &>/dev/null; then
            warn "Dolphin is not installed — skipping."
            exit 0
        fi

        # ---- 1. Default view mode = Details (compact list-like)
        # ViewModes: 0 = Icons, 1 = Compact, 2 = Details
        $KWRITE --file dolphinrc --group General --key ViewMode 2
        ok "Default view mode set to Details"

        # ---- 2. Smaller icon size in Details view
        # IconSize_Details is in pixels. Default ~ 32. Use 16 for a
        # compact look where font ~ sidebar font.
        $KWRITE --file dolphinrc --group DetailsMode --key IconSize 16
        $KWRITE --file dolphinrc --group DetailsMode --key PreviewSize 16
        $KWRITE --file dolphinrc --group IconsMode   --key IconSize 48
        $KWRITE --file dolphinrc --group IconsMode   --key PreviewSize 48
        $KWRITE --file dolphinrc --group CompactMode --key IconSize 16
        $KWRITE --file dolphinrc --group CompactMode --key PreviewSize 16
        ok "Compact icon sizes set (Details/Compact 16px, Icons 48px)"

        # ---- 3. Optional: open new folders with the same view as the
        # current one (matches the "open everything compact" feeling)
        $KWRITE --file dolphinrc --group General --key GlobalViewProps true
        ok "Global view properties enabled (uniform view across folders)"

        # ---- 4. Override the Dolphin app icon
        # User-level .desktop with Icon=folder so the taskbar / launcher
        # picks the yellow folder from Papirus.
        mkdir -p "$DESKTOP_DIR"
        cat > "$DESKTOP_FILE" <<'EOF'
[Desktop Entry]
Type=Application
Name=Files
GenericName=File Manager
Comment=Access and organize files
Exec=dolphin %u
Icon=folder
Terminal=false
StartupNotify=true
Categories=Qt;KDE;System;FileTools;FileManager;
MimeType=inode/directory;
StartupWMClass=dolphin
X-DBUS-ServiceName=org.kde.dolphin
EOF
        chmod 644 "$DESKTOP_FILE"

        if command -v update-desktop-database &>/dev/null; then
            update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
        fi
        ok "Dolphin icon overridden → folder (yellow Papirus)"

        info "Close all open Dolphin windows and reopen them — settings will apply."
        info "If the launcher icon doesn't refresh, log out / in once."
        ;;

    remove)
        step "dolphin: reverting"

        # Reset the keys we set
        $KWRITE --file dolphinrc --group General      --key ViewMode --delete 2>/dev/null || true
        $KWRITE --file dolphinrc --group General      --key GlobalViewProps --delete 2>/dev/null || true
        $KWRITE --file dolphinrc --group DetailsMode  --key IconSize --delete 2>/dev/null || true
        $KWRITE --file dolphinrc --group DetailsMode  --key PreviewSize --delete 2>/dev/null || true
        $KWRITE --file dolphinrc --group IconsMode    --key IconSize --delete 2>/dev/null || true
        $KWRITE --file dolphinrc --group IconsMode    --key PreviewSize --delete 2>/dev/null || true
        $KWRITE --file dolphinrc --group CompactMode  --key IconSize --delete 2>/dev/null || true
        $KWRITE --file dolphinrc --group CompactMode  --key PreviewSize --delete 2>/dev/null || true
        ok "Dolphin view settings reset to defaults"

        # Remove the .desktop override
        rm -f "$DESKTOP_FILE"
        if command -v update-desktop-database &>/dev/null; then
            update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
        fi
        ok "Dolphin icon override removed"

        info "Per-folder view metadata (stored in ~/.local/share/dolphin/) is NOT touched."
        ;;

    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
