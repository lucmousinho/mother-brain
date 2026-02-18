# MOTHERBRAIN_IMPLEMENTATION_ROADMAP

## Objetivo
Implementar garantias auditáveis para 7 pilares de memória organizacional multi-tenant.

## Ordem Macro (dependências)
1. Fundamentos: namespace + schema + policy versionada
2. Isolamento: ACL + filtros obrigatórios + resolução hierárquica
3. Especialização: vertical e projeto com roteador automático
4. Operação: observabilidade, KPIs, testes adversariais, gates de CI

---

## Fase 1 — Enforcement mínimo (MVP seguro)
**Entrada:** checklist aprovado.
**Saída:** isolamento e herança funcionando com testes básicos.

### EPIC F1.1 — Namespace e schema canônico
- Escopo: global, vertical, project, agent, session
- Entregas:
  - `scope` obrigatório em write
  - schema (`id, scope, source, created_at, ttl, confidence, tags`)
  - dedupe por hash semântico
- Risco: médio | Esforço: M
- DoD: writes sem scope rejeitados; testes de validação passando.

### EPIC F1.2 — ACL e deny-by-default
- Entregas:
  - matriz de permissões read/write por escopo
  - bloqueio de cross-scope write por padrão
  - filtro obrigatório de escopo no recall (deny sem escopo)
- Risco: alto | Esforço: M
- DoD: suíte de autorização cobrindo casos positivos/negativos; consultas sem escopo bloqueadas.

### EPIC F1.3 — Herança controlada
- Ordem padrão: `session > agent > project > vertical > global`
- Entregas:
  - resolvedor com prioridade configurável
  - fallback explícito e fail-closed
  - logs estruturados mínimos da resolução (scope, fallback, motivo)
- Risco: médio | Esforço: M
- DoD: testes de ordem e conflitos; trace de resolução registrado; logs estruturados ativos.

---

## Fase 2 — Robustez operacional
**Entrada:** Fase 1 estável com logs básicos.
**Saída:** roteamento automático + isolamento por projeto/vertical validado.

### EPIC F2.1 — Cérebro por vertical
- Entregas:
  - namespaces `vertical:<slug>`
  - catálogo de verticais + playbooks
  - fallback vertical→global (read-only, via ACL)
- Risco: médio | Esforço: M
- DoD: acerto de roteamento vertical acima de meta definida.

### EPIC F2.2 — Cérebro por projeto
- Entregas:
  - namespace `project:<id>`
  - resolução por repo/path/canal/sessão
  - índice separado por projeto ou filtro obrigatório por project_id
- Risco: alto | Esforço: L
- DoD: zero cross-project hits em suíte canário controlada.

### EPIC F2.3 — Multi-agente isolado
- Entregas:
  - namespace `agent:<id>` e `session:<id>`
  - handoff explícito com trilha de auditoria
- Risco: alto | Esforço: M
- DoD: agente A não acessa privado de B sem handoff autorizado.

---

## Fase 3 — Garantia auditável
**Entrada:** Fase 2 estável com logs/traces ativos e isolamento validado.
**Saída:** gates de qualidade + runbook + operação contínua.

### EPIC F3.1 — Testes adversariais e leakage
- Entregas:
  - suíte adversarial (ambíguo, injection, cross-scope)
  - canary prompts recorrentes
- Risco: médio | Esforço: M
- DoD: leakage abaixo do threshold por janela contínua.

### EPIC F3.2 — Observabilidade e auditoria
- Entregas:
  - logs estruturados (scope escolhido, fallback, motivo)
  - métricas p95/p99 de recall/enrich
  - auditoria who-read-what / who-wrote-what
- Risco: médio | Esforço: M
- DoD: dashboard + alertas + trilha auditável.

### EPIC F3.3 — Go-live gates
- Entregas:
  - gate CI bloqueando merge se leakage > limite
  - runbook de incidente e drill
- Risco: médio | Esforço: S
- DoD: simulação de incidente concluída.

---

## KPIs mínimos
- Leakage rate cross-scope
- False-positive de projeto/vertical
- Recall hit-rate por escopo
- p95/p99 de latência enrich/recall
- Taxa de writes bloqueados por policy
