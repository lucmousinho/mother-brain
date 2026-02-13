#!/usr/bin/env bash
#
# Mother Brain CLI Uninstaller
#
# Removes the CLI binary symlink and the bundle directory.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/uninstall.sh | bash
#
# Environment:
#   MB_HOME  — override bundle home (default: ~/.motherbrain)
#

set -euo pipefail

BINARY_NAME="motherbrain"
MB_HOME="${MB_HOME:-${HOME}/.motherbrain}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

echo ""
echo -e "${BOLD}  Mother Brain CLI Uninstaller${NC}"
echo ""

# ── Remove symlink from PATH ────────────────────────────────────────

binary_path="$(command -v "${BINARY_NAME}" 2>/dev/null || true)"

if [ -z "${binary_path}" ]; then
  for dir in /usr/local/bin "${HOME}/.local/bin"; do
    if [ -f "${dir}/${BINARY_NAME}" ] || [ -L "${dir}/${BINARY_NAME}" ]; then
      binary_path="${dir}/${BINARY_NAME}"
      break
    fi
  done
fi

if [ -n "${binary_path}" ]; then
  info "Found ${BINARY_NAME} at: ${binary_path}"

  if [ -w "$(dirname "${binary_path}")" ]; then
    rm -f "${binary_path}"
  elif command -v sudo &>/dev/null; then
    info "Requesting sudo to remove ${binary_path}..."
    sudo rm -f "${binary_path}"
  else
    error "Cannot remove ${binary_path} — no write permission and no sudo."
    error "Remove it manually: sudo rm ${binary_path}"
  fi

  ok "Removed ${binary_path}"
else
  warn "${BINARY_NAME} symlink not found in PATH."
fi

# ── Remove bundle directory ──────────────────────────────────────────

if [ -d "${MB_HOME}" ]; then
  info "Removing bundle directory: ${MB_HOME}"
  rm -rf "${MB_HOME}"
  ok "Removed ${MB_HOME}"
else
  info "Bundle directory ${MB_HOME} does not exist — nothing to remove."
fi

echo ""
echo -e "${GREEN}${BOLD}  Mother Brain uninstalled.${NC}"
echo ""
echo "  Note: project data in ./motherbrain/ and ./storage/ was NOT removed."
echo "  Delete those directories manually if you want a full cleanup."
echo ""
