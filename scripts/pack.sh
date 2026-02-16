#!/usr/bin/env bash
#
# Pack Mother Brain into a standalone tarball.
#
# This script creates a self-contained tarball that includes:
#   - Node.js runtime (downloaded for target platform)
#   - Compiled dist/ and node_modules/
#   - A shell wrapper that invokes node with the CLI entrypoint
#
# Required env:
#   TARGET_OS   — linux | darwin
#   TARGET_ARCH — x64 | arm64
#
# Output: release/motherbrain-<tag>-<os>-<arch>.tar.gz
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_OS="${TARGET_OS:?TARGET_OS is required (linux|darwin)}"
TARGET_ARCH="${TARGET_ARCH:?TARGET_ARCH is required (x64|arm64)}"

# Resolve version from git tag or package.json
if [ -n "${GITHUB_REF_NAME:-}" ]; then
  VERSION="${GITHUB_REF_NAME}"
else
  VERSION="v$(node -p "require('./package.json').version")"
fi

NODE_VERSION="22.12.0"
NODE_DIST_BASE="https://nodejs.org/dist/v${NODE_VERSION}"

echo "=== Mother Brain Pack ==="
echo "  Version:  ${VERSION}"
echo "  Target:   ${TARGET_OS}-${TARGET_ARCH}"
echo "  Node:     v${NODE_VERSION}"
echo ""

# ── Create staging directory ─────────────────────────────────────

STAGE_DIR="${PROJECT_DIR}/.pack-stage"
RELEASE_DIR="${PROJECT_DIR}/release"
BUNDLE_NAME="motherbrain-${VERSION}-${TARGET_OS}-${TARGET_ARCH}"
BUNDLE_DIR="${STAGE_DIR}/${BUNDLE_NAME}"

rm -rf "${STAGE_DIR}"
mkdir -p "${BUNDLE_DIR}" "${RELEASE_DIR}"

# ── Download Node.js for target ──────────────────────────────────

NODE_FILENAME="node-v${NODE_VERSION}-${TARGET_OS}-${TARGET_ARCH}"
NODE_TARBALL="${NODE_FILENAME}.tar.gz"
NODE_URL="${NODE_DIST_BASE}/${NODE_TARBALL}"

echo "Downloading Node.js: ${NODE_URL}"
curl -fsSL -o "${STAGE_DIR}/${NODE_TARBALL}" "${NODE_URL}"
tar -xzf "${STAGE_DIR}/${NODE_TARBALL}" -C "${STAGE_DIR}"

# Copy only the node binary
mkdir -p "${BUNDLE_DIR}/runtime"
cp "${STAGE_DIR}/${NODE_FILENAME}/bin/node" "${BUNDLE_DIR}/runtime/node"
chmod +x "${BUNDLE_DIR}/runtime/node"

echo "Node.js binary: $(du -h "${BUNDLE_DIR}/runtime/node" | awk '{print $1}')"

# ── Copy application files ───────────────────────────────────────

# dist (compiled TS)
cp -r "${PROJECT_DIR}/dist" "${BUNDLE_DIR}/dist"

# bin
cp -r "${PROJECT_DIR}/bin" "${BUNDLE_DIR}/bin"

# package.json (needed by oclif for config)
cp "${PROJECT_DIR}/package.json" "${BUNDLE_DIR}/package.json"

# Stamp the release version so `motherbrain --version` reports the correct tag
SEMVER="${VERSION#v}"
node -e "
  const fs = require('fs');
  const p = process.argv[1];
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = process.argv[2];
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
" "${BUNDLE_DIR}/package.json" "${SEMVER}"

# node_modules (production only)
cd "${PROJECT_DIR}"
# Use a clean production install in the bundle
cp "${PROJECT_DIR}/pnpm-lock.yaml" "${BUNDLE_DIR}/pnpm-lock.yaml"

# Install prod deps into bundle
cd "${BUNDLE_DIR}"
npm install --omit=dev --ignore-scripts 2>/dev/null || true

# Rebuild native modules for target (better-sqlite3)
# On CI, the runner matches the target arch, so we can rebuild directly
if [ -d "${BUNDLE_DIR}/node_modules/better-sqlite3" ]; then
  cd "${BUNDLE_DIR}/node_modules/better-sqlite3"
  npx --yes node-gyp rebuild 2>/dev/null || {
    echo "Warning: node-gyp rebuild failed for better-sqlite3 — trying prebuild..."
    cd "${BUNDLE_DIR}"
    npx --yes prebuild-install --runtime napi --target 9 2>/dev/null || true
  }
fi

cd "${PROJECT_DIR}"

# Remove pnpm-lock from bundle (not needed at runtime)
rm -f "${BUNDLE_DIR}/pnpm-lock.yaml"

# ── Create wrapper script ────────────────────────────────────────

cat > "${BUNDLE_DIR}/bin/motherbrain" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

# Resolve the real path of this script (follow symlinks)
SELF="${BASH_SOURCE[0]}"
while [ -L "${SELF}" ]; do
  DIR="$(cd "$(dirname "${SELF}")" && pwd)"
  SELF="$(readlink "${SELF}")"
  [[ "${SELF}" != /* ]] && SELF="${DIR}/${SELF}"
done
BUNDLE_DIR="$(cd "$(dirname "${SELF}")/.." && pwd)"

# Use bundled Node.js
NODE="${BUNDLE_DIR}/runtime/node"
if [ ! -x "${NODE}" ]; then
  # Fallback to system node
  NODE="$(command -v node 2>/dev/null || true)"
  if [ -z "${NODE}" ]; then
    echo "Error: Node.js not found. The bundled runtime is missing." >&2
    exit 1
  fi
fi

exec "${NODE}" --no-warnings "${BUNDLE_DIR}/bin/run.js" "$@"
WRAPPER
chmod +x "${BUNDLE_DIR}/bin/motherbrain"

# ── Create the installer-friendly top-level binary ───────────────
# The install.sh installs THIS file to /usr/local/bin/motherbrain.
# It must know the absolute path to the bundle (set at install time).
# Strategy: ship a self-relocating wrapper that finds its bundle
# relative to the symlink target or the script itself.

cat > "${BUNDLE_DIR}/motherbrain" << 'TOP_WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

# Resolve the real path of this script (follow symlinks)
SELF="${BASH_SOURCE[0]}"
while [ -L "${SELF}" ]; do
  DIR="$(cd "$(dirname "${SELF}")" && pwd)"
  SELF="$(readlink "${SELF}")"
  [[ "${SELF}" != /* ]] && SELF="${DIR}/${SELF}"
done
BUNDLE_DIR="$(cd "$(dirname "${SELF}")" && pwd)"

# Use bundled Node.js
NODE="${BUNDLE_DIR}/runtime/node"
if [ ! -x "${NODE}" ]; then
  NODE="$(command -v node 2>/dev/null || true)"
  if [ -z "${NODE}" ]; then
    echo "Error: Node.js not found. The bundled runtime is missing." >&2
    exit 1
  fi
fi

exec "${NODE}" --no-warnings "${BUNDLE_DIR}/bin/run.js" "$@"
TOP_WRAPPER
chmod +x "${BUNDLE_DIR}/motherbrain"

# ── Create tarball ───────────────────────────────────────────────

TARBALL="${RELEASE_DIR}/${BUNDLE_NAME}.tar.gz"
cd "${STAGE_DIR}"
tar -czf "${TARBALL}" "${BUNDLE_NAME}"

echo ""
echo "=== Pack complete ==="
echo "  Tarball: ${TARBALL}"
echo "  Size:    $(du -h "${TARBALL}" | awk '{print $1}')"

# ── Cleanup ──────────────────────────────────────────────────────

rm -rf "${STAGE_DIR}"
