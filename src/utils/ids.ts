import { ulid } from 'ulid';

export function generateRunId(): string {
  return `run_${ulid().toLowerCase()}`;
}

export function generateNodeId(type: string): string {
  return `${type}_${ulid().toLowerCase()}`;
}

export function generateContextId(scope: string): string {
  return `ctx_${scope}_${ulid().toLowerCase()}`;
}
