#!/usr/bin/env bash
#
# Mother Brain CLI Installer
#
# Installs a self-contained bundle (Node.js + app) to ~/.motherbrain/
# and symlinks the CLI binary into your PATH.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --version v0.2.0
#
# Environment variables:
#   MB_INSTALL_DIR  — override symlink directory (default: /usr/local/bin or ~/.local/bin)
#   MB_HOME         — override bundle home (default: ~/.motherbrain)
#   MB_VERSION      — override version (default: latest)
#

set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────

GITHUB_OWNER="lucmousinho"
GITHUB_REPO="mother-brain"
GITHUB_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}"
API_URL="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"
BINARY_NAME="motherbrain"
MB_HOME_DEFAULT="${HOME}/.motherbrain"
REQUIRED_CMDS=(curl tar)

# ── Logging ──────────────────────────────────────────────────────────

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
fatal() { error "$*"; exit 1; }

# ── Helpers ──────────────────────────────────────────────────────────

detect_os() {
  local os
  os="$(uname -s)"
  case "${os}" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *)       fatal "Unsupported OS: ${os}. Only Linux and macOS are supported." ;;
  esac
}

detect_arch() {
  local arch
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|amd64)  echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)             fatal "Unsupported architecture: ${arch}. Only amd64 and arm64 are supported." ;;
  esac
}

check_command() {
  if ! command -v "$1" &>/dev/null; then
    fatal "Required command '$1' not found. Please install it and try again."
  fi
}

sha256_verify() {
  local file="$1"
  local expected="$2"
  local actual

  if command -v sha256sum &>/dev/null; then
    actual="$(sha256sum "${file}" | awk '{print $1}')"
  elif command -v shasum &>/dev/null; then
    actual="$(shasum -a 256 "${file}" | awk '{print $1}')"
  else
    warn "Neither sha256sum nor shasum found — skipping checksum verification."
    return 0
  fi

  if [ "${actual}" != "${expected}" ]; then
    fatal "Checksum mismatch!\n  Expected: ${expected}\n  Actual:   ${actual}\n  File:     ${file}\nThe download may be corrupted. Aborting."
  fi

  ok "Checksum verified: ${actual:0:16}..."
}

resolve_latest_version() {
  local url="${API_URL}/releases/latest"
  local response

  response="$(curl -fsSL -H "Accept: application/vnd.github+json" "${url}" 2>/dev/null)" || {
    fatal "Failed to fetch latest release from ${url}.\nCheck your internet connection or specify --version manually."
  }

  echo "${response}" | grep -o '"tag_name":[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tag_name":[[:space:]]*"//;s/"//'
}

resolve_bin_dir() {
  if [ -n "${MB_INSTALL_DIR:-}" ]; then
    echo "${MB_INSTALL_DIR}"
    return
  fi

  if [ -w "/usr/local/bin" ]; then
    echo "/usr/local/bin"
    return
  fi

  if command -v sudo &>/dev/null && sudo -n true 2>/dev/null; then
    echo "/usr/local/bin"
    return
  fi

  echo "${HOME}/.local/bin"
}

# ── Main ─────────────────────────────────────────────────────────────

main() {
  local version=""

  # Parse args
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version|-v)
        version="$2"
        shift 2
        ;;
      --help|-h)
        echo "Usage: install.sh [--version vX.Y.Z]"
        echo ""
        echo "Options:"
        echo "  --version, -v   Install a specific version (default: latest)"
        echo ""
        echo "Environment:"
        echo "  MB_INSTALL_DIR  Override symlink directory (default: /usr/local/bin)"
        echo "  MB_HOME         Override bundle home (default: ~/.motherbrain)"
        echo "  MB_VERSION      Override version"
        exit 0
        ;;
      *)
        fatal "Unknown argument: $1. Use --help for usage."
        ;;
    esac
  done

  echo ""
  echo -e "${BOLD}  Mother Brain CLI Installer${NC}"
  echo -e "  ${GITHUB_URL}"
  echo ""

  # Check required commands
  for cmd in "${REQUIRED_CMDS[@]}"; do
    check_command "${cmd}"
  done

  # Detect platform
  local os arch
  os="$(detect_os)"
  arch="$(detect_arch)"
  info "Platform: ${os}-${arch}"

  # Resolve version
  version="${version:-${MB_VERSION:-}}"
  if [ -z "${version}" ]; then
    info "Resolving latest version..."
    version="$(resolve_latest_version)"
    if [ -z "${version}" ]; then
      fatal "Could not determine latest version. Use --version to specify one."
    fi
  fi
  [[ "${version}" != v* ]] && version="v${version}"
  ok "Version: ${version}"

  # Directories
  local mb_home="${MB_HOME:-${MB_HOME_DEFAULT}}"
  local bin_dir
  bin_dir="$(resolve_bin_dir)"
  info "Bundle home: ${mb_home}"
  info "Binary link: ${bin_dir}/${BINARY_NAME}"

  # Asset names
  local tarball_name="motherbrain-${version}-${os}-${arch}.tar.gz"
  local checksum_name="motherbrain-${version}-checksums.txt"
  local download_url="${GITHUB_URL}/releases/download/${version}/${tarball_name}"
  local checksum_url="${GITHUB_URL}/releases/download/${version}/${checksum_name}"

  # Temp directory
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "${tmpdir}"' EXIT

  # Download tarball
  info "Downloading ${tarball_name}..."
  local tarball_path="${tmpdir}/${tarball_name}"
  curl -fsSL --proto '=https' -o "${tarball_path}" "${download_url}" || {
    fatal "Failed to download:\n  ${download_url}\nCheck that release ${version} exists with assets for ${os}-${arch}."
  }
  ok "Downloaded $(du -h "${tarball_path}" | awk '{print $1}')"

  # Checksum
  info "Verifying checksum..."
  local checksum_path="${tmpdir}/${checksum_name}"
  if curl -fsSL --proto '=https' -o "${checksum_path}" "${checksum_url}" 2>/dev/null; then
    local expected_hash
    expected_hash="$(grep "${tarball_name}" "${checksum_path}" | awk '{print $1}')"
    if [ -n "${expected_hash}" ]; then
      sha256_verify "${tarball_path}" "${expected_hash}"
    else
      warn "Tarball entry not found in checksums — skipping."
    fi
  else
    warn "Checksums file not available — skipping."
  fi

  # Extract to mb_home
  info "Installing to ${mb_home}..."
  mkdir -p "${mb_home}"

  # Remove previous version if exists
  rm -rf "${mb_home}/current"

  tar -xzf "${tarball_path}" -C "${mb_home}"

  # The tarball extracts to motherbrain-<version>-<os>-<arch>/
  local extracted_dir="${mb_home}/motherbrain-${version}-${os}-${arch}"
  if [ ! -d "${extracted_dir}" ]; then
    fatal "Expected directory ${extracted_dir} not found after extraction."
  fi

  # Rename to 'current'
  mv "${extracted_dir}" "${mb_home}/current"
  ok "Bundle installed to ${mb_home}/current"

  # Verify the bundle wrapper exists and is executable
  local bundle_binary="${mb_home}/current/motherbrain"
  if [ ! -f "${bundle_binary}" ]; then
    fatal "Bundle binary not found at ${bundle_binary}"
  fi
  chmod +x "${bundle_binary}"

  # Create symlink in bin_dir
  mkdir -p "${bin_dir}"

  local dest="${bin_dir}/${BINARY_NAME}"
  local use_sudo=false

  if [ -L "${dest}" ] || [ -f "${dest}" ]; then
    # Remove old symlink/binary
    if [ -w "${bin_dir}" ]; then
      rm -f "${dest}"
    elif command -v sudo &>/dev/null; then
      use_sudo=true
      sudo rm -f "${dest}"
    else
      fatal "Cannot remove existing ${dest}. No write permission and no sudo."
    fi
  fi

  if [ "${use_sudo}" = true ] || { ! [ -w "${bin_dir}" ] && command -v sudo &>/dev/null; }; then
    use_sudo=true
    info "Requesting sudo to symlink into ${bin_dir}..."
    sudo ln -sf "${bundle_binary}" "${dest}"
  else
    ln -sf "${bundle_binary}" "${dest}"
  fi

  ok "Symlinked ${dest} -> ${bundle_binary}"

  # Verify
  if command -v "${BINARY_NAME}" &>/dev/null; then
    local check_output
    check_output="$("${BINARY_NAME}" --version 2>&1 || true)"
    ok "Verification: ${check_output:-installed}"
  else
    warn "${BINARY_NAME} is not in your PATH."
    if [[ "${bin_dir}" == *".local/bin"* ]]; then
      echo ""
      warn "Add this to your shell profile (~/.bashrc, ~/.zshrc):"
      echo ""
      echo -e "  ${BOLD}export PATH=\"\${HOME}/.local/bin:\${PATH}\"${NC}"
      echo ""
      warn "Then reload: source ~/.bashrc (or ~/.zshrc)"
    fi
  fi

  echo ""
  echo -e "${GREEN}${BOLD}  Mother Brain ${version} installed successfully!${NC}"
  echo ""
  echo "  Get started:"
  echo "    motherbrain init        # initialize project structure"
  echo "    motherbrain api start   # start local API on :7337"
  echo "    motherbrain --help      # see all commands"
  echo ""
  echo "  Bundle:  ${mb_home}/current"
  echo "  Binary:  ${dest}"
  echo ""
}

main "$@"
