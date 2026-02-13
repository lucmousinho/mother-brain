# Mother Brain

**CLI + local API for agent run checkpoints, knowledge tree, hybrid recall, and policy gate.**

Mother Brain provides a unified system to capture, organize, and recall context across multiple AI agents — all running offline and locally.

---

## Concepts

### Checkpoints (Runs)
Every agent execution is captured as a **Run Checkpoint** — an append-only JSON file stored in `motherbrain/checkpoints/v1/YYYY/MM/run_<id>.json`. Each checkpoint contains the agent identity, intent, plan, actions taken, files touched, artifacts, result, constraints applied, and risk flags. Checkpoints are never modified after creation.

### Knowledge Tree
A curated tree of knowledge nodes in `motherbrain/tree/<type>/`. Node types include: **projects**, **goals**, **tasks**, **decisions**, **patterns**, **constraints**, **playbooks**, and **agents**. Each node is a Markdown file with YAML frontmatter and structured sections (Context, References, Next Actions). Nodes are also indexed in SQLite for fast search.

### Recall
Hybrid search over runs and nodes using keyword matching, tag filtering, and recency scoring. Returns the most relevant runs, nodes, applicable constraints, and suggested next actions. Designed to be called **before** an agent executes, providing full context.

### Policy Gate
Allow/deny rules for commands, paths, and hosts. Denylist always wins. If an allowlist exists and a value doesn't match, it's denied. All checks are audited in SQLite. Dangerous commands (`rm -rf /`, `curl | bash`, `mkfs`, etc.) and sensitive paths (`~/.ssh`, `~/.pgpass`) are denied by default.

### Snapshots
Materialized views of the current state: `current_context.md` (human-readable) and `active_tasks.json` (machine-readable). Generated on demand via `snapshot`.

### Compaction
Daily compaction reads all checkpoints for a given day and produces patterns/decisions nodes plus a daily summary markdown.

---

## Installation

### One-liner (macOS and Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

Isso e tudo. Apos rodar esse comando, `motherbrain` fica disponivel como comando global no terminal.

#### O que o install.sh faz, passo a passo

1. Detecta seu sistema operacional e arquitetura (`uname -s`, `uname -m`)
2. Consulta a GitHub Releases API para resolver a versao mais recente
3. Baixa o tarball correto para sua plataforma (ex: `motherbrain-v0.1.0-darwin-arm64.tar.gz`)
4. Baixa o arquivo de checksums e verifica o SHA-256 do tarball
5. Extrai o bundle completo para `~/.motherbrain/current/` — inclui Node.js embutido, o app compilado e todas as dependencias nativas
6. Cria um symlink em `/usr/local/bin/motherbrain` (se tiver permissao de escrita ou sudo) — se nao, usa `~/.local/bin/motherbrain` como fallback
7. Valida a instalacao rodando `motherbrain --version`

Apos a instalacao, abra um **novo terminal** (ou rode `source ~/.bashrc` / `source ~/.zshrc`) e o comando `motherbrain` estara disponivel:

```bash
motherbrain --version
# mother-brain/0.1.0 darwin-arm64 node-v22.12.0

motherbrain --help
```

#### Plataformas suportadas

| OS    | Arquitetura | Suportado |
|-------|-------------|-----------|
| macOS | arm64 (Apple Silicon) | Sim |
| macOS | x64 (Intel) | Sim |
| Linux | x64 | Sim |
| Linux | arm64 | Sim |

#### Variantes de instalacao

```bash
# Instalar uma versao especifica
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --version v0.2.0

# Revisar o script antes de rodar (recomendado para quem quer auditar)
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh -o install.sh
less install.sh
bash install.sh

# Instalar em diretorio customizado
MB_INSTALL_DIR=~/bin curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# Usar diretorio de bundle customizado (default: ~/.motherbrain)
MB_HOME=/opt/motherbrain curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

#### Se `~/.local/bin` nao esta no PATH

Se o instalador usou `~/.local/bin` (porque nao tem sudo), adicione ao seu shell profile:

```bash
# Para bash (~/.bashrc)
echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> ~/.bashrc
source ~/.bashrc

# Para zsh (~/.zshrc)
echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> ~/.zshrc
source ~/.zshrc
```

#### Requisitos

- **Instalacao via binario:** bash, curl, tar — **nao precisa de Node.js** (o runtime vem embutido no bundle)
- **Instalacao via source:** Node.js >= 20, pnpm

---

### Desinstalacao

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/uninstall.sh | bash
```

#### O que o uninstall.sh faz

1. Localiza o symlink `motherbrain` no PATH (`/usr/local/bin` ou `~/.local/bin`)
2. Remove o symlink (pede sudo se necessario)
3. Remove o diretorio do bundle `~/.motherbrain/` com Node.js e app
4. **Nao** remove dados do projeto (`./motherbrain/`, `./storage/`, `./policies/`) — esses ficam intactos

#### Desinstalacao manual

```bash
# Remover o symlink
sudo rm /usr/local/bin/motherbrain
# ou: rm ~/.local/bin/motherbrain

# Remover o bundle
rm -rf ~/.motherbrain
```

---

### Instalacao via source (para desenvolvimento)

```bash
git clone https://github.com/lucmousinho/mother-brain.git && cd mother-brain
pnpm install
pnpm build
node --no-warnings bin/run.js --help
```

---

## Quick Start

Apos instalar, o comando `motherbrain` fica disponivel no terminal. Os **comandos CLI** (init, record, recall, etc.) funcionam imediatamente. A **API local** precisa ser iniciada manualmente — veja abaixo.

```bash
# 1. Inicializar estrutura do projeto (pastas, policies, storage)
motherbrain init

# 2. Ativar modo repo (cria VERSION file)
motherbrain enable

# 3. Iniciar a API local (porta 7337) — roda em foreground
motherbrain api start

# 4. Gravar um checkpoint (em outro terminal, ou antes de iniciar a API)
motherbrain record --file examples/example_run_checkpoint.json

# 5. Criar/atualizar um node na arvore de conhecimento
motherbrain upsert-node --file examples/example_node_task.json

# 6. Buscar contexto (recall hibrido)
motherbrain recall "deploy"

# 7. Checar policy (exit 0 = permitido, exit 3 = negado)
motherbrain policy-check --cmd "git push origin main"
motherbrain policy-check --cmd "rm -rf /"

# 8. Gerar snapshot (current_context.md + active_tasks.json)
motherbrain snapshot

# 9. Compactar checkpoints de um dia em patterns + resumo
motherbrain compact --day 2025-01-15
```

### Sobre a API local

A API **nao** inicia automaticamente apos a instalacao. Ela e um servidor Fastify local que roda em foreground quando voce executa `motherbrain api start`. Para mante-la rodando em background:

```bash
# Opcao 1: rodar em background com nohup
nohup motherbrain api start &

# Opcao 2: rodar em background e redirecionar logs
motherbrain api start > /tmp/motherbrain-api.log 2>&1 &

# Verificar se esta rodando
curl http://127.0.0.1:7337/health
```

#### Persistir a API como servico (opcional)

**macOS (launchd):**

```bash
cat > ~/Library/LaunchAgents/com.motherbrain.api.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.motherbrain.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/motherbrain</string>
    <string>api</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>/Users/SEU_USUARIO/seu-projeto</string>
  <key>StandardOutPath</key>
  <string>/tmp/motherbrain-api.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/motherbrain-api.log</string>
</dict>
</plist>
EOF

# Ativar
launchctl load ~/Library/LaunchAgents/com.motherbrain.api.plist

# Desativar
launchctl unload ~/Library/LaunchAgents/com.motherbrain.api.plist
```

**Linux (systemd):**

```bash
sudo cat > /etc/systemd/system/motherbrain-api.service << 'EOF'
[Unit]
Description=Mother Brain API
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/motherbrain api start
WorkingDirectory=/home/SEU_USUARIO/seu-projeto
Restart=on-failure
RestartSec=5
User=SEU_USUARIO

[Install]
WantedBy=multi-user.target
EOF

# Ativar e iniciar
sudo systemctl daemon-reload
sudo systemctl enable motherbrain-api
sudo systemctl start motherbrain-api

# Ver status / logs
sudo systemctl status motherbrain-api
journalctl -u motherbrain-api -f
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `motherbrain init` | Create folder structure, default policies, storage |
| `motherbrain enable` | Activate repo mode, create VERSION file |
| `motherbrain api start` | Start Fastify API on port 7337 |
| `motherbrain record` | Record a Run Checkpoint (stdin or `--file`) |
| `motherbrain upsert-node` | Create/update a knowledge tree node |
| `motherbrain recall "<query>"` | Hybrid search over runs + nodes |
| `motherbrain policy-check` | Validate cmd/path/host against policies |
| `motherbrain snapshot` | Generate materialized snapshots |
| `motherbrain compact --day YYYY-MM-DD` | Compact a day into patterns + summary |

### record

```bash
# From file
motherbrain record --file run.json

# From stdin
cat run.json | motherbrain record
```

### upsert-node

```bash
# From file
motherbrain upsert-node --file node.json

# From flags
motherbrain upsert-node \
  --id task_001 \
  --type task \
  --title "Deploy staging" \
  --status active \
  --tags deploy,staging
```

### recall

```bash
# JSON output (default)
motherbrain recall "deploy staging"

# Markdown output
motherbrain recall "deploy" --format md

# With filters
motherbrain recall "auth" --limit 5 --tags backend --types task,decision
```

### policy-check

```bash
# Returns exit code 0 (allowed) or 3 (denied)
motherbrain policy-check --cmd "git push origin main"
echo $?  # 0

motherbrain policy-check --cmd "rm -rf /"
echo $?  # 3

motherbrain policy-check --path "~/.ssh"
echo $?  # 3
```

---

## API Endpoints

Start with `motherbrain api start` (default port 7337).

If `MB_TOKEN` is set in `.env`, all requests (except `/health`) require header `X-MB-TOKEN`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/runs` | Record a checkpoint |
| `POST` | `/nodes/upsert` | Create/update a node |
| `GET` | `/recall?q=...` | Hybrid recall |
| `POST` | `/policy/check` | Policy check |

### Examples

```bash
# Health
curl http://127.0.0.1:7337/health

# Record a run
curl -X POST http://127.0.0.1:7337/runs \
  -H "Content-Type: application/json" \
  -d @examples/example_run_checkpoint.json

# Upsert a node
curl -X POST http://127.0.0.1:7337/nodes/upsert \
  -H "Content-Type: application/json" \
  -d @examples/example_node_task.json

# Recall
curl "http://127.0.0.1:7337/recall?q=deploy&limit=5"

# Policy check
curl -X POST http://127.0.0.1:7337/policy/check \
  -H "Content-Type: application/json" \
  -d '{"cmd": "rm -rf /"}'
```

---

## Project Structure

```
mother-brain/
  bin/run.js                  # CLI entry point
  docs/                       # Documentation
  motherbrain/                # Git-friendly versioned data
    checkpoints/v1/           # Append-only run checkpoints (YYYY/MM/)
    tree/                     # Knowledge tree
      projects/
      goals/
      tasks/
      decisions/
      patterns/
      constraints/
      playbooks/
      agents/
    links/by-run/             # Run-to-node links
    snapshots/                # Materialized snapshots
  storage/                    # Local non-versioned state (gitignored)
    locks/                    # File locks
    motherbrain.sqlite        # SQLite DB
  policies/                   # Allow/deny policy files
  src/
    cli/commands/             # oclif CLI commands
    api/                      # Fastify API server + routes
    core/                     # Business logic (schemas, checkpoint, tree, recall, policy, snapshot, compact)
    db/                       # SQLite database layer
    adapters/openclaw/        # OpenClaw adapter
    utils/                    # Utilities (paths, IDs, filelock, markdown)
  templates/                  # Templates for nodes and checkpoints
  examples/                   # Example JSON files
  tests/                      # Vitest tests
```

---

## Integration with OpenClaw

Mother Brain is designed to complement OpenClaw's memory architecture:

1. **Before agent action**: Call `recall` to get relevant context, constraints, and suggested actions.
2. **Before executing**: Call `policy-check` for each command/path/host to enforce security.
3. **After agent action**: Call `record` to persist the run checkpoint.

```
OpenClaw Agent
  │
  ├── 1. GET /recall?q="current task"     → context + constraints
  ├── 2. POST /policy/check               → allow/deny
  ├── 3. [execute action]
  └── 4. POST /runs                        → persist checkpoint
```

See `src/adapters/openclaw/adapter.ts` for a reference mapping from OpenClaw events to Mother Brain checkpoints.

---

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MB_TOKEN` | _(empty)_ | API auth token (header `X-MB-TOKEN`) |
| `MB_API_PORT` | `7337` | API port |
| `MB_DATA_DIR` | `./motherbrain` | Versioned data directory |
| `MB_STORAGE_DIR` | `./storage` | Local state directory |

---

## Development

```bash
# Run CLI in dev mode (no build needed)
pnpm dev init
pnpm dev record --file examples/example_run_checkpoint.json

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format
```

---

## License

MIT
