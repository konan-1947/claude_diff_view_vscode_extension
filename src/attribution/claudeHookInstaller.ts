/**
 * claudeHookInstaller.ts
 *
 * Adds/removes the attribution hooks in ~/.claude/settings.json.
 *
 * The hook itself is deliberately dumb: it copies Claude Code's hook stdin JSON
 * into one file under ~/.ai-cli-diff-view/claude-events/. No Python/Node needed;
 * all parsing happens in the extension (claudeAttribution.ts).
 *
 * Rules learned from claudegate (docs/2026-07-06-hook-not-firing-in-running-session-bug.md):
 *  - Only rewrite settings.json on a SEMANTIC change. Running Claude sessions
 *    may stop trusting hooks when the file changes underneath them.
 *  - Never reset a malformed settings.json — refuse to write instead.
 *  - Only touch our own entries (identified by EVENTS_MARKER in the command).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const EVENTS_MARKER = 'claude-events';
const OWNER_MARKER = 'ai-cli-diff-view';
export const TOOL_MATCHER = '^(Write|Edit|MultiEdit|NotebookEdit|Bash)$';

export function getClaudeEventsDir(): string {
  return path.join(os.homedir(), '.ai-cli-diff-view', EVENTS_MARKER);
}

export function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

interface HookCommand {
  type: 'command';
  command: string;
  shell?: string;
  timeout?: number;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookCommand[];
}

function hookCommand(platform: string): HookCommand {
  if (platform === 'win32') {
    // Copy stdin as raw bytes: no text decoding, so non-ASCII paths (e.g.
    // Vietnamese folder names) survive regardless of the console code page.
    // (Setting [Console]::InputEncoding instead can throw when the hook runs
    // without a console attached, which is how Claude Code runs hooks.)
    return {
      type: 'command',
      shell: 'powershell',
      timeout: 5,
      command: [
        `$d=Join-Path $env:USERPROFILE '.${OWNER_MARKER}\\${EVENTS_MARKER}'`,
        'New-Item -ItemType Directory -Force -Path $d | Out-Null',
        "$t=Join-Path $d ('.'+[guid]::NewGuid().ToString()+'.tmp')",
        '$o=[IO.File]::Create($t); [Console]::OpenStandardInput().CopyTo($o); $o.Close()',
        "Move-Item -LiteralPath $t -Destination (Join-Path $d ([guid]::NewGuid().ToString()+'.json'))",
        'exit 0',
      ].join('; '),
    };
  }
  // Write to a temp name then rename, so the extension never reads half a file.
  return {
    type: 'command',
    timeout: 5,
    command:
      `d="$HOME/.${OWNER_MARKER}/${EVENTS_MARKER}"; mkdir -p "$d" && t="$d/.$$.tmp" && ` +
      `cat > "$t" && mv "$t" "$d/$(date +%s)-$$.json"; exit 0`,
  };
}

function isOurs(group: HookGroup): boolean {
  return (group.hooks ?? []).some(
    h => typeof h.command === 'string' && h.command.includes(OWNER_MARKER) && h.command.includes(EVENTS_MARKER)
  );
}

function desiredGroups(platform: string): Record<string, HookGroup> {
  const cmd = hookCommand(platform);
  return {
    PreToolUse: { matcher: TOOL_MATCHER, hooks: [cmd] },
    PostToolUse: { matcher: TOOL_MATCHER, hooks: [cmd] },
    Stop: { hooks: [cmd] },
  };
}

/** Pure: compute the new settings.json content. */
export function computeHookSettings(
  raw: string,
  enabled: boolean,
  platform: string = process.platform
): { content: string; changed: boolean; parseError?: boolean } {
  // Disabling with none of our entries in the file: nothing to remove, so
  // don't even parse it. (This runs on every startup while the feature is
  // off; it must stay silent for files we can't parse.)
  if (!enabled && !(raw.includes(OWNER_MARKER) && raw.includes(EVENTS_MARKER))) {
    return { content: raw, changed: false };
  }

  // Windows editors (Notepad, PowerShell 5.1 `-Encoding utf8`) often save
  // with a UTF-8 BOM, which JSON.parse rejects. Parse without it and keep it.
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? raw.slice(1) : raw;

  let settings: Record<string, unknown>;
  if (!body.trim()) {
    settings = {};
  } else {
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { content: raw, changed: false, parseError: true };
      }
      settings = parsed;
    } catch {
      return { content: raw, changed: false, parseError: true };
    }
  }

  const before = JSON.stringify(settings);
  const hooks = (settings['hooks'] && typeof settings['hooks'] === 'object' && !Array.isArray(settings['hooks']))
    ? { ...(settings['hooks'] as Record<string, unknown>) }
    : {};

  for (const [eventName, group] of Object.entries(desiredGroups(platform))) {
    const list = Array.isArray(hooks[eventName]) ? (hooks[eventName] as HookGroup[]) : [];
    const others = list.filter(g => !isOurs(g));
    const next = enabled ? [...others, group] : others;
    if (next.length > 0) {
      hooks[eventName] = next;
    } else {
      delete hooks[eventName];
    }
  }

  if (Object.keys(hooks).length > 0) {
    settings['hooks'] = hooks;
  } else {
    delete settings['hooks'];
  }

  const after = JSON.stringify(settings);
  return { content: bom + JSON.stringify(settings, null, 2) + '\n', changed: before !== after };
}

export type HookApplyResult = 'unchanged' | 'installed' | 'removed' | 'parseError' | 'writeError';

export function applyClaudeAttributionHooks(enabled: boolean): HookApplyResult {
  const settingsPath = getClaudeSettingsPath();
  let raw = '';
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    if (!enabled) { return 'unchanged'; }
  }

  const result = computeHookSettings(raw, enabled);
  if (result.parseError) { return 'parseError'; }
  if (!result.changed) { return 'unchanged'; }

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    if (raw) {
      fs.writeFileSync(settingsPath + '.ai-cli-diff-view.bak', raw, 'utf8');
    }
    fs.writeFileSync(settingsPath, result.content, 'utf8');
    if (enabled) {
      fs.mkdirSync(getClaudeEventsDir(), { recursive: true });
    }
    return enabled ? 'installed' : 'removed';
  } catch {
    return 'writeError';
  }
}
