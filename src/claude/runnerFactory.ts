/**
 * runnerFactory.ts
 *
 * Tự detect xem máy đang có claude CLI hay qwen CLI (hoặc cả hai).
 * Trả về IAiRunner phù hợp.
 *
 * Logic:
 *   - Nếu chỉ có 1 tool → dùng luôn
 *   - Nếu có cả 2 → show QuickPick để người dùng chọn
 *   - Nếu không có cái nào → throw Error rõ ràng
 */

import * as cp from 'child_process';
import * as vscode from 'vscode';
import { DiffManager } from '../diff/diffManager';
import { IAiRunner } from './aiRunner';
import { ClaudeRunner } from './claudeRunner';
import { QwenRunner } from './qwenRunner';

type ToolName = 'claude' | 'qwen';

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
  if (isToolAvailable('qwen')) { available.push('qwen'); }
  return available;
}

/**
 * Tạo IAiRunner phù hợp dựa trên tool có sẵn.
 * Nếu có cả 2 → hỏi người dùng qua QuickPick.
 * Kết quả được cache trong session (truyền vào qua selectedTool).
 */
export async function createRunner(
  diffManager: DiffManager,
  preferredTool?: ToolName
): Promise<{ runner: IAiRunner; toolName: ToolName }> {
  // Nếu đã có preferred tool được chỉ định → dùng luôn (không detect lại)
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
      'Cần cài ít nhất một trong hai:\n' +
      '  • Claude Code: https://claude.ai/code\n' +
      '  • Qwen Code: npm install -g @qwen-code/cli'
    );
  }

  if (available.length === 1) {
    const tool = available[0]!;
    return { runner: buildRunner(tool, diffManager), toolName: tool };
  }

  // Có cả 2 → hỏi người dùng
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: '$(robot) Claude',
        description: 'Anthropic Claude Code CLI',
        tool: 'claude' as ToolName,
      },
      {
        label: '$(sparkle) Qwen',
        description: 'Alibaba Qwen Code CLI',
        tool: 'qwen' as ToolName,
      },
    ],
    {
      title: 'Chọn AI CLI để dùng',
      placeHolder: 'Cả claude và qwen đều có trên máy — bạn muốn dùng cái nào?',
    }
  );

  if (!picked) {
    throw new Error('Chưa chọn AI CLI. Hủy session.');
  }

  return { runner: buildRunner(picked.tool, diffManager), toolName: picked.tool };
}

function buildRunner(tool: ToolName, diffManager: DiffManager): IAiRunner {
  switch (tool) {
    case 'qwen': return new QwenRunner(diffManager);
    case 'claude': default: return new ClaudeRunner(diffManager);
  }
}
