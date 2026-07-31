#!/usr/bin/env bash
# ============================================================
# Glow for KDE — shared helpers
# ============================================================

if [[ -t 1 ]]; then
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    RED='\033[0;31m'
    DIM='\033[2m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    GREEN=''; YELLOW=''; BLUE=''; RED=''; DIM=''; BOLD=''; NC=''
fi

info()  { echo -e "${BLUE}›${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*"; }
step()  { echo -e "\n${BOLD}${BLUE}━━${NC} ${BOLD}$*${NC} ${BLUE}━━${NC}"; }

# Detect kwriteconfig / kreadconfig (Plasma 6 = ...6, Plasma 5 = ...5)
detect_kde_tools() {
    if command -v kwriteconfig6 &>/dev/null; then
        KWRITE=kwriteconfig6
        KREAD=kreadconfig6
        PLASMA_VER=6
    elif command -v kwriteconfig5 &>/dev/null; then
        KWRITE=kwriteconfig5
        KREAD=kreadconfig5
        PLASMA_VER=5
    else
        return 1
    fi
    return 0
}
