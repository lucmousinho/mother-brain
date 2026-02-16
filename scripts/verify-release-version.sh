#!/usr/bin/env bash
set -euo pipefail

if [ -z "${GITHUB_REF_NAME:-}" ]; then
  echo "[verify-release-version] GITHUB_REF_NAME not set; skipping."
  exit 0
fi

TAG="${GITHUB_REF_NAME}"
TAG_SEMVER="${TAG#v}"
PKG_VERSION="$(node -p "require('./package.json').version")"

if [ "${PKG_VERSION}" != "${TAG_SEMVER}" ]; then
  echo "[verify-release-version] ERROR: tag and package.json version mismatch"
  echo "  tag:           ${TAG}"
  echo "  package.json:  ${PKG_VERSION}"
  echo ""
  echo "Fix: bump package.json version to ${TAG_SEMVER} before creating the tag."
  exit 1
fi

echo "[verify-release-version] OK: ${TAG} matches package.json (${PKG_VERSION})"
