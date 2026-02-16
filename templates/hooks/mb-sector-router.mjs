import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

const MB_URL = 'http://127.0.0.1:7337';
const WORKSPACE = '/home/lucas/.openclaw/workspace';
const ENV_PATH = path.join(WORKSPACE, '.env');
const ROUTER_PATH = path.join(WORKSPACE, 'memory', 'sector-router.json');
const SECTORS_DIR = path.join(WORKSPACE, 'memory', 'sectors');
const CACHE_PATH = path.join(WORKSPACE, 'memory', 'mb-sector-context.json');

let cachedToken = null;

function toIso(ts) {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function defaultRouter() {
  return {
    defaultSector: 'general',
    routes: [
      {
        matchAny: ['instagram', 'postagem', 'campanha', 'marketing', 'social'],
        sector: 'marketing',
        roleTag: 'marketing',
      },
      {
        matchAny: ['software', 'codigo', 'api', 'frontend', 'backend', 'refactor', 'bug'],
        sector: 'engineering-fullstack',
        roleTag: 'software-engineer-fullstack',
      },
      {
        matchAny: ['vendas', 'crm', 'pipeline', 'lead', 'outreach'],
        sector: 'sales',
        roleTag: 'sales',
      },
      {
        matchAny: ['financeiro', 'invoice', 'fatura', 'custo', 'budget', 'pricing'],
        sector: 'finance',
        roleTag: 'finance',
      },
      {
        matchAny: ['operacoes', 'sop', 'processo', 'runbook', 'automacao'],
        sector: 'operations',
        roleTag: 'operations',
      },
    ],
  };
}

async function getToken() {
  if (cachedToken) return cachedToken;
  try {
    const envText = await readFile(ENV_PATH, 'utf8');
    const m = envText.match(/^MB_TOKEN=(.*)$/m);
    if (!m) return null;
    cachedToken = m[1].trim();
    return cachedToken;
  } catch {
    return null;
  }
}

async function loadRouter() {
  try {
    const raw = await readFile(ROUTER_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    return {
      defaultSector: String(cfg?.defaultSector || 'general'),
      routes: Array.isArray(cfg?.routes) ? cfg.routes : [],
    };
  } catch {
    return defaultRouter();
  }
}

function detectSector(router, text) {
  const n = normalize(text);
  for (const r of router.routes || []) {
    const words = Array.isArray(r?.matchAny) ? r.matchAny.map(normalize) : [];
    if (words.some((w) => w && n.includes(w))) {
      return {
        sector: String(r?.sector || router.defaultSector || 'general'),
        roleTag: String(r?.roleTag || 'generalist'),
        matchedBy: words.find((w) => w && n.includes(w)) || null,
      };
    }
  }
  return { sector: String(router.defaultSector || 'general'), roleTag: 'generalist', matchedBy: null };
}

async function recall(token, query) {
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(`${MB_URL}/recall?q=${q}&mode=hybrid&limit=3`, {
      headers: token ? { 'X-MB-TOKEN': token } : {},
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function postRun(token, payload) {
  try {
    await fetch(`${MB_URL}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-MB-TOKEN': token } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // non-blocking
  }
}

export default async function mbSectorRouter(event) {
  if (!event || event.type !== 'command') return;

  const ts = toIso(event.timestamp);
  const action = String(event.action || 'unknown');
  const text = [action, event?.context?.commandSource || ''].filter(Boolean).join(' ');

  const router = await loadRouter();
  const { sector, roleTag, matchedBy } = detectSector(router, text);

  const token = await getToken();
  const query = `${sector} ${action}`;
  const data = await recall(token, query);

  try {
    await mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await mkdir(SECTORS_DIR, { recursive: true });

    const compact = {
      timestamp: ts,
      action,
      sector,
      roleTag,
      matchedBy,
      query,
      top_runs: (data?.top_runs || []).slice(0, 3).map((r) => ({
        run_id: r.run_id,
        goal: r.goal,
        summary: r.summary,
        status: r.status,
      })),
      applicable_constraints: data?.applicable_constraints || [],
      suggested_next_actions: data?.suggested_next_actions || [],
    };

    await writeFile(CACHE_PATH, JSON.stringify(compact, null, 2) + '\n', 'utf8');

    const ymd = ts.slice(0, 10);
    const dailyPath = path.join(WORKSPACE, 'memory', `${ymd}.md`);
    const sectorPath = path.join(SECTORS_DIR, `${sector}.md`);

    const line = `\n- [MB sector ${ts}] action=${action} sector=${sector} role=${roleTag} top_run=${compact.top_runs[0]?.run_id || 'none'}`;
    await appendFile(dailyPath, line, 'utf8');
    await appendFile(sectorPath, line, 'utf8');

    event.messages.push(`🧭 Sector context: ${sector} (${roleTag})`);

    await postRun(token, {
      version: 'v1',
      timestamp: ts,
      agent: {
        id: 'openclaw-main',
        name: 'OpenClaw Agent',
        session_id: event.sessionKey || 'agent:main:main',
      },
      intent: {
        goal: `Sector-routed command: ${action}`,
        context: [`sector:${sector}`, `role:${roleTag}`],
      },
      plan: [{ step: 1, description: `Route command '${action}' to sector '${sector}'`, status: 'done' }],
      actions: [{ type: 'command', command: action, detail: `sector=${sector}`, timestamp: ts }],
      files_touched: [CACHE_PATH, path.join(SECTORS_DIR, `${sector}.md`)],
      artifacts: [],
      result: { status: 'success', summary: `Sector routing applied: ${sector}` },
      constraints_applied: [],
      risk_flags: [],
      links: { nodes: [] },
      tags: [`sector:${sector}`, `role:${roleTag}`, 'openclaw', 'motherbrain', 'sector-routing'],
    });
  } catch {
    // non-blocking
  }
}
