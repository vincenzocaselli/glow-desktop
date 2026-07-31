#!/usr/bin/env bash
# ============================================================
# Glow for KDE — Module: overview
# Configures the KWin Overview effect (the KDE equivalent of
# GNOME's Activities Overview) to:
#   - Be enabled
#   - Be triggered by the Meta (Super / Windows) key alone
#
# By default on Plasma 6 the Meta key opens the Application
# Launcher menu. This module remaps Meta to toggle Overview
# instead — the closest match to GNOME behaviour.
# ============================================================

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cmd="${1:-install}"

if ! detect_kde_tools; then
    err "kwriteconfig6/5 not found — is this a KDE Plasma system?"
    exit 1
fi

case "$cmd" in
    install)
        step "overview: enabling Overview effect + Meta key shortcut"

        # 1. Make sure the Overview KWin effect is enabled.
        $KWRITE --file kwinrc --group Plugins --key overviewEnabled true
        ok "Overview effect enabled"

        # 2. Bind Meta (Super) alone to "Toggle Overview".
        # KDE shortcuts for KWin actions live in kglobalshortcutsrc, under
        # the [kwin] group. Format of the value: "<keys>,<default>,<text>".
        # Setting just "Meta" makes pressing Super alone trigger it.
        $KWRITE --file kglobalshortcutsrc --group kwin \
                --key "Overview" "Meta,Meta,Toggle Overview"
        ok "Meta key bound to Toggle Overview"

        # 3. Plasma's Application Launcher also listens on Meta by default,
        # which would conflict. Unbind it (leaving Alt+F1 etc. still working).
        # The key lives in kglobalshortcutsrc under [plasmashell].
        $KWRITE --file kglobalshortcutsrc --group plasmashell \
                --key "activate application launcher" "none,Meta,Activate Application Launcher"
        ok "Plasma launcher no longer steals Meta (still on Alt+F1)"

        info "Reload KWin or log out / in to apply:"
        info "  ${DIM}kwin_wayland --replace &${NC}   (Wayland)"
        info "  ${DIM}kwin_x11 --replace &${NC}       (X11)"
        info "Also reload Plasma shell to pick up the launcher unbinding:"
        info "  ${DIM}plasmashell --replace &${NC}"
        ;;

    remove)
        step "overview: reverting shortcuts"

        # Re-bind Meta to Plasma's launcher (the Plasma default)
        $KWRITE --file kglobalshortcutsrc --group plasmashell \
                --key "activate application launcher" "Meta,Meta,Activate Application Launcher"
        ok "Meta restored to Plasma launcher"

        # Unbind the Overview shortcut (back to "none" so user can set it)
        $KWRITE --file kglobalshortcutsrc --group kwin \
                --key "Overview" "none,none,Toggle Overview"
        ok "Overview shortcut cleared"

        # We leave the Overview effect itself enabled — it's a nice feature
        # to have even without the Meta shortcut. Comment out if you want
        # to disable it too on remove.
        # $KWRITE --file kwinrc --group Plugins --key overviewEnabled false

        info "Reload KWin and Plasma shell to apply."
        ;;

    *)
        err "Unknown command: $cmd"
        exit 1
        ;;
esac
