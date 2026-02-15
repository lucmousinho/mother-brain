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
#   MB_INSTALL_DIR   — override symlink directory (default: /usr/local/bin or ~/.local/bin)
#   MB_HOME          — override bundle home (default: ~/.motherbrain)
#   MB_VERSION       — override version (default: latest)
#   GITHUB_TOKEN     — GitHub API token (avoids rate limits)
#   MB_GITHUB_TOKEN  — alias for GITHUB_TOKEN (takes priority)
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

# ── GitHub API ───────────────────────────────────────────────────────

# Returns the auth token if set, empty string otherwise
get_github_token() {
  echo "${MB_GITHUB_TOKEN:-${GITHUB_TOKEN:-}}"
}

# Make a GitHub API GET request with proper headers and error diagnostics.
# Usage: github_api_get <url> [<output_var_name>]
# Sets: _HTTP_STATUS, _HTTP_BODY
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
    return 1
  }

  # Last line is the HTTP status code
  _HTTP_STATUS="$(echo "${raw_response}" | tail -n1)"
  _HTTP_BODY="$(echo "${raw_response}" | sed '$d')"

  if [ "${_HTTP_STATUS}" -ge 400 ] 2>/dev/null; then
    return 1
  fi

  return 0
}

# Print rate limit diagnostic info from response headers
print_rate_limit_hint() {
  local token
  token="$(get_github_token)"

  if [ -z "${token}" ]; then
    warn "Tip: Set GITHUB_TOKEN or MB_GITHUB_TOKEN to avoid rate limits and access private repos."
    warn "  export GITHUB_TOKEN=ghp_your_token_here"
  fi
}

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

# ── Version Resolution ───────────────────────────────────────────────

# Strategy 1: Try /releases/latest
resolve_version_from_releases() {
  info "Checking GitHub Releases..."

  if github_api_get "${API_URL}/releases/latest"; then
    local tag
    tag="$(echo "${_HTTP_BODY}" | grep -o '"tag_name":[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tag_name":[[:space:]]*"//;s/"//')"
    if [ -n "${tag}" ]; then
      ok "Found release: ${tag}"
      echo "${tag}"
      return 0
    fi
  fi

  if [ "${_HTTP_STATUS}" = "404" ]; then
    warn "No GitHub Releases found (HTTP 404)."
  elif [ "${_HTTP_STATUS}" = "403" ]; then
    warn "GitHub API rate limited (HTTP 403)."
    print_rate_limit_hint
  elif [ "${_HTTP_STATUS}" = "000" ]; then
    warn "Could not reach GitHub API. Check your internet connection."
  else
    warn "GitHub Releases API returned HTTP ${_HTTP_STATUS}."
  fi

  return 1
}

# Strategy 2: Try /tags to find the latest version tag
resolve_version_from_tags() {
  info "Checking Git tags..."

  if github_api_get "${API_URL}/tags?per_page=10"; then
    local tag
    tag="$(echo "${_HTTP_BODY}" | grep -o '"name":[[:space:]]*"v[^"]*"' | head -1 | sed 's/.*"name":[[:space:]]*"//;s/"//')"
    if [ -n "${tag}" ]; then
      ok "Found tag: ${tag}"
      echo "${tag}"
      return 0
    fi
  fi

  if [ "${_HTTP_STATUS}" = "403" ]; then
    warn "GitHub API rate limited while checking tags (HTTP 403)."
    print_rate_limit_hint
  else
    warn "No version tags found."
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

  info "Strategy: ${BOLD}binary release${NC}"

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

  local -a dl_args=(-fsSL --proto '=https' -o "${tarball_path}")
  local token
  token="$(get_github_token)"
  if [ -n "${token}" ]; then
    dl_args+=(-H "Authorization: Bearer ${token}")
  fi

  curl "${dl_args[@]}" "${download_url}" || {
    error "Failed to download: ${download_url}"
    error "HTTP response may indicate the asset doesn't exist for ${os}-${arch}."

    # Check if the release exists but the asset is missing
    if github_api_get "${API_URL}/releases/tags/${version}"; then
      warn "Release ${version} exists but no asset for ${os}-${arch}."
      warn "Available assets:"
      echo "${_HTTP_BODY}" | grep -o '"name":[[:space:]]*"motherbrain-[^"]*"' | sed 's/.*"name":[[:space:]]*"//;s/"//' | while read -r name; do
        warn "  - ${name}"
      done
      warn ""
      warn "Try building from source: install.sh --from-source"
    fi

    return 1
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
  install_tarball "${tarball_path}" "${version}" "${os}" "${arch}" "${mb_home}"
}

# Install from source (download main tarball, build with pnpm)
install_from_source() {
  local version="$1"
  local mb_home="$2"

  info "Strategy: ${BOLD}build from source${NC}"

  # Check build dependencies
  local missing_deps=()
  if ! command -v node &>/dev/null; then
    missing_deps+=("node (>= 20)")
  fi
  if ! command -v pnpm &>/dev/null; then
    if ! command -v npm &>/dev/null; then
      missing_deps+=("pnpm (or npm to install it)")
    fi
  fi

  if [ ${#missing_deps[@]} -gt 0 ]; then
    error "From-source install requires additional dependencies:"
    for dep in "${missing_deps[@]}"; do
      error "  - ${dep}"
    done
    echo ""
    error "Install Node.js >= 20 and pnpm, then try again."
    error "  Node.js: https://nodejs.org/"
    error "  pnpm:    npm install -g pnpm"
    return 1
  fi

  local node_version
  node_version="$(node --version)"
  info "Using Node.js ${node_version}"

  # Temp directory
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "${tmpdir}"' EXIT

  # Download source tarball
  local source_url="${GITHUB_URL}/archive/refs/heads/main.tar.gz"
  if [ -n "${version}" ] && [ "${version}" != "main" ]; then
    source_url="${GITHUB_URL}/archive/refs/tags/${version}.tar.gz"
  fi

  info "Downloading source from ${source_url}..."
  local source_tarball="${tmpdir}/source.tar.gz"
  curl -fsSL --proto '=https' -o "${source_tarball}" "${source_url}" || {
    # If tag download fails, fall back to main
    if [ "${source_url}" != "${GITHUB_URL}/archive/refs/heads/main.tar.gz" ]; then
      warn "Tag ${version} not found, downloading from main branch..."
      source_url="${GITHUB_URL}/archive/refs/heads/main.tar.gz"
      curl -fsSL --proto '=https' -o "${source_tarball}" "${source_url}" || {
        fatal "Failed to download source from ${source_url}."
      }
    else
      fatal "Failed to download source from ${source_url}."
    fi
  }
  ok "Source downloaded"

  # Extract
  tar -xzf "${source_tarball}" -C "${tmpdir}"
  local source_dir
  source_dir="$(find "${tmpdir}" -maxdepth 1 -type d -name 'mother-brain-*' | head -1)"
  if [ -z "${source_dir}" ]; then
    fatal "Could not find extracted source directory."
  fi

  # Build
  info "Installing dependencies..."
  cd "${source_dir}"

  if command -v pnpm &>/dev/null; then
    pnpm install --frozen-lockfile 2>&1 | tail -3 || pnpm install 2>&1 | tail -3
  else
    info "pnpm not found, using npm..."
    npm install 2>&1 | tail -3
  fi

  info "Building TypeScript..."
  if command -v pnpm &>/dev/null; then
    pnpm build 2>&1 | tail -3
  else
    npm run build 2>&1 | tail -3
  fi
  ok "Build complete"

  # Install to mb_home
  info "Installing to ${mb_home}..."
  mkdir -p "${mb_home}"
  rm -rf "${mb_home}/current"
  mkdir -p "${mb_home}/current"

  # Copy necessary files
  cp -r "${source_dir}/dist" "${mb_home}/current/dist"
  cp -r "${source_dir}/bin" "${mb_home}/current/bin"
  cp "${source_dir}/package.json" "${mb_home}/current/package.json"
  cp -r "${source_dir}/node_modules" "${mb_home}/current/node_modules"

  # Create a wrapper that uses system node
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

  ok "Installed from source (${version})"
}

# Common: extract tarball and install to mb_home/current
install_tarball() {
  local tarball_path="$1"
  local version="$2"
  local os="$3"
  local arch="$4"
  local mb_home="$5"

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
        echo "Usage: install.sh [--version vX.Y.Z] [--from-source]"
        echo ""
        echo "Options:"
        echo "  --version, -v    Install a specific version (default: latest)"
        echo "  --from-source    Build from source instead of downloading a binary"
        echo ""
        echo "Environment:"
        echo "  MB_INSTALL_DIR   Override symlink directory (default: /usr/local/bin)"
        echo "  MB_HOME          Override bundle home (default: ~/.motherbrain)"
        echo "  MB_VERSION       Override version"
        echo "  GITHUB_TOKEN     GitHub API token (avoids rate limits)"
        echo "  MB_GITHUB_TOKEN  Alias for GITHUB_TOKEN (takes priority)"
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

  # Directories
  local mb_home="${MB_HOME:-${MB_HOME_DEFAULT}}"
  local bin_dir
  bin_dir="$(resolve_bin_dir)"
  info "Bundle home: ${mb_home}"
  info "Binary link: ${bin_dir}/${BINARY_NAME}"

  # ── From-source shortcut ──
  if [ "${from_source}" = true ]; then
    version="${version:-${MB_VERSION:-main}}"
    [[ "${version}" != v* && "${version}" != "main" ]] && version="v${version}"
    install_from_source "${version}" "${mb_home}"
    setup_symlink "${mb_home}" "${bin_dir}"
    print_success "${version:-dev}" "${mb_home}" "${bin_dir}"
    return
  fi

  # ── Resolve version ──
  version="${version:-${MB_VERSION:-}}"
  if [ -z "${version}" ]; then
    info "Resolving latest version..."

    # Strategy 1: GitHub Releases
    version="$(resolve_version_from_releases || true)"

    # Strategy 2: Git Tags
    if [ -z "${version}" ]; then
      version="$(resolve_version_from_tags || true)"
    fi

    # Strategy 3: From source (automatic fallback)
    if [ -z "${version}" ]; then
      warn "No releases or tags found. Falling back to from-source install."
      echo ""
      install_from_source "main" "${mb_home}"
      setup_symlink "${mb_home}" "${bin_dir}"
      print_success "dev (from source)" "${mb_home}" "${bin_dir}"
      return
    fi
  fi
  [[ "${version}" != v* ]] && version="v${version}"
  ok "Version: ${version}"

  # ── Try binary release, fall back to from-source ──
  if ! install_from_release "${version}" "${os}" "${arch}" "${mb_home}"; then
    warn "Binary release install failed. Falling back to from-source install."
    echo ""
    install_from_source "${version}" "${mb_home}"
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
  echo "    motherbrain setup       # initialize project and configure .env"
  echo "    motherbrain api start   # start local API on :7337"
  echo "    motherbrain --help      # see all commands"
  echo ""
  echo "  Update later:"
  echo "    motherbrain self-update # update to the latest version"
  echo ""
  echo "  Bundle:  ${mb_home}/current"
  echo "  Binary:  ${bin_dir}/${BINARY_NAME}"
  echo ""
}

main "$@"
