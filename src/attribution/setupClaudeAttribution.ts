/**
 * setupClaudeAttribution.ts
 *
 * VS Code glue for the "claudeCodeHooks" attribution mode:
 *  - installs/removes the hooks when the setting changes,
 *  - provides the EditAttribution gate used by WorkspaceWatcher,
 *  - warns once if writes are being ignored while no hook event ever arrived
 *    (hook not installed, or a Claude session started before the install).
 */

import * as vscode from 'vscode';
import { ClaudeAttribution } from './claudeAttribution';
import { ClaudeHookSource } from './claudeHookSource';
import { applyClaudeAttributionHooks } from './claudeHookInstaller';
import type { EditAttribution } from '../watcher/workspaceWatcher';

const SECTION = 'ai-cli-diff-view';
const MODE_KEY = 'editAttribution';
const BASH_KEY = 'claudeHooks.attributeBashWrites';
type Mode = 'allExternalWrites' | 'claudeCodeHooks';

function getMode(): Mode {
  return vscode.workspace.getConfiguration(SECTION).get<Mode>(MODE_KEY, 'allExternalWrites');
}

export function setupClaudeEditAttribution(
  context: vscode.ExtensionContext,
  log: (msg: string) => void
): EditAttribution {
  const attribution = new ClaudeAttribution(undefined, () =>
    vscode.workspace.getConfiguration(SECTION).get<boolean>(BASH_KEY, true)
  );
  const source = new ClaudeHookSource(attribution);
  let warnedNoEvents = false;

  const sync = (announce: boolean) => {
    const enabled = getMode() === 'claudeCodeHooks';
    const result = applyClaudeAttributionHooks(enabled);
    log(`attribution:hooks ${enabled ? 'enable' : 'disable'} → ${result}`);
    if (result === 'parseError') {
      void vscode.window.showErrorMessage(
        'AI CLI Diff View: ~/.claude/settings.json is not valid JSON, so the Claude Code hook was not ' +
        (enabled ? 'installed' : 'removed') + '. Fix the file and toggle the setting again.'
      );
    } else if (result === 'writeError') {
      void vscode.window.showErrorMessage('AI CLI Diff View: could not write ~/.claude/settings.json.');
    } else if (result === 'installed' && announce) {
      void vscode.window.showInformationMessage(
        'AI CLI Diff View: Claude Code hook installed. Only edits made by Claude Code will open diffs. ' +
        'Restart any Claude session that was already running so it picks up the hook.'
      );
    }
  };

  sync(false);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(`${SECTION}.${MODE_KEY}`)) { sync(true); }
    })
  );

  return {
    isEnabled: () => getMode() === 'claudeCodeHooks',
    isAgentWrite: (absPath, eventAt) => source.isClaudeWrite(absPath, eventAt),
    onIgnoredWrite: (absPath) => {
      log(`attribution:ignored non-Claude write ${absPath}`);
      if (!warnedNoEvents && !source.hasSeenAnyEvent()) {
        warnedNoEvents = true;
        void vscode.window.showWarningMessage(
          'AI CLI Diff View ignored a file change because no Claude Code edit claimed it, and no hook ' +
          'event has been received yet. If Claude made this change, restart the Claude session so it ' +
          'loads the hook.'
        );
      }
    },
  };
}
