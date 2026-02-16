#!/usr/bin/env bash
#
# Mother Brain CLI Installer
#
# Installs a self-contained bundle (Node.js + app) to ~/.motherbrain/
# and symlinks the CLI binary into your PATH.
#
# Strategies (in order):
#   1. GitHub Release (default) — download pre-built binary for your platform
#   2. Git Tags (fallback)      — if /releases/latest returns 404, try latest tag
#   3. From Source (fallback)    — download main tarball, build with pnpm
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --version v0.2.0
#   curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --from-source
#
# Environment variables:
#   MB_INSTALL_DIR    — override symlink directory (default: /usr/local/bin or ~/.local/bin)
#   MB_HOME           — override bundle home (default: ~/.motherbrain)
#   MB_VERSION        — override version (default: latest)
#   GITHUB_TOKEN      — GitHub API token (avoids rate limits)
#   MB_GITHUB_TOKEN   — alias for GITHUB_TOKEN (takes priority)
#   MB_INSTALL_DEBUG  — set to 1 for verbose diagnostics
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

# ── Global temp directory (safe for set -u) ──────────────────────────

_TMPDIR=""

cleanup() {
  if [ -n "${_TMPDIR:-}" ] && [ -d "${_TMPDIR}" ]; then
    rm -rf "${_TMPDIR}"
  fi
}
trap cleanup EXIT INT TERM

ensure_tmpdir() {
  if [ -z "${_TMPDIR}" ]; then
    _TMPDIR="$(mktemp -d 2>/dev/null || mktemp -d -t motherbrain)" || {
      log_err "Could not create temporary directory."
      exit 1
    }
  fi
}

# ── Logging (ALL output to stderr — never pollute stdout) ────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { printf '%b\n' "${CYAN}[info]${NC}  $*" >&2; }
log_ok()    { printf '%b\n' "${GREEN}[ok]${NC}    $*" >&2; }
log_warn()  { printf '%b\n' "${YELLOW}[warn]${NC}  $*" >&2; }
log_err()   { printf '%b\n' "${RED}[error]${NC} $*" >&2; }
log_fatal() { log_err "$*"; exit 1; }

# Banner and final messages go to stderr too
log_banner() { printf '%b\n' "$*" >&2; }

# Debug mode: MB_INSTALL_DEBUG=1
log_debug() {
  if [ "${MB_INSTALL_DEBUG:-0}" = "1" ]; then
    printf '%b\n' "${CYAN}[debug]${NC} $*" >&2
  fi
}

# ── GitHub API ───────────────────────────────────────────────────────

get_github_token() {
  # stdout-only: returns token string (no logs)
  printf '%s' "${MB_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"
}

# Make a GitHub API GET request with proper headers and error diagnostics.
# Sets global: _HTTP_STATUS, _HTTP_BODY
# Returns 0 on 2xx, 1 otherwise.
_HTTP_STATUS=""
_HTTP_BODY=""

github_api_get() {
  local url="$1"
  local token
  token="$(get_github_token)"

  local -a curl_args=(
    --silent
    --show-error
    --proto '=https'
    --write-out '\n%{http_code}'
    -H "Accept: application/vnd.github+json"
    -H "User-Agent: mother-brain-installer/1.0"
  )

  if [ -n "${token}" ]; then
    curl_args+=(-H "Authorization: Bearer ${token}")
  fi

  local raw_response
  raw_response="$(curl "${curl_args[@]}" "${url}" 2>&1)" || {
    _HTTP_STATUS="000"
    _HTTP_BODY="${raw_response}"
    log_debug "github_api_get ${url} → connection failed"
    log_debug "body: ${_HTTP_BODY:0:200}"
    return 1
  }

  # Last line is the HTTP status code
  _HTTP_STATUS="$(printf '%s' "${raw_response}" | tail -n1)"
  _HTTP_BODY="$(printf '%s' "${raw_response}" | sed '$d')"

  log_debug "github_api_get ${url} → HTTP ${_HTTP_STATUS}"
  log_debug "body (first 200 chars): ${_HTTP_BODY:0:200}"

  if [ "${_HTTP_STATUS}" -ge 400 ] 2>/dev/null; then
    return 1
  fi

  return 0
}

print_rate_limit_hint() {
  local token
  token="$(get_github_token)"

  if [ -z "${token}" ]; then
    log_warn "Tip: Set GITHUB_TOKEN or MB_GITHUB_TOKEN to avoid rate limits and access private repos."
    log_warn "  export GITHUB_TOKEN=ghp_your_token_here"
  fi
}

# ── Helpers ──────────────────────────────────────────────────────────

detect_os() {
  # stdout-only: returns os string
  local os
  os="$(uname -s)"
  case "${os}" in
    Linux*)  printf 'linux' ;;
    Darwin*) printf 'darwin' ;;
    *)       log_fatal "Unsupported OS: ${os}. Only Linux and macOS are supported." ;;
  esac
}

detect_arch() {
  # stdout-only: returns arch string
  local arch
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|amd64)  printf 'x64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *)             log_fatal "Unsupported architecture: ${arch}. Only amd64 and arm64 are supported." ;;
  esac
}

check_command() {
  if ! command -v "$1" &>/dev/null; then
    log_fatal "Required command '$1' not found. Please install it and try again."
  fi
}

# Validate that a string looks like a semver tag: vN.N.N (with optional pre-release)
is_valid_version_tag() {
  local tag="$1"
  [[ "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]
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
    log_warn "Neither sha256sum nor shasum found — skipping checksum verification."
    return 0
  fi

  if [ "${actual}" != "${expected}" ]; then
    log_fatal "Checksum mismatch!\n  Expected: ${expected}\n  Actual:   ${actual}\n  File:     ${file}\nThe download may be corrupted. Aborting."
  fi

  log_ok "Checksum verified: ${actual:0:16}..."
}

resolve_bin_dir() {
  # stdout-only: returns directory path
  if [ -n "${MB_INSTALL_DIR:-}" ]; then
    printf '%s' "${MB_INSTALL_DIR}"
    return
  fi

  if [ -w "/usr/local/bin" ]; then
    printf '%s' "/usr/local/bin"
    return
  fi

  if command -v sudo &>/dev/null && sudo -n true 2>/dev/null; then
    printf '%s' "/usr/local/bin"
    return
  fi

  printf '%s' "${HOME}/.local/bin"
}

# ── Version Resolution ───────────────────────────────────────────────
# These functions print ONLY the version tag to stdout (e.g. "v0.1.0").
# All diagnostics go to stderr via log_* helpers.

# Strategy 1: Try /releases/latest
resolve_version_from_releases() {
  log_info "Checking GitHub Releases..."

  if github_api_get "${API_URL}/releases/latest"; then
    local tag
    tag="$(printf '%s' "${_HTTP_BODY}" | grep -o '"tag_name":[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tag_name":[[:space:]]*"//;s/"//')"
    if is_valid_version_tag "${tag}"; then
      log_ok "Found release: ${tag}"
      log_debug "Resolved version from releases: ${tag}"
      printf '%s' "${tag}"
      return 0
    fi
    log_debug "tag_name parsed but invalid: '${tag}'"
  fi

  if [ "${_HTTP_STATUS}" = "404" ]; then
    log_warn "No GitHub Releases found (HTTP 404)."
  elif [ "${_HTTP_STATUS}" = "403" ]; then
    log_warn "GitHub API rate limited (HTTP 403)."
    print_rate_limit_hint
  elif [ "${_HTTP_STATUS}" = "000" ]; then
    log_warn "Could not reach GitHub API. Check your internet connection."
  else
    log_warn "GitHub Releases API returned HTTP ${_HTTP_STATUS}."
  fi

  return 1
}

# Strategy 2: Try /tags to find the latest version tag
resolve_version_from_tags() {
  log_info "Checking Git tags..."

  if github_api_get "${API_URL}/tags?per_page=10"; then
    local tag
    tag="$(printf '%s' "${_HTTP_BODY}" | grep -o '"name":[[:space:]]*"v[^"]*"' | head -1 | sed 's/.*"name":[[:space:]]*"//;s/"//')"
    if is_valid_version_tag "${tag}"; then
      log_ok "Found tag: ${tag}"
      log_debug "Resolved version from tags: ${tag}"
      printf '%s' "${tag}"
      return 0
    fi
    log_debug "tag name parsed but invalid: '${tag}'"
  fi

  if [ "${_HTTP_STATUS}" = "403" ]; then
    log_warn "GitHub API rate limited while checking tags (HTTP 403)."
    print_rate_limit_hint
  else
    log_warn "No version tags found."
  fi

  return 1
}

# ── Install Strategies ───────────────────────────────────────────────

# Install from a GitHub Release binary
install_from_release() {
  local version="$1"
  local os="$2"
  local arch="$3"
  local mb_home="$4"

  log_info "Strategy: ${BOLD}binary release${NC}"

  local tarball_name="motherbrain-${version}-${os}-${arch}.tar.gz"
  local checksum_name="motherbrain-${version}-checksums.txt"
  local download_url="${GITHUB_URL}/releases/download/${version}/${tarball_name}"
  local checksum_url="${GITHUB_URL}/releases/download/${version}/${checksum_name}"

  log_debug "Download URL: ${download_url}"
  log_debug "Checksum URL: ${checksum_url}"

  ensure_tmpdir

  # Download tarball
  log_info "Downloading ${tarball_name}..."
  local tarball_path="${_TMPDIR}/${tarball_name}"

  local -a dl_args=(-fsSL --proto '=https' -o "${tarball_path}")
  local token
  token="$(get_github_token)"
  if [ -n "${token}" ]; then
    dl_args+=(-H "Authorization: Bearer ${token}")
  fi

  if ! curl "${dl_args[@]}" "${download_url}" 2>&1; then
    log_err "Failed to download: ${download_url}"

    # Check if the release exists but the asset is missing
    if github_api_get "${API_URL}/releases/tags/${version}"; then
      log_warn "Release ${version} exists but no asset for ${os}-${arch}."
      log_warn "Available assets:"
      printf '%s' "${_HTTP_BODY}" | grep -o '"name":[[:space:]]*"motherbrain-[^"]*"' | sed 's/.*"name":[[:space:]]*"//;s/"//' | while read -r name; do
        log_warn "  - ${name}"
      done
      log_warn ""
      log_warn "Try: install.sh --from-source"
    else
      log_warn "Release ${version} does not exist or has no assets."
      log_warn ""
      log_warn "To create a release, push a tag:"
      log_warn "  git tag ${version} && git push origin ${version}"
      log_warn ""
      log_warn "Or install from source: install.sh --from-source"
    fi

    return 1
  fi
  log_ok "Downloaded $(du -h "${tarball_path}" | awk '{print $1}')"

  # Checksum
  log_info "Verifying checksum..."
  local checksum_path="${_TMPDIR}/${checksum_name}"
  if curl -fsSL --proto '=https' -o "${checksum_path}" "${checksum_url}" 2>/dev/null; then
    local expected_hash
    expected_hash="$(grep "${tarball_name}" "${checksum_path}" | awk '{print $1}')"
    if [ -n "${expected_hash}" ]; then
      sha256_verify "${tarball_path}" "${expected_hash}"
    else
      log_warn "Tarball entry not found in checksums — skipping."
    fi
  else
    log_warn "Checksums file not available — skipping."
  fi

  # Extract to mb_home
  install_tarball "${tarball_path}" "${version}" "${os}" "${arch}" "${mb_home}"
}

# Install from source (download main tarball, build with pnpm)
install_from_source() {
  local version="$1"
  local mb_home="$2"

  log_info "Strategy: ${BOLD}build from source${NC}"

  # ── Check build dependencies ──

  local missing_deps=()
  if ! command -v node &>/dev/null; then
    missing_deps+=("node (>= 20, LTS 22 recommended)")
  fi
  if ! command -v pnpm &>/dev/null; then
    if ! command -v npm &>/dev/null; then
      missing_deps+=("pnpm (or npm to install it)")
    fi
  fi

  if [ ${#missing_deps[@]} -gt 0 ]; then
    log_err "From-source install requires additional dependencies:"
    for dep in "${missing_deps[@]}"; do
      log_err "  - ${dep}"
    done
    log_err ""
    log_err "Install Node.js and pnpm, then try again:"
    log_err "  Node.js: https://nodejs.org/ (LTS 22 recommended)"
    log_err "  pnpm:    npm install -g pnpm"
    return 1
  fi

  # ── Check Node.js version ──

  local node_version_full node_major
  node_version_full="$(node --version)"
  node_major="$(printf '%s' "${node_version_full}" | sed 's/^v//' | cut -d. -f1)"

  if [ "${node_major}" -ge 24 ] 2>/dev/null; then
    log_warn "Node.js ${node_version_full} detected (major >= 24)."
    log_warn "Native modules (better-sqlite3) may fail to compile on Node 24+."
    log_warn "Recommended: use Node.js LTS 22 for from-source builds."
    if command -v nvm &>/dev/null; then
      log_warn "  nvm install 22 && nvm use 22"
    else
      log_warn "  Install nvm: https://github.com/nvm-sh/nvm"
      log_warn "  Then: nvm install 22 && nvm use 22"
    fi
    log_warn ""
  fi
  log_info "Using Node.js ${node_version_full}"

  # ── Check native build toolchain ──

  local missing_tools=()
  command -v python3 &>/dev/null || command -v python &>/dev/null || missing_tools+=("python3")
  command -v make &>/dev/null || missing_tools+=("make")
  command -v g++ &>/dev/null || command -v c++ &>/dev/null || command -v clang++ &>/dev/null || missing_tools+=("g++ (or clang++)")

  if [ ${#missing_tools[@]} -gt 0 ]; then
    log_warn "Native module compilation may fail. Missing build tools:"
    for tool in "${missing_tools[@]}"; do
      log_warn "  - ${tool}"
    done
    # Detect distro and suggest install command
    if [ -f /etc/os-release ]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      case "${ID:-}" in
        ubuntu|debian)
          log_warn ""
          log_warn "On Ubuntu/Debian, install with:"
          log_warn "  sudo apt-get update && sudo apt-get install -y python3 make g++ pkg-config"
          ;;
        fedora|rhel|centos|rocky|alma)
          log_warn ""
          log_warn "On Fedora/RHEL, install with:"
          log_warn "  sudo dnf install python3 make gcc-c++ pkg-config"
          ;;
        arch|manjaro)
          log_warn ""
          log_warn "On Arch, install with:"
          log_warn "  sudo pacman -S python make gcc pkg-config"
          ;;
      esac
    elif [ "$(uname -s)" = "Darwin" ]; then
      log_warn ""
      log_warn "On macOS, install Xcode CLI tools:"
      log_warn "  xcode-select --install"
    fi
    log_warn ""
  fi

  ensure_tmpdir

  # ── Download source tarball ──

  local source_url="${GITHUB_URL}/archive/refs/heads/main.tar.gz"
  if [ -n "${version}" ] && [ "${version}" != "main" ]; then
    source_url="${GITHUB_URL}/archive/refs/tags/${version}.tar.gz"
  fi

  log_info "Downloading source..."
  log_debug "Source URL: ${source_url}"
  local source_tarball="${_TMPDIR}/source.tar.gz"
  if ! curl -fsSL --proto '=https' -o "${source_tarball}" "${source_url}" 2>&1; then
    # If tag download fails, fall back to main
    if [ "${source_url}" != "${GITHUB_URL}/archive/refs/heads/main.tar.gz" ]; then
      log_warn "Tag ${version} not found, downloading from main branch..."
      source_url="${GITHUB_URL}/archive/refs/heads/main.tar.gz"
      if ! curl -fsSL --proto '=https' -o "${source_tarball}" "${source_url}" 2>&1; then
        log_fatal "Failed to download source from ${source_url}."
      fi
    else
      log_fatal "Failed to download source from ${source_url}."
    fi
  fi
  log_ok "Source downloaded"

  # ── Extract ──

  tar -xzf "${source_tarball}" -C "${_TMPDIR}"
  local source_dir
  source_dir="$(find "${_TMPDIR}" -maxdepth 1 -type d -name 'mother-brain-*' | head -1)"
  if [ -z "${source_dir}" ]; then
    log_fatal "Could not find extracted source directory."
  fi

  # ── Build ──

  log_info "Installing dependencies..."
  cd "${source_dir}"

  local install_ok=true
  if command -v pnpm &>/dev/null; then
    if ! pnpm install --frozen-lockfile 2>&1 | tail -5 >&2; then
      log_warn "pnpm install --frozen-lockfile failed, retrying without lockfile..."
      if ! pnpm install 2>&1 | tail -5 >&2; then
        install_ok=false
      fi
    fi
  else
    log_info "pnpm not found, using npm..."
    if ! npm install 2>&1 | tail -5 >&2; then
      install_ok=false
    fi
  fi

  if [ "${install_ok}" != "true" ]; then
    log_err "Dependency installation failed."
    log_err ""
    log_err "This often happens because native modules (better-sqlite3) need"
    log_err "a C++ toolchain. See warnings above for install instructions."
    return 1
  fi

  log_info "Building TypeScript..."
  if command -v pnpm &>/dev/null; then
    if ! pnpm build 2>&1 | tail -5 >&2; then
      log_err "TypeScript build failed."
      return 1
    fi
  else
    if ! npm run build 2>&1 | tail -5 >&2; then
      log_err "TypeScript build failed."
      return 1
    fi
  fi
  log_ok "Build complete"

  # ── Install to mb_home ──

  log_info "Installing to ${mb_home}..."
  mkdir -p "${mb_home}"
  rm -rf "${mb_home}/current"
  mkdir -p "${mb_home}/current"

  cp -r "${source_dir}/dist" "${mb_home}/current/dist"
  cp -r "${source_dir}/bin" "${mb_home}/current/bin"
  cp "${source_dir}/package.json" "${mb_home}/current/package.json"
  cp -r "${source_dir}/node_modules" "${mb_home}/current/node_modules"

  # Stamp version into package.json so --version reports the correct tag
  if [ -n "${version}" ] && [ "${version}" != "main" ]; then
    local semver="${version#v}"
    node -e "
      const fs = require('fs');
      const p = process.argv[1];
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      j.version = process.argv[2];
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    " "${mb_home}/current/package.json" "${semver}"
  fi

  # Create wrapper that uses system node (no bundled runtime for from-source)
  local wrapper="${mb_home}/current/motherbrain"
  cat > "${wrapper}" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

SELF="${BASH_SOURCE[0]}"
while [ -L "${SELF}" ]; do
  DIR="$(cd "$(dirname "${SELF}")" && pwd)"
  SELF="$(readlink "${SELF}")"
  [[ "${SELF}" != /* ]] && SELF="${DIR}/${SELF}"
done
BUNDLE_DIR="$(cd "$(dirname "${SELF}")" && pwd)"

NODE="${BUNDLE_DIR}/runtime/node"
if [ ! -x "${NODE}" ]; then
  NODE="$(command -v node 2>/dev/null || true)"
  if [ -z "${NODE}" ]; then
    echo "Error: Node.js not found. Install Node.js >= 20." >&2
    exit 1
  fi
fi

exec "${NODE}" --no-warnings "${BUNDLE_DIR}/bin/run.js" "$@"
WRAPPER
  chmod +x "${wrapper}"

  # Resolve version from package.json if not set
  if [ -z "${version}" ] || [ "${version}" = "main" ]; then
    version="v$(node -p "require('${source_dir}/package.json').version" 2>/dev/null || echo 'dev')"
  fi

  log_ok "Installed from source (${version})"
}

# Extract tarball and install to mb_home/current
install_tarball() {
  local tarball_path="$1"
  local version="$2"
  local os="$3"
  local arch="$4"
  local mb_home="$5"

  log_info "Installing to ${mb_home}..."
  mkdir -p "${mb_home}"

  rm -rf "${mb_home}/current"

  tar -xzf "${tarball_path}" -C "${mb_home}"

  local extracted_dir="${mb_home}/motherbrain-${version}-${os}-${arch}"
  if [ ! -d "${extracted_dir}" ]; then
    log_fatal "Expected directory ${extracted_dir} not found after extraction."
  fi

  mv "${extracted_dir}" "${mb_home}/current"
  log_ok "Bundle installed to ${mb_home}/current"

  local bundle_binary="${mb_home}/current/motherbrain"
  if [ ! -f "${bundle_binary}" ]; then
    log_fatal "Bundle binary not found at ${bundle_binary}"
  fi
  chmod +x "${bundle_binary}"
}

# Symlink into PATH
setup_symlink() {
  local mb_home="$1"
  local bin_dir="$2"

  local bundle_binary="${mb_home}/current/motherbrain"
  mkdir -p "${bin_dir}"

  local dest="${bin_dir}/${BINARY_NAME}"
  local use_sudo=false

  if [ -L "${dest}" ] || [ -f "${dest}" ]; then
    if [ -w "${bin_dir}" ]; then
      rm -f "${dest}"
    elif command -v sudo &>/dev/null; then
      use_sudo=true
      sudo rm -f "${dest}"
    else
      log_fatal "Cannot remove existing ${dest}. No write permission and no sudo."
    fi
  fi

  if [ "${use_sudo}" = true ] || { ! [ -w "${bin_dir}" ] && command -v sudo &>/dev/null; }; then
    use_sudo=true
    log_info "Requesting sudo to symlink into ${bin_dir}..."
    sudo ln -sf "${bundle_binary}" "${dest}"
  else
    ln -sf "${bundle_binary}" "${dest}"
  fi

  log_ok "Symlinked ${dest} -> ${bundle_binary}"
}

# ── Main ─────────────────────────────────────────────────────────────

main() {
  local version=""
  local from_source=false

  # Parse args
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version|-v)
        version="$2"
        shift 2
        ;;
      --from-source)
        from_source=true
        shift
        ;;
      --help|-h)
        # Help goes to stderr so it's safe in pipe context too
        cat >&2 <<HELP
Usage: install.sh [--version vX.Y.Z] [--from-source]

Options:
  --version, -v    Install a specific version (default: latest)
  --from-source    Build from source instead of downloading a binary

Environment:
  MB_INSTALL_DIR    Override symlink directory (default: /usr/local/bin)
  MB_HOME           Override bundle home (default: ~/.motherbrain)
  MB_VERSION        Override version
  GITHUB_TOKEN      GitHub API token (avoids rate limits)
  MB_GITHUB_TOKEN   Alias for GITHUB_TOKEN (takes priority)
  MB_INSTALL_DEBUG  Set to 1 for verbose diagnostics
HELP
        exit 0
        ;;
      *)
        log_fatal "Unknown argument: $1. Use --help for usage."
        ;;
    esac
  done

  log_banner ""
  log_banner "${BOLD}  Mother Brain CLI Installer${NC}"
  log_banner "  ${GITHUB_URL}"
  log_banner ""

  # Check required commands
  for cmd in "${REQUIRED_CMDS[@]}"; do
    check_command "${cmd}"
  done

  # Detect platform
  local os arch
  os="$(detect_os)"
  arch="$(detect_arch)"
  log_info "Platform: ${os}-${arch}"

  # Directories
  local mb_home="${MB_HOME:-${MB_HOME_DEFAULT}}"
  local bin_dir
  bin_dir="$(resolve_bin_dir)"
  log_info "Bundle home: ${mb_home}"
  log_info "Binary link: ${bin_dir}/${BINARY_NAME}"

  # ── From-source shortcut ──
  if [ "${from_source}" = true ]; then
    version="${version:-${MB_VERSION:-main}}"
    [[ "${version}" != v* && "${version}" != "main" ]] && version="v${version}"
    if install_from_source "${version}" "${mb_home}"; then
      setup_symlink "${mb_home}" "${bin_dir}"
      print_success "${version:-dev}" "${mb_home}" "${bin_dir}"
    else
      log_fatal "From-source install failed. Check the errors above."
    fi
    return
  fi

  # ── Resolve version ──
  version="${version:-${MB_VERSION:-}}"
  if [ -z "${version}" ]; then
    log_info "Resolving latest version..."

    # Strategy 1: GitHub Releases — stdout is ONLY the tag
    version="$(resolve_version_from_releases)" || version=""

    # Strategy 2: Git Tags — stdout is ONLY the tag
    if [ -z "${version}" ]; then
      version="$(resolve_version_from_tags)" || version=""
    fi

    # Strategy 3: From source (automatic fallback)
    if [ -z "${version}" ]; then
      log_warn "No releases or tags found. Falling back to from-source install."
      log_warn ""
      log_warn "To publish a release so the binary installer works:"
      log_warn "  git tag v0.1.0 && git push origin v0.1.0"
      log_warn ""
      if install_from_source "main" "${mb_home}"; then
        setup_symlink "${mb_home}" "${bin_dir}"
        print_success "dev (from source)" "${mb_home}" "${bin_dir}"
      else
        log_fatal "From-source install failed. Check the errors above."
      fi
      return
    fi
  fi

  # Sanitize version: must look like vN.N.N
  [[ "${version}" != v* ]] && version="v${version}"
  if ! is_valid_version_tag "${version}"; then
    log_fatal "Invalid version '${version}'. Expected format: vX.Y.Z"
  fi
  log_ok "Version: ${version}"
  log_debug "Final resolved version: '${version}'"

  # ── Try binary release, fall back to from-source ──
  if ! install_from_release "${version}" "${os}" "${arch}" "${mb_home}"; then
    log_warn "Binary release install failed. Falling back to from-source install."
    log_warn ""
    if ! install_from_source "${version}" "${mb_home}"; then
      log_fatal "Both binary and from-source install failed. Check the errors above."
    fi
  fi

  setup_symlink "${mb_home}" "${bin_dir}"
  print_success "${version}" "${mb_home}" "${bin_dir}"
}

print_success() {
  local version="$1"
  local mb_home="$2"
  local bin_dir="$3"

  # Verify
  if command -v "${BINARY_NAME}" &>/dev/null; then
    local check_output
    check_output="$("${BINARY_NAME}" --version 2>&1 || true)"
    log_ok "Verification: ${check_output:-installed}"
  else
    log_warn "${BINARY_NAME} is not in your PATH."
    if [[ "${bin_dir}" == *".local/bin"* ]]; then
      log_banner ""
      log_warn "Add this to your shell profile (~/.bashrc, ~/.zshrc):"
      log_banner ""
      log_banner "  ${BOLD}export PATH=\"\${HOME}/.local/bin:\${PATH}\"${NC}"
      log_banner ""
      log_warn "Then reload: source ~/.bashrc (or ~/.zshrc)"
    fi
  fi

  log_banner ""
  log_banner "${GREEN}${BOLD}  Mother Brain ${version} installed successfully!${NC}"
  log_banner ""
  log_banner "  Get started:"
  log_banner "    motherbrain setup       # initialize project and configure .env"
  log_banner "    motherbrain api start   # start local API on :7337"
  log_banner "    motherbrain --help      # see all commands"
  log_banner ""
  log_banner "  Update later:"
  log_banner "    motherbrain self-update # update to the latest version"
  log_banner ""
  log_banner "  Bundle:  ${mb_home}/current"
  log_banner "  Binary:  ${bin_dir}/${BINARY_NAME}"
  log_banner ""
}

main "$@"
