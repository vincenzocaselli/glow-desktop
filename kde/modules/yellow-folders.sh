#!/usr/bin/env bash
# ============================================================
# Glow for KDE — Module: yellow-folders
# Installs Papirus, sets folder color to yellow, applies it as
# the icon theme via Plasma's native tool, and runs the same
# small-size colorize fix used on GNOME (so Dolphin shows yellow
# folders at every size, including the compact details view).
# ============================================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

COLORIZE_BACKUP="/usr/share/icons/_glow-colorize-backup"
STATE_FILE="$HOME/.config/glow-kde/yellow-folders.state"

detect_kde_tools || true   # not strictly required here

ensure_papirus_installed() {
    if dpkg -l papirus-icon-theme 2>/dev/null | grep -q '^ii'; then
        ok "papirus-icon-theme already installed"
    else
        info "Installing papirus-icon-theme via apt..."
        sudo apt update -qq
        sudo apt install -y papirus-icon-theme
        ok "Papirus installed"
    fi
}

ensure_papirus_folders_installed() {
    if command -v papirus-folders &>/dev/null; then
        ok "papirus-folders already available"
        return
    fi
    info "Installing papirus-folders from upstream..."
    command -v wget &>/dev/null || sudo apt install -y wget
    wget -qO- https://raw.githubusercontent.com/PapirusDevelopmentTeam/papirus-folders/master/install.sh | sh
    command -v papirus-folders &>/dev/null || { err "papirus-folders install failed"; exit 1; }
    ok "papirus-folders installed"
}

apply_yellow_color() {
    info "Setting folder color to yellow on all Papirus variants..."
    sudo papirus-folders -t Papirus       -C yellow 2>/dev/null || true
    sudo papirus-folders -t Papirus-Light -C yellow 2>/dev/null || true
    sudo papirus-folders -t Papirus-Dark  -C yellow 2>/dev/null || true
    ok "Folder color set to yellow"
}

colorize_small_folders() {
    info "Colorizing small-size folder icons..."
    sudo mkdir -p "$COLORIZE_BACKUP"
    for theme in Papirus Papirus-Light Papirus-Dark; do
        local src_64="/usr/share/icons/$theme/64x64/places"
        [[ -d "$src_64" ]] || continue
        for size in 16x16 22x22 24x24 32x32 48x48; do
            local dst_dir="/usr/share/icons/$theme/$size/places"
            [[ -d "$dst_dir" ]] || continue
            local backup_dir="$COLORIZE_BACKUP/$theme/$size/places"
            if [[ ! -d "$backup_dir" ]]; then
                sudo mkdir -p "$backup_dir"
                sudo find "$dst_dir" -maxdepth 1 -name "folder*.svg" -exec cp -a {} "$backup_dir/" \;
            fi
            # Single find -exec (no sudo nested in a pipe subshell — the
            # sudo find | while sudo cp pattern can deadlock on live systems)
            sudo find "$src_64" -maxdepth 1 -name "folder*.svg" -exec cp -ft "$dst_dir" {} +
        done
    done
    for theme in Papirus Papirus-Light Papirus-Dark; do
        sudo gtk-update-icon-cache -f "/usr/share/icons/$theme" 2>/dev/null || true
    done
    ok "Small-size folders colorized (backup at $COLORIZE_BACKUP)"
}

restore_small_folders() {
    [[ -d "$COLORIZE_BACKUP" ]] || { info "No colorize backup"; return; }
    info "Restoring original small-size folder icons..."
    for theme in Papirus Papirus-Light Papirus-Dark; do
        for size in 16x16 22x22 24x24 32x32 48x48; do
            local backup_dir="$COLORIZE_BACKUP/$theme/$size/places"
            local dst_dir="/usr/share/icons/$theme/$size/places"
            [[ -d "$backup_dir" && -d "$dst_dir" ]] || continue
            sudo find "$backup_dir" -maxdepth 1 -name "*.svg" -exec cp -aft "$dst_dir" {} +
        done
        sudo gtk-update-icon-cache -f "/usr/share/icons/$theme" 2>/dev/null || true
    done
    sudo rm -rf "$COLORIZE_BACKUP"
    ok "Original icons restored"
}

activate_papirus() {
    mkdir -p "$(dirname "$STATE_FILE")"
    # Apply icon theme the KDE-native way
    if command -v plasma-apply-icontheme &>/dev/null; then
        # Save current theme for restore
        local cur
        cur=$(kreadconfig6 --file kdeglobals --group Icons --key Theme 2>/dev/null || echo '')
        [[ -n "$cur" && "$cur" != "Papirus"* && ! -f "$STATE_FILE" ]] && echo "previous_icontheme='$cur'" > "$STATE_FILE"
        plasma-apply-icontheme Papirus-Light 2>/dev/null && ok "Icon theme set to Papirus-Light (plasma-apply-icontheme)"
    else
        # Fallback: write kdeglobals directly
        if detect_kde_tools; then
            $KWRITE --file kdeglobals --group Icons --key Theme Papirus-Light
            ok "Icon theme set to Papirus-Light (kdeglobals)"
        fi
    fi
}

restore_icontheme() {
    if [[ -f "$STATE_FILE" ]]; then
        local prev
        prev=$(grep '^previous_icontheme=' "$STATE_FILE" | cut -d= -f2- | tr -d "'")
        if [[ -n "$prev" ]]; then
            if command -v plasma-apply-icontheme &>/dev/null; then
                plasma-apply-icontheme "$prev" 2>/dev/null || true
            elif detect_kde_tools; then
                $KWRITE --file kdeglobals --group Icons --key Theme "$prev"
            fi
            ok "Icon theme restored: $prev"
        fi
        rm -f "$STATE_FILE"
    else
        info "No previous icon theme saved; leaving as-is."
    fi
}

cmd="${1:-install}"

case "$cmd" in
    install)
        step "yellow-folders: Papirus with yellow folders (KDE)"
        ensure_papirus_installed
        ensure_papirus_folders_installed
        apply_yellow_color
        colorize_small_folders
        activate_papirus
        ;;
    remove)
        step "yellow-folders: reverting (KDE)"
        restore_small_folders
        restore_icontheme
        info "Papirus left installed. Full removal: ${DIM}sudo apt remove papirus-icon-theme${NC}"
        ;;
    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
