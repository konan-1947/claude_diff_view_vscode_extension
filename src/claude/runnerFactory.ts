/**
 * runnerFactory.ts
 *
 * Kiểm tra sự tồn tại của claude CLI và trả về IAiRunner phù hợp.
 */

import * as cp from 'child_process';
import * as vscode from 'vscode';
import { DiffManager } from '../diff/diffManager';
import { IAiRunner } from './aiRunner';
import { ClaudeRunner } from './claudeRunner';

type ToolName = 'claude';

/** Kiểm tra xem một CLI executable có tồn tại trên PATH không */
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

/** Detect các tool có sẵn trên máy */
function detectAvailableTools(): ToolName[] {
  const available: ToolName[] = [];
  if (isToolAvailable('claude')) { available.push('claude'); }
  return available;
}

/**
 * Tạo IAiRunner phù hợp dựa trên tool có sẵn.
 * Kết quả được cache trong session (truyền vào qua selectedTool).
 */
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
      'Không tìm thấy AI CLI nào trên PATH.\n' +
      'Cần cài đặt:\n' +
      '  • Claude Code: https://claude.ai/code'
    );
  }

  const tool = available[0]!;
  return { runner: buildRunner(tool, diffManager), toolName: tool };
}

function buildRunner(tool: ToolName, diffManager: DiffManager): IAiRunner {
  switch (tool) {
    case 'claude': default: return new ClaudeRunner(diffManager);
  }
}
