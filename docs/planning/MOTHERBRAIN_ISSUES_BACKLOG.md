# MOTHERBRAIN_ISSUES_BACKLOG

Formato: ID | Fase | Título | Dependências | Esforço | Risco | DoD

## Fase 1
- MB-001 | F1 | Definir schema canônico de memória | - | M | Médio | schema versionado + validação automatizada
- MB-002 | F1 | Implementar namespace obrigatório no write | MB-001 | M | Médio | rejeita writes sem scope
- MB-003 | F1 | Dedupe semântico e idempotência de write | MB-001 | M | Médio | testes de duplicidade
- MB-004 | F1 | Criar ACL base read/write por escopo | MB-002 | M | Alto | deny-by-default ativo
- MB-005 | F1 | Filtro obrigatório de escopo no recall | MB-004 | M | Alto | consultas sem escopo bloqueadas/falham fechado
- MB-006 | F1 | Resolver herança `session>agent>project>vertical>global` | MB-004,MB-005 | M | Médio | ordem aplicada e testada
- MB-007 | F1 | Fail-closed para contexto ambíguo | MB-006 | S | Médio | sem injeção cruzada em baixa confiança
- MB-008 | F1 | Logs estruturados mínimos da resolução | MB-006 | S | Baixo | log com scope+motivo+fallback

## Fase 2
- MB-101 | F2 | Catálogo de verticais e namespaces `vertical:<slug>` | MB-006 | M | Médio | catálogo ativo + consulta por vertical
- MB-102 | F2 | Roteador automático de vertical por metadata/intenção | MB-101 | M | Médio | acurácia mínima atingida
- MB-103 | F2 | Namespace de projeto `project:<id>` | MB-006 | M | Médio | tagging obrigatório em write
- MB-104 | F2 | Resolução automática de project_id (repo/path/canal/sessão) | MB-103 | L | Alto | cobertura de resolução >= meta
- MB-105 | F2 | Isolamento vetorial por projeto ou filtro hard | MB-104 | L | Alto | zero vazamento cross-project em canário
- MB-106 | F2 | Isolamento multi-agente (`agent:<id>`, `session:<id>`) | MB-004 | M | Alto | sem acesso indevido entre agentes
- MB-107 | F2 | Handoff explícito entre agentes com auditoria | MB-106 | M | Médio | trilha completa de transferência

## Fase 3
- MB-201 | F3 | Suíte adversarial de leakage (cross-scope) | MB-105,MB-106 | M | Médio | taxa de leakage reportada automaticamente
- MB-202 | F3 | Canary prompts contínuos | MB-201 | S | Baixo | execução periódica + histórico
- MB-203 | F3 | KPIs e dashboards (hit-rate, leakage, latência) | MB-008,MB-201 | M | Médio | painel operacional publicado
- MB-204 | F3 | Gate CI bloqueando leakage > limite | MB-201 | S | Médio | pipeline com threshold enforce
- MB-205 | F3 | Runbook de incidente + drill | MB-203 | S | Baixo | simulação concluída e registrada

---

## Critérios de priorização
1) Segurança/isolamento primeiro
2) Impacto operacional segundo
3) Otimização de qualidade depois

## Template curto de issue
- Escopo:
- Contexto:
- Tarefa técnica:
- Dependências:
- Risco:
- Esforço (S/M/L):
- DoD:
- Métrica de sucesso:
- Rollback:
