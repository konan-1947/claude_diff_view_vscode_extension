/**
 * runnerFactory.ts
 *
 * Detects supported AI CLI launchers and returns the matching runner.
 */

import * as cp from 'child_process';
import { DiffManager } from '../diff/diffManager';
import { IAiRunner } from './aiRunner';
import { ClaudeRunner } from './claudeRunner';

type ToolName = 'claude';

function isToolAvailable(tool: string): boolean {
  const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = cp.spawnSync(lookupCmd, [tool], {
      encoding: 'utf8',
      timeout: 3000,
    });
    return result.status === 0 && !!result.stdout.trim();
  } catch {
    return false;
  }
}

function detectAvailableTools(): ToolName[] {
  const available: ToolName[] = [];
  if (isToolAvailable('claude')) {
    available.push('claude');
  }
  return available;
}

export async function createRunner(
  diffManager: DiffManager,
  preferredTool?: ToolName
): Promise<{ runner: IAiRunner; toolName: ToolName }> {
  if (preferredTool) {
    return {
      runner: buildRunner(preferredTool, diffManager),
      toolName: preferredTool,
    };
  }

  const available = detectAvailableTools();
  if (available.length === 0) {
    throw new Error(
      'No supported AI CLI launcher found on PATH.\n' +
      'Best supported review workflows: Claude, Codex, and Qwen.\n' +
      'Built-in session launch currently requires Claude Code:\n' +
      '  • Claude Code: https://claude.ai/code'
    );
  }

  const tool = available[0]!;
  return { runner: buildRunner(tool, diffManager), toolName: tool };
}

function buildRunner(tool: ToolName, diffManager: DiffManager): IAiRunner {
  switch (tool) {
    case 'claude':
    default:
      return new ClaudeRunner(diffManager);
  }
}
