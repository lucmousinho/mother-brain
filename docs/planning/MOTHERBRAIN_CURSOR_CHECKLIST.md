# Mother Brain — Checklist de Garantias (execução com Cursor CLI)

Objetivo: transformar as promessas em garantias técnicas auditáveis.

## 0) Definição de Garantia (antes de codar)

- [ ] Definir **SLO/SLA de memória** por item (ex.: taxa de leakage < 0.5% em suíte adversarial)
- [ ] Definir o que significa “garantido” (policy + teste automatizado + observabilidade)
- [ ] Definir níveis: `experimental` / `enforced` / `audited`

---

## 1) 🧠 Cérebro Global (fundamentos, padrões gerais)

### Estado-alvo
Um namespace global único, estável, consultável com versionamento.

### Implementação
- [ ] Criar namespace canônico: `global`
- [ ] Padronizar schema de memória (`id`, `scope`, `source`, `created_at`, `ttl`, `confidence`, `tags`)
- [ ] Garantir idempotência no write (dedupe por hash semântico + janela temporal)
- [ ] Criar política de retenção (TTL + compactação)

### Testes
- [ ] Teste de recall em consultas para fundamentos
- [ ] Teste de dedupe e consistência de schema

### Evidência de garantia
- [ ] Dashboard com cobertura de recall global
- [ ] Auditoria de entradas inválidas bloqueadas

---

## 2) 🏢 Cérebro por Vertical (HealthTech, EdTech, Games)

### Estado-alvo
Memória por domínio com isolamento lógico e fallback controlado para global.

### Implementação
- [ ] Namespaces: `vertical:<slug>` (ex.: `vertical:healthtech`)
- [ ] Router de contexto por intenção/metadata (não apenas heurística fraca)
- [ ] Política de herança: `vertical -> global` (somente leitura, conforme ACL)
- [ ] Catálogo de verticais + playbooks por vertical

### Testes
- [ ] Recall correto por vertical
- [ ] Não retornar memória de vertical errada em prompts ambíguos

### Evidência de garantia
- [ ] Log explicável: “por que escolheu vertical X”

---

## 3) 📦 Cérebro por Projeto

### Estado-alvo
Projeto como tenant primário para execução operacional.

### Implementação
- [ ] Namespace: `project:<project_id>`
- [ ] Resolver automático por repo/path/canal/sessão
- [ ] Isolar índice vetorial por projeto **ou** filtro obrigatório por `project_id`
- [ ] Tags mínimas obrigatórias no write: `project_id`, `vertical`, `environment`

### Testes
- [ ] Suite de cross-project leakage
- [ ] Teste de fallback para `vertical/global` quando `project_id` ausente

### Evidência de garantia
- [ ] Métrica de false-positive de projeto

---

## 4) 🤖 Multi-agente isolado por escopo

### Estado-alvo
Cada agente/sessão só enxerga o que seu escopo permite.

### Implementação
- [ ] Namespace: `agent:<agent_id>` e `session:<session_id>`
- [ ] ACL read/write por escopo (agent/session/project/vertical/global)
- [ ] Políticas default “deny by default” para escrita cross-scope
- [ ] Propagação opcional via handoff explícito (com aprovação)

### Testes
- [ ] Agente A não lê memória privada do agente B
- [ ] Handoff cria trilha auditável

### Evidência de garantia
- [ ] Auditoria por `who-read-what` e `who-wrote-what`

---

## 5) 🧬 Herança hierárquica controlada

### Estado-alvo
Ordem de resolução previsível e configurável.

### Implementação
- [ ] Definir ordem padrão: `session > agent > project > vertical > global`
- [ ] Implementar pesos/priority no recall
- [ ] Permitir override por task (ex.: software-only ativa vertical engenharia)
- [ ] “Fail-closed”: sem contexto confiável, não injeta memória cruzada

### Testes
- [ ] Casos de empate e conflito
- [ ] Regressão: mudança de ordem não quebra outputs críticos

### Evidência de garantia
- [ ] Trace com árvore de resolução por resposta

---

## 6) 🚫 Sem contaminação de memória

### Estado-alvo
Mitigação forte de vazamento e escrita indevida.

### Implementação
- [ ] Separar índices/coleções por escopo crítico
- [ ] Filtro obrigatório por escopo em toda consulta
- [ ] Sanitização de write (bloquear dados sem escopo ou escopo inválido)
- [ ] Quarentena para memória de baixa confiança
- [ ] Data governance: PII tags + redaction quando necessário

### Testes
- [ ] Adversarial leakage suite
- [ ] Canary prompts para detectar contaminação
- [ ] Chaos test com contexto ambíguo

### Evidência de garantia
- [ ] KPI: leakage rate, cross-scope hits, blocked writes

---

## 7) 🔁 Comportamento contextual automático

### Estado-alvo
Enriquecimento automático robusto, observável e não-bloqueante.

### Implementação
- [ ] Expandir hooks para todos eventos relevantes (não só command)
- [ ] Injeção contextual com budget de tokens e ranking de relevância
- [ ] Graceful degradation quando MB indisponível
- [ ] Cache de contexto curto com invalidação

### Testes
- [ ] Latência p95/p99 de enrich
- [ ] Qualidade de resposta com/sem contexto
- [ ] Não bloquear resposta do usuário em falhas

### Evidência de garantia
- [ ] Painel de latência, hit-rate e impacto no resultado

---

## 8) Controles transversais (obrigatório para “garantir”)

- [ ] **Versionamento de policy** de memória
- [ ] **Feature flags** por capacidade (vertical, project, isolation)
- [ ] **Migração de dados** com rollback
- [ ] **Observabilidade** (logs estruturados + métricas + traces)
- [ ] **Segurança** (token scope mínimo, rotação, rate limit)
- [ ] **Runbook de incidente** para vazamento/contexto incorreto

---

## 9) Plano de execução no Cursor CLI (3 fases)

## Fase 1 — Enforcement mínimo (1–2 sprints)
- [ ] Namespaces obrigatórios
- [ ] ACL básica
- [ ] Ordem de herança fixa
- [ ] Filtro de escopo em recall
- [ ] Logs de auditoria básicos

## Fase 2 — Robustez (1–2 sprints)
- [ ] Router automático forte
- [ ] Índice por projeto/vertical
- [ ] Testes adversariais
- [ ] Dashboards/KPIs

## Fase 3 — Garantia auditável (1 sprint)
- [ ] Gates de CI (bloqueia merge se leakage > limite)
- [ ] Certificação interna de “enforced + audited”
- [ ] Runbook + drills de incidente

---

## 10) Backlog de tarefas (issue template)

Copiar para cada item:

- **Título:** `[MB] <capacidade> - <entrega>`
- **Escopo:** `global|vertical|project|agent|session`
- **Definition of Done:** policy + testes + observabilidade
- **Risco:** baixo/médio/alto
- **Métrica de sucesso:** ex. leakage < 0.5%
- **Rollback:** como desativar/reverter

---

## 11) Prompts para Cursor CLI (kickstart)

### Prompt 1 — Arquitetura
"Implemente namespace e ACL de memória no Mother Brain com hierarquia `session > agent > project > vertical > global`, deny-by-default para cross-scope write, e filtros obrigatórios no recall. Entregar com testes unitários e integração."

### Prompt 2 — Testes adversariais
"Crie suíte adversarial de memory leakage entre project/vertical/agent, com casos ambíguos e canary prompts. Gere relatório com taxa de leakage e falsos positivos."

### Prompt 3 — Observabilidade
"Adicione logs estruturados de resolução de contexto (scope escolhido, fallback, motivo), métricas p95/p99 de recall/enrich e dashboard de hit-rate por escopo."

---

## 12) Critério final de aceite (go-live)

Só considerar “garantido” quando todos abaixo forem verdade:
- [ ] Policy ativa e versionada
- [ ] Testes adversariais no CI passando
- [ ] KPIs dentro de limite por 7+ dias
- [ ] Auditoria de acesso habilitada
- [ ] Runbook validado em simulação
