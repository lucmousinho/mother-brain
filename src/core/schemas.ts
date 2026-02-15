import { z } from 'zod';

// ── Run Checkpoint v1 ──────────────────────────────────────────────

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  session_id: z.string().optional(),
});

export const IntentSchema = z.object({
  goal: z.string().min(1),
  context: z.array(z.string()).default([]),
});

export const PlanStepSchema = z.object({
  step: z.number(),
  description: z.string(),
  status: z.enum(['pending', 'done', 'skipped']).default('pending'),
});

export const ActionSchema = z.object({
  type: z.string().min(1),
  command: z.string().optional(),
  path: z.string().optional(),
  host: z.string().optional(),
  detail: z.string().optional(),
  timestamp: z.string().optional(),
});

export const ArtifactSchema = z.object({
  type: z.string().min(1),
  path: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
});

export const ResultSchema = z.object({
  status: z.enum(['success', 'failure', 'partial', 'aborted']),
  summary: z.string(),
});

export const LinksSchema = z.object({
  nodes: z.array(z.string()).default([]),
});

export const RunCheckpointSchema = z.object({
  version: z.literal('v1').default('v1'),
  run_id: z.string().optional(),
  timestamp: z.string().optional(),
  agent: AgentSchema,
  intent: IntentSchema,
  plan: z.array(PlanStepSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  files_touched: z.array(z.string()).default([]),
  artifacts: z.array(ArtifactSchema).default([]),
  result: ResultSchema,
  constraints_applied: z.array(z.string()).default([]),
  risk_flags: z.array(z.string()).default([]),
  links: LinksSchema.default({ nodes: [] }),
  tags: z.array(z.string()).default([]),
  context_id: z.string().optional(),
});

export type RunCheckpoint = z.infer<typeof RunCheckpointSchema>;

// ── Knowledge Tree Node ────────────────────────────────────────────

export const NodeTypeEnum = z.enum([
  'project',
  'goal',
  'task',
  'decision',
  'pattern',
  'constraint',
  'playbook',
  'agent',
]);

export const NodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeEnum,
  title: z.string().min(1),
  status: z.enum(['active', 'done', 'archived', 'blocked', 'draft']).default('active'),
  tags: z.array(z.string()).default([]),
  owners: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  body: z.string().default(''),
  refs: z
    .object({
      runs: z.array(z.string()).default([]),
      files: z.array(z.string()).default([]),
    })
    .default({ runs: [], files: [] }),
  next_actions: z.array(z.string()).default([]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  context_id: z.string().optional(),
});

export type KnowledgeNode = z.infer<typeof NodeSchema>;

// ── Policy Check Request ───────────────────────────────────────────

export const PolicyCheckSchema = z.object({
  cmd: z.string().optional(),
  path: z.string().optional(),
  host: z.string().optional(),
  agent_id: z.string().optional(),
});

export type PolicyCheckRequest = z.infer<typeof PolicyCheckSchema>;

// ── Recall Request ─────────────────────────────────────────────────

export const RecallRequestSchema = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
  tags: z.array(z.string()).optional(),
  node_types: z.array(NodeTypeEnum).optional(),
});

export type RecallRequest = z.infer<typeof RecallRequestSchema>;
