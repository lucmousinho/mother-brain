<p align="center">
  <img src="assets/logo.svg" alt="Mother Brain" width="600" />
</p>

<p align="center">
  <strong>CLI + local API for agent run checkpoints, knowledge tree, hybrid recall, and policy gate.</strong><br/>
  Capture, organize, and recall context across multiple AI agents — all running offline and locally.
</p>

<p align="center">
  <a href="docs/installation.md">Installation</a> &middot;
  <a href="docs/setup.md">Setup</a> &middot;
  <a href="docs/skill.md">Agent Skill</a> &middot;
  <a href="docs/cli.md">CLI</a> &middot;
  <a href="docs/api.md">API</a> &middot;
  <a href="docs/scoped-memory.md">Scoped Memory</a>
</p>

---

## Quick Start

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# Initialize project
motherbrain setup

# Start local API
motherbrain api start

# Record a checkpoint
motherbrain record --file examples/example_run_checkpoint.json

# Recall context
motherbrain recall "deploy staging"
```

---

## Concepts

- **Checkpoints (Runs)** — Append-only JSON records of every agent execution
- **Knowledge Tree** — Structured nodes: projects, goals, tasks, decisions, patterns, constraints, playbooks, agents
- **Recall** — Hybrid search (keyword + semantic + combined) over runs and nodes
- **Policy Gate** — Allow/deny rules for commands, paths, and hosts
- **Scoped Memory** — 3-level hierarchy (Global / Vertical / Project) with inheritance and isolation

---

## Scoped Memory

Organize memory by vertical and project. Recall inherits from ancestors; siblings are isolated.

```
GLOBAL (__global__)
  ├── saude (vertical)
  │   ├── drclick (project)
  │   └── medapp (project)
  └── educacao (vertical)
      └── ativedu (project)
```

```bash
motherbrain context create --name saude --scope vertical
motherbrain context create --name drclick --scope project --parent saude
motherbrain context use drclick
motherbrain recall "deploy" --context drclick
```

See [Scoped Memory](docs/scoped-memory.md) for full details.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Installation](docs/installation.md) | Install, uninstall, and update |
| [Setup](docs/setup.md) | Initialize a project, connect agents |
| [CLI Reference](docs/cli.md) | All commands with flags and examples |
| [API Reference](docs/api.md) | REST endpoints and schemas |
| [Agent Skill](docs/skill.md) | Integration guide for AI agents |
| [Concepts](docs/concepts.md) | Recall modes, embedding pipeline |
| [Scoped Memory](docs/scoped-memory.md) | Hierarchical context system |
| [Configuration](docs/configuration.md) | Environment variables |
| [Deployment](docs/deployment.md) | Running as a service |
| [Development](docs/development.md) | Build from source, project structure |

---

## License

MIT
