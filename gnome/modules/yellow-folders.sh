#!/usr/bin/env bash
# ============================================================
# Glow — Module: yellow-folders
# Installs Papirus icon theme, sets folder color to yellow, and
# copies the colored (yellow) folder SVGs into the small size
# dirs so that Nemo / Files show yellow folders in list view too
# (not just at big zoom).
#
# Forces Papirus-Light always — yellow folders stay yellow even
# when the desktop is in dark mode.
# ============================================================

set -euo pipefail

STATE_FILE="$HOME/.config/glow/yellow-folders.state"
COLORIZE_BACKUP="/usr/share/icons/_glow-colorize-backup"

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

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
    if ! command -v wget &>/dev/null; then
        sudo apt install -y wget
    fi
    wget -qO- https://raw.githubusercontent.com/PapirusDevelopmentTeam/papirus-folders/master/install.sh | sh
    if ! command -v papirus-folders &>/dev/null; then
        err "Could not install papirus-folders. Aborting yellow-folders module."
        exit 1
    fi
    ok "papirus-folders installed to /usr/local/bin"
}

apply_yellow_color() {
    info "Setting folder color to yellow on all Papirus variants..."
    sudo papirus-folders -t Papirus       -C yellow 2>/dev/null || true
    sudo papirus-folders -t Papirus-Light -C yellow 2>/dev/null || true
    sudo papirus-folders -t Papirus-Dark  -C yellow 2>/dev/null || true
    ok "Folder color set to yellow"
}

# Nemo uses small-size icons in list view which Papirus serves as
# symbolic (monochrome). Replace those small-size folder icons with
# copies of the colored 64x64 yellow version. Originals are backed
# up so --remove can restore them cleanly.
colorize_small_folders() {
    info "Colorizing small-size folder icons (list-view fix)..."
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
    if [[ ! -d "$COLORIZE_BACKUP" ]]; then
        info "No colorize backup to restore"
        return
    fi
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

activate_papirus_light() {
    mkdir -p "$(dirname "$STATE_FILE")"

    local gnome_cur cinn_cur
    gnome_cur=$(gsettings get org.gnome.desktop.interface icon-theme 2>/dev/null | tr -d "'" || echo '')
    cinn_cur=$(gsettings get org.cinnamon.desktop.interface icon-theme 2>/dev/null | tr -d "'" || echo '')

    if [[ ! -f "$STATE_FILE" ]]; then
        {
            [[ -n "$gnome_cur" && "$gnome_cur" != "Papirus"* ]] && echo "previous_gnome='$gnome_cur'"
            [[ -n "$cinn_cur"  && "$cinn_cur"  != "Papirus"* ]] && echo "previous_cinnamon='$cinn_cur'"
        } > "$STATE_FILE"
    fi

    # Activate Papirus-Light EVERYWHERE.
    # Nautilus reads from the GNOME schema, Nemo reads from the Cinnamon schema.
    gsettings set org.gnome.desktop.interface icon-theme 'Papirus-Light'
    gsettings set org.cinnamon.desktop.interface icon-theme 'Papirus-Light' 2>/dev/null || true
    gsettings set org.cinnamon.desktop.interface icon-theme-backup 'Papirus-Light' 2>/dev/null || true
    ok "Icon theme set to Papirus-Light (GNOME + Cinnamon)"
}

restore_previous_icon_theme() {
    if [[ ! -f "$STATE_FILE" ]]; then
        info "No previous icon-theme state; resetting to schema defaults"
        gsettings reset org.gnome.desktop.interface icon-theme 2>/dev/null || true
        gsettings reset org.cinnamon.desktop.interface icon-theme 2>/dev/null || true
        return
    fi

    local prev_gnome prev_cinn
    prev_gnome=$(grep '^previous_gnome=' "$STATE_FILE" 2>/dev/null | cut -d= -f2- | tr -d "'" || true)
    prev_cinn=$(grep '^previous_cinnamon=' "$STATE_FILE" 2>/dev/null | cut -d= -f2- | tr -d "'" || true)

    if [[ -n "$prev_gnome" ]]; then
        gsettings set org.gnome.desktop.interface icon-theme "$prev_gnome"
        ok "Restored GNOME icon-theme: $prev_gnome"
    else
        gsettings reset org.gnome.desktop.interface icon-theme 2>/dev/null || true
    fi
    if [[ -n "$prev_cinn" ]]; then
        gsettings set org.cinnamon.desktop.interface icon-theme "$prev_cinn" 2>/dev/null || true
        ok "Restored Cinnamon icon-theme: $prev_cinn"
    else
        gsettings reset org.cinnamon.desktop.interface icon-theme 2>/dev/null || true
    fi
    rm -f "$STATE_FILE"
}

cmd="${1:-install}"

case "$cmd" in
    install)
        step "yellow-folders: Papirus with yellow folders"
        ensure_papirus_installed
        ensure_papirus_folders_installed
        apply_yellow_color
        colorize_small_folders
        activate_papirus_light
        ;;
    remove)
        step "yellow-folders: reverting"
        restore_small_folders
        restore_previous_icon_theme
        info "Papirus package left installed. To fully remove: ${DIM}sudo apt remove papirus-icon-theme${NC}"
        ;;
    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
