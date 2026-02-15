# Installation

## One-liner (macOS and Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

After running this command, `motherbrain` is available as a global command in your terminal.

> **Note:** The installer requires a published GitHub Release with platform tarballs.
> If no releases exist yet, the installer automatically falls back to building from source.
> See [Publishing releases](#publishing-releases-for-maintainers) to create the first release.

### What install.sh does, step by step

1. Detects your operating system and architecture (`uname -s`, `uname -m`)
2. Queries the GitHub Releases API to resolve the latest version
3. Downloads the correct tarball for your platform (e.g. `motherbrain-v0.1.0-darwin-arm64.tar.gz`)
4. Downloads the checksums file and verifies the SHA-256 of the tarball
5. Extracts the full bundle to `~/.motherbrain/current/` — includes a bundled Node.js runtime, the compiled app, and all native dependencies
6. Creates a symlink at `/usr/local/bin/motherbrain` (if writable or sudo is available) — otherwise falls back to `~/.local/bin/motherbrain`
7. Validates the installation by running `motherbrain --version`

After installation, open a **new terminal** (or run `source ~/.bashrc` / `source ~/.zshrc`) and the `motherbrain` command will be available:

```bash
motherbrain --version
# mother-brain/0.1.0 darwin-arm64 node-v22.12.0

motherbrain --help
```

### Fallback strategies

The installer tries three strategies in order:

1. **GitHub Release** (default) — downloads a pre-built binary tarball for your platform
2. **Git Tags** — if no releases exist yet, resolves the latest `v*` tag and tries to download its release assets
3. **From Source** — if neither releases nor tags exist, downloads the source from `main`, builds with `pnpm`, and installs to `~/.motherbrain/current/`

This means the installer works even before the first GitHub Release is published.

### Supported platforms

| OS    | Architecture | Binary release | From source |
|-------|--------------|----------------|-------------|
| macOS | arm64 (Apple Silicon) | Yes | Yes |
| macOS | x64 (Intel) | No (use `--from-source`) | Yes |
| Linux | x64 | Yes | Yes |
| Linux | arm64 | Yes | Yes |

### Install variants

```bash
# Install a specific version
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --version v0.2.0

# Build from source (requires Node.js LTS 22 and pnpm)
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --from-source

# Review the script before running (recommended for security-conscious users)
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh -o install.sh
less install.sh
bash install.sh

# Custom symlink directory
MB_INSTALL_DIR=~/bin curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# Custom bundle home directory (default: ~/.motherbrain)
MB_HOME=/opt/motherbrain curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# With GitHub token (avoids rate limits)
GITHUB_TOKEN=ghp_xxx curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# Debug mode (verbose HTTP diagnostics)
MB_INSTALL_DEBUG=1 curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

### From-source requirements

When building from source (either via `--from-source` or automatic fallback), you need:

- **Node.js LTS 22** (recommended). Node 20 also works. Node 24+ may fail to compile native modules.
- **pnpm** (or npm as fallback)
- **C++ toolchain** for native modules (better-sqlite3):

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y python3 make g++ pkg-config

# Fedora / RHEL
sudo dnf install python3 make gcc-c++ pkg-config

# macOS (if not already installed)
xcode-select --install
```

### If `~/.local/bin` is not in your PATH

If the installer used `~/.local/bin` (because sudo is not available), add it to your shell profile:

```bash
# For bash (~/.bashrc)
echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> ~/.bashrc
source ~/.bashrc

# For zsh (~/.zshrc)
echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> ~/.zshrc
source ~/.zshrc
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `MB_INSTALL_DIR` | Override symlink directory (default: `/usr/local/bin`) |
| `MB_HOME` | Override bundle home (default: `~/.motherbrain`) |
| `MB_VERSION` | Override version (default: latest) |
| `GITHUB_TOKEN` | GitHub API token (avoids rate limits, required for private repos) |
| `MB_GITHUB_TOKEN` | Alias for `GITHUB_TOKEN` (takes priority) |
| `MB_INSTALL_DEBUG` | Set to `1` for verbose HTTP/version diagnostics |

---

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/uninstall.sh | bash
```

### What uninstall.sh does

1. Locates the `motherbrain` symlink in PATH (`/usr/local/bin` or `~/.local/bin`)
2. Removes the symlink (requests sudo if needed)
3. Removes the bundle directory `~/.motherbrain/` containing Node.js and the app
4. Does **not** remove project data (`./motherbrain/`, `./storage/`, `./policies/`) — those remain untouched

### Manual uninstall

```bash
# Remove the symlink
sudo rm /usr/local/bin/motherbrain
# or: rm ~/.local/bin/motherbrain

# Remove the bundle
rm -rf ~/.motherbrain
```

---

## Updating

```bash
# Check if an update is available
motherbrain self-update --check-only

# Update to the latest version
motherbrain self-update

# Update without confirmation prompt
motherbrain self-update --yes

# Update to a specific version
motherbrain self-update --version v0.3.0
```

The update process: downloads the new release, verifies the SHA-256 checksum, backs up the current installation to `~/.motherbrain/previous/`, and atomically swaps the bundle. If anything fails, the previous version is automatically restored.

| Flag | Short | Description |
|------|-------|-------------|
| `--check-only` | | Only check, do not install |
| `--yes` | `-y` | Skip confirmation prompt |
| `--force` | `-f` | Force update even if checksum unavailable |
| `--version` | `-v` | Target a specific version tag |

---

## Publishing releases (for maintainers)

The repo includes a GitHub Actions workflow (`.github/workflows/release.yml`) that automatically builds platform tarballs when a version tag is pushed.

### Creating the first release

```bash
# Ensure everything builds and tests pass
pnpm build && pnpm test

# Create and push the tag
git tag v0.1.0
git push origin v0.1.0
```

This triggers the release workflow which:
1. Builds standalone tarballs for 3 platforms (linux-x64, linux-arm64, darwin-arm64)
2. Runs tests on each platform
3. Generates SHA-256 checksums
4. Creates a GitHub Release with all assets attached

Once published, the install.sh one-liner will download the binary release automatically.

### Subsequent releases

```bash
# Bump version in package.json, commit, then tag
git tag v0.2.0
git push origin v0.2.0
```

The installer will automatically pick up the new release as "latest".

### Supported release platforms

| Platform | Runner | Notes |
|----------|--------|-------|
| linux-x64 | `ubuntu-latest` | Native build |
| linux-arm64 | `ubuntu-latest` | Downloads arm64 Node binary; native modules use prebuild |
| darwin-arm64 | `macos-14` | Native Apple Silicon build |

macOS Intel (darwin-x64) is not included in the release matrix. Intel Mac users can install with `--from-source`.

---

## Install from source

See [Development](./development.md) for building from source.
