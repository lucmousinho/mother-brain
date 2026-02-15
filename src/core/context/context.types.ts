import { z } from 'zod';

export const GLOBAL_CONTEXT_ID = '__global__';

export type ContextScope = 'global' | 'vertical' | 'project';

export interface MemoryContext {
  context_id: string;
  name: string;
  scope: ContextScope;
  parent_id: string | null;
  scope_path: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface ActiveContextInfo {
  context_id: string;
  name: string;
  scope: ContextScope;
  scope_path: string;
  set_at: string;
}

export const ContextScopeEnum = z.enum(['global', 'vertical', 'project']);

export const CreateContextSchema = z.object({
  name: z.string().min(1),
  scope: ContextScopeEnum.refine((s) => s !== 'global', {
    message: 'Cannot create a global context manually',
  }),
  parent_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateContextInput = z.infer<typeof CreateContextSchema>;
