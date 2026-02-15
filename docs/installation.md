# Installation

## One-liner (macOS and Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

After running this command, `motherbrain` is available as a global command in your terminal.

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

### Supported platforms

| OS    | Architecture | Supported |
|-------|--------------|-----------|
| macOS | arm64 (Apple Silicon) | Yes |
| macOS | x64 (Intel) | Yes |
| Linux | x64 | Yes |
| Linux | arm64 | Yes |

### Install variants

```bash
# Install a specific version
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --version v0.2.0

# Review the script before running (recommended for security-conscious users)
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh -o install.sh
less install.sh
bash install.sh

# Custom symlink directory
MB_INSTALL_DIR=~/bin curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# Custom bundle home directory (default: ~/.motherbrain)
MB_HOME=/opt/motherbrain curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
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

### Requirements

- **Binary install:** bash, curl, tar — **no Node.js required** (the runtime is bundled)
- **From source:** Node.js >= 20, pnpm

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

## Install from source

See [Development](./development.md) for building from source.
