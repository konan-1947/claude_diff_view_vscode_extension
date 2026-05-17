import * as fs from 'fs';
import * as path from 'path';

export interface HookInstallDetectResult {
  readonly settingsPath: string;
  readonly settingsFound: boolean;
  readonly preHookFound: boolean;
  readonly postHookFound: boolean;
}

/** `~/.claude/settings.json` (Claude CLI user settings). */
export function getDefaultClaudeSettingsPath(): string {
  const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
  return path.join(home, '.claude', 'settings.json');
}

/**
 * True when Claude settings list our pre-tool-hook and post-tool-hook (this extension copy),
 * under hooks.PreToolUse / hooks.PostToolUse in the shape produced by installHooks.
 */
export function detectOurClaudeHooks(extensionRootFsPath: string): HookInstallDetectResult {
  const settingsPath = getDefaultClaudeSettingsPath();
  const preAbs = path.join(extensionRootFsPath, 'hooks', 'pre-tool-hook.js');
  const postAbs = path.join(extensionRootFsPath, 'hooks', 'post-tool-hook.js');

  if (!fs.existsSync(settingsPath)) {
    return { settingsPath, settingsFound: false, preHookFound: false, postHookFound: false };
  }

  let hooksRoot: unknown;
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as { hooks?: unknown };
    hooksRoot = parsed.hooks;
  } catch {
    return { settingsPath, settingsFound: true, preHookFound: false, postHookFound: false };
  }

  if (!hooksRoot || typeof hooksRoot !== 'object') {
    return { settingsPath, settingsFound: true, preHookFound: false, postHookFound: false };
  }

  const h = hooksRoot as Record<string, unknown>;
  const preOk = phaseReferencesPath(h['PreToolUse'], preAbs);
  const postOk = phaseReferencesPath(h['PostToolUse'], postAbs);

  return {
    settingsPath,
    settingsFound: true,
    preHookFound: preOk,
    postHookFound: postOk,
  };
}

export function hooksFullyActive(r: HookInstallDetectResult): boolean {
  return r.settingsFound && r.preHookFound && r.postHookFound;
}

function phaseReferencesPath(phase: unknown, expectedAbs: string): boolean {
  if (!Array.isArray(phase)) {
    return false;
  }
  for (const block of phase) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const hooks = (block as { hooks?: unknown }).hooks;
    if (!Array.isArray(hooks)) {
      continue;
    }
    for (const hook of hooks) {
      if (!hook || typeof hook !== 'object') {
        continue;
      }
      const cmd = (hook as { command?: unknown }).command;
      if (typeof cmd === 'string' && commandReferencesPath(cmd, expectedAbs)) {
        return true;
      }
    }
  }
  return false;
}

function commandReferencesPath(command: string, expectedAbs: string): boolean {
  const expNorm = normalizePathForCompare(expectedAbs);

  const quoted = command.match(/"([^"]*)"|'([^']*)'/g);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.length >= 2 ? q.slice(1, -1) : q;
      if (normalizePathForCompare(inner) === expNorm) {
        return true;
      }
    }
  }

  const lowerCmd = command.toLowerCase();
  return lowerCmd.includes(expNorm) || lowerCmd.includes(expNorm.replace(/\//g, '\\'));
}

function normalizePathForCompare(absPath: string): string {
  return path.normalize(absPath).replace(/\\/g, '/').toLowerCase();
}
