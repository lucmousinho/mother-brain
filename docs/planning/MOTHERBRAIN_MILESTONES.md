# MOTHERBRAIN_MILESTONES

## Milestone M1 — Policy + Enforcement Base
**Período:** Sprint 1-2
**Inclui:** MB-001..MB-008

### Entrada
- Checklist aprovado
- Time alinhado na ordem de herança e escopos

### Saída (aceite)
- Namespace e schema obrigatórios em produção
- ACL deny-by-default ativa
- Recall com filtro obrigatório por escopo
- Fail-closed em ambiguidade
- Logs estruturados mínimos ativos

---

## Milestone M2 — Especialização por vertical/projeto + isolamento multi-agente
**Período:** Sprint 3-4
**Inclui:** MB-101..MB-107

### Entrada
- M1 estável
- Taxa de erro operacional controlada

### Saída (aceite)
- Vertical routing ativo
- Project routing ativo
- Isolamento vetorial/filtro hard por projeto
- Multi-agente isolado com handoff auditável

---

## Milestone M3 — Garantia auditável contínua
**Período:** Sprint 5
**Inclui:** MB-201..MB-205

### Entrada
- M2 com telemetria completa

### Saída (aceite)
- Suíte adversarial contínua
- KPI de leakage dentro do limite por janela de 7 dias
- Gate de CI ativo para leakage
- Runbook e drill de incidente concluídos

---

## Mapeamento 7 pilares -> milestones
1. Cérebro Global -> M1
2. Cérebro por Vertical -> M2
3. Cérebro por Projeto -> M2
4. Multi-agente isolado -> M2
5. Herança hierárquica controlada -> M1
6. Sem contaminação de memória -> M1+M2+M3
7. Comportamento contextual automático -> M1+M2

---

## KPIs de go-live (obrigatórios)
- Leakage cross-scope <= limite definido
- False-positive de roteamento (project/vertical) <= limite definido
- p95 de recall/enrich <= limite definido
- 100% dos acessos com trilha de auditoria
- 100% dos merges críticos protegidos por gate de leakage
