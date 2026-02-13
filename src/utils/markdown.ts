import type { KnowledgeNode } from '../core/schemas.js';
import YAML from 'yaml';

export function nodeToMarkdown(node: KnowledgeNode): string {
  const frontmatter: Record<string, unknown> = {
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    tags: node.tags,
    owners: node.owners,
    constraints: node.constraints,
    created_at: node.created_at,
    updated_at: node.updated_at,
  };

  const fm = YAML.stringify(frontmatter).trim();
  const sections: string[] = [];

  sections.push(`# ${node.title}\n`);

  if (node.body) {
    sections.push(`## Context\n\n${node.body}\n`);
  }

  if (node.refs.runs.length > 0 || node.refs.files.length > 0) {
    sections.push(`## References\n`);
    if (node.refs.runs.length > 0) {
      sections.push(`### Runs\n${node.refs.runs.map((r) => `- ${r}`).join('\n')}\n`);
    }
    if (node.refs.files.length > 0) {
      sections.push(`### Files\n${node.refs.files.map((f) => `- ${f}`).join('\n')}\n`);
    }
  }

  if (node.next_actions.length > 0) {
    sections.push(
      `## Next Actions\n\n${node.next_actions.map((a) => `- [ ] ${a}`).join('\n')}\n`,
    );
  }

  return `---\n${fm}\n---\n\n${sections.join('\n')}`;
}

export function markdownToNode(md: string): Partial<KnowledgeNode> {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};

  const data = YAML.parse(fmMatch[1]) as Record<string, unknown>;
  return {
    id: data.id as string,
    type: data.type as KnowledgeNode['type'],
    title: data.title as string,
    status: data.status as KnowledgeNode['status'],
    tags: (data.tags as string[]) || [],
    owners: (data.owners as string[]) || [],
    constraints: (data.constraints as string[]) || [],
  };
}
