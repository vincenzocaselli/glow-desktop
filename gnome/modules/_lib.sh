#!/usr/bin/env bash
# ============================================================
# Glow — shared helpers
# Sourced by every module via: source "$(dirname ...)/_lib.sh"
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
