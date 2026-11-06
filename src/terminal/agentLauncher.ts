import { execFile } from 'child_process';
import { getFreshEnv } from './freshEnv';

/** AI CLIs offered in the "+" menu of the terminal tab strip. */
export interface AgentDefinition {
  id: string;
  label: string;
  /** Typed into a fresh shell, so it resolves exactly as the user's own shell would. */
  command: string;
}

export interface AgentInfo {
  id: string;
  label: string;
  installed: boolean;
}

export const AGENT_CATALOG: readonly AgentDefinition[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'copilot', label: 'Copilot', command: 'copilot' },
  { id: 'codex', label: 'Codex', command: 'codex' },
  { id: 'pi', label: 'Pi', command: 'pi' },
];

export function findAgent(id: string | undefined): AgentDefinition | undefined {
  return AGENT_CATALOG.find((agent) => agent.id === id);
}

function isOnPath(command: string): Promise<boolean> {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    // Async on purpose: the lookup runs every time the menu opens and must not block the extension host.
    execFile(lookup, [command], { env: getFreshEnv(), timeout: 3000 }, (err, stdout) => {
      resolve(!err && String(stdout).trim().length > 0);
    });
  });
}

export async function detectAgents(): Promise<AgentInfo[]> {
  return Promise.all(AGENT_CATALOG.map(async (agent) => ({
    id: agent.id,
    label: agent.label,
    installed: await isOnPath(agent.command),
  })));
}
