# Mother Brain Constitution

> **Version:** 1.0.0 | **Ratified:** 2026-02-21 | **Last Amended:** 2026-02-21

Este documento define os princípios fundamentais e inegociáveis do Mother Brain. Todos os componentes, módulos e integrações DEVEM respeitar estes princípios. Violações são bloqueadas automaticamente via gates.

---

## Core Principles

### I. Data Integrity (NON-NEGOTIABLE)

A integridade dos dados é a fundação do Mother Brain.

**Regras:**
- MUST: Todas as queries filtradas por context_id quando scope aplicável
- MUST: Todo user input sanitizado antes de uso em queries
- MUST: Todos os nodes validados antes de save
- MUST: Checkpoints validados com self-critique antes de persistir
- MUST NOT: Mixing data entre contexts sem autorização explícita

**Gates:** Pre-commit validation (checkpoint.validator.ts)

---

### II. Security First (NON-NEGOTIABLE)

Segurança não é opcional.

**Regras:**
- MUST: API autenticada por padrão (MB_TOKEN obrigatório)
- MUST: Token comparison timing-safe (crypto.timingSafeEqual)
- MUST NOT: Raw SQL/filter injection (sanitizeFilterValue obrigatório)
- MUST NOT: Auth desabilitado sem flag explícito (MB_AUTH_DISABLED=true)
- MUST: CORS configurado com allowed origins específicos
- MUST: Rate limiting habilitado (default: 100 req/min por IP)

**Gates:** 
- Pre-commit: security scan
- Runtime: auth middleware + input sanitization

---

### III. Scope Isolation (MUST)

Contextos devem ser isolados, com herança controlada.

**Regras:**
- MUST: Cross-context queries proibidos sem autorização explícita
- MUST: Context resolution via ID, não nome literal
- MUST: Snapshot/compact respeitam scope boundaries
- MUST: Global context (__global__) acessível de qualquer scope
- SHOULD: Vertical contexts herdam de global
- SHOULD: Project contexts herdam de vertical parent

**Hierarquia:**
```
GLOBAL (__global__)
  ├── healthcare (vertical)
  │   ├── project-alpha (project)
  │   └── project-gamma (project)
  └── fintech (vertical)
      └── project-beta (project)
```

**Gates:** buildScopeFilter() enforcement

---

### IV. CLI-First (SHOULD)

O CLI é a interface primária, API é camada secundária.

**Regras:**
- SHOULD: Todas as features funcionam 100% via CLI
- SHOULD: API é layer opcional sobre core logic
- SHOULD: Comandos CLI não dependem de API estar rodando
- MAY: API pode oferecer conveniences (webhooks, integrations)

**Princípio:** CLI > API > UI (se houver)

---

### V. Quality Gates (MUST)

Código não entra em produção sem validação.

**Regras:**
- MUST: `pnpm run lint` passa sem erros
- MUST: `pnpm run typecheck` passa sem erros
- MUST: `pnpm run test` passa sem falhas
- MUST: Security scan passa sem CRITICAL issues
- SHOULD: Cobertura de testes não diminui
- SHOULD: Commits passam por pre-commit hooks

**Layers:**
1. **Pre-commit** (local, <5s): lint + typecheck
2. **Pre-push** (local, <30s): tests + security scan
3. **CI/CD** (cloud, <5min): full validation + coverage

---

### VI. Self-Critique (MUST)

Checkpoints e nodes passam por validação antes de persistir.

**Regras:**
- MUST: Checkpoints validados com CheckpointValidator antes de save
- MUST: Schemas Zod enforced em todas as entradas
- MUST: Validações retornam errors + warnings estruturados
- SHOULD: Warnings logados mas não bloqueiam
- SHOULD: Self-critique detecta summary muito curto (<20 chars)

**Gates:** checkpoint.validator.ts (Fase 3)

---

### VII. Memory Layer Estruturado (SHOULD)

Diferentes tipos de conhecimento devem ser organizados.

**Regras:**
- SHOULD: Insights separados de Gotchas
- SHOULD: Patterns extraídos de runs
- SHOULD: Lessons learned documentados
- SHOULD: Nodes linkados a runs relacionados (refs.runs)
- MAY: Templates para diferentes node types

**Tipos de Memory:**
- **Insights** — Descobertas durante execução
- **Gotchas** — Armadilhas conhecidas + solução
- **Lessons** — Lições aprendidas
- **Patterns** — Padrões recorrentes
- **Decisions** — Decisões arquiteturais (ADRs)

---

### VIII. Recovery & Resilience (SHOULD)

Falhas devem ser rastreadas e recuperadas automaticamente.

**Regras:**
- SHOULD: Tentativas de checkpoint tracked em recovery/attempts.json
- SHOULD: Auto-retry com estratégias alternativas
- SHOULD: Auto-rollback após 3 falhas consecutivas
- SHOULD: Escalate para humano após max retries
- MAY: Rollback logic implementado por tipo de operação

**Gates:** RecoveryTracker (Fase 5)

---

### IX. Agent Authority (MAY)

Diferentes agentes podem ter permissões diferentes.

**Regras:**
- MAY: Contexts podem ter ACLs por agent_id
- MAY: Leitura vs escrita separadas
- MAY: Admin agents podem bypassar scope isolation
- MAY: Audit log de quem fez o quê

**Status:** Future enhancement

---

### X. Zero Breaking Changes (MUST)

Compatibilidade backwards é crítica.

**Regras:**
- MUST: Schema migrations incrementais (nunca drop columns)
- MUST: API routes mantêm compatibilidade (versioning se necessário)
- MUST: CLI commands não mudam behavior sem major version bump
- SHOULD: Deprecation warnings antes de remover features

---

## Governance

### Amendment Process

1. Proposta de mudança documentada com rationale
2. Review por maintainer principal
3. Approval requer consensus se mudança NON-NEGOTIABLE
4. Mudança implementada com atualização de versão
5. CONSTITUTION.md atualizado com data de amendment

### Versioning

- **MAJOR:** Remoção ou redefinição incompatível de princípio NON-NEGOTIABLE
- **MINOR:** Novo princípio ou expansão significativa
- **PATCH:** Clarificações, correções de texto, refinamentos

### Compliance

- Todos os PRs DEVEM verificar compliance com Constitution
- Gates automáticos BLOQUEIAM violações de NON-NEGOTIABLE
- Gates automáticos ALERTAM violações de MUST
- Violações de SHOULD são reportadas mas não bloqueiam
- Violações de MAY são ignoradas (features opcionais)

### Gate Severity Levels

| Severidade | Comportamento | Uso |
|------------|---------------|-----|
| BLOCK | Impede execução, requer correção | NON-NEGOTIABLE |
| WARN | Permite continuar com alerta | MUST |
| INFO | Apenas reporta | SHOULD |
| SILENT | Não reporta | MAY |

---

## References

- **Inspirado por:** AIOS Constitution System
- **Security guidelines:** OWASP Top 10
- **Scope isolation:** Multi-tenant best practices
- **Quality gates:** Defense in Depth principles

---

## Implementation Status

### ✅ Implemented
- [x] Data Integrity (scope filtering)
- [x] Security First (timing-safe auth, sanitization)
- [x] Scope Isolation (buildScopeFilter)
- [x] CLI-First (all features via CLI)

### 🚧 In Progress
- [ ] Quality Gates (pre-commit/pre-push hooks) — Fase 2
- [ ] Self-Critique (CheckpointValidator) — Fase 3
- [ ] Memory Layer Estruturado — Fase 4
- [ ] Recovery & Resilience — Fase 5

### 📋 Planned
- [ ] Agent Authority (ACLs)
- [ ] Zero Breaking Changes (migration framework)

---

*Mother Brain Constitution v1.0.0*  
*Data Integrity | Security First | Scope Isolation | CLI-First | Quality Gates*
