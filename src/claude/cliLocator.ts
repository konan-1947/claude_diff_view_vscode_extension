import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export type ClaudeCliSource = 'setting' | 'path' | 'known-location' | 'bundled';

export interface ClaudeCliLocation {
  path: string;
  source: ClaudeCliSource;
}

export const CLAUDE_CLI_SETTING = 'claudeCliPath';

/**
 * Finds the Claude Code CLI used to back the SDK.
 *
 * Order matters: an explicit setting wins, then whatever the user already has
 * on PATH (this is the normal case and keeps the VSIX small), then well-known
 * install locations, and finally the optional native binary from the SDK's
 * platform package — which the VSIX does not ship but a developer checkout has.
 */
export async function locateClaudeCli(extensionPath: string): Promise<ClaudeCliLocation | undefined> {
  const configured = readConfiguredPath();
  if (configured && isExecutableFile(configured)) {
    return { path: configured, source: 'setting' };
  }

  const onPath = findOnPath();
  if (onPath) {
    return { path: onPath, source: 'path' };
  }

  const known = findKnownLocation();
  if (known) {
    return { path: known, source: 'known-location' };
  }

  const bundled = findBundledBinary(extensionPath);
  if (bundled) {
    return { path: bundled, source: 'bundled' };
  }

  return undefined;
}

export function describeMissingCli(configured?: string): string {
  if (configured) {
    return `Claude CLI was not found at the configured path: ${configured}. Set "ai-cli-diff-view.${CLAUDE_CLI_SETTING}" to the full path of the claude executable.`;
  }
  return 'Claude CLI was not found. Install Claude Code (npm install -g @anthropic-ai/claude-code, or the native installer) and sign in once with `claude`, or set "ai-cli-diff-view.claudeCliPath".';
}

function readConfiguredPath(): string | undefined {
  const value = vscode.workspace.getConfiguration('ai-cli-diff-view').get<string>(CLAUDE_CLI_SETTING, '');
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || undefined;
}

function executableNames(): string[] {
  return process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude.bat', 'claude'] : ['claude'];
}

function findOnPath(): string | undefined {
  const raw = process.env.PATH ?? process.env.Path ?? '';
  const separator = process.platform === 'win32' ? ';' : ':';
  for (const dir of raw.split(separator)) {
    if (!dir) {
      continue;
    }
    for (const name of executableNames()) {
      const candidate = path.join(dir, name);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function findKnownLocation(): string | undefined {
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    candidates.push(
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(appData, 'npm', 'claude.cmd'),
      path.join(home, '.claude', 'local', 'claude.exe')
    );
  } else {
    candidates.push(
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, '.claude', 'local', 'claude'),
      path.join(home, '.npm-global', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      '/usr/bin/claude'
    );
  }

  return candidates.find(isExecutableFile);
}

function findBundledBinary(extensionPath: string): string | undefined {
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const variants = [`${process.platform}-${process.arch}`];
  if (process.platform === 'linux') {
    // glibc and musl builds are published separately; try both.
    variants.push(`${process.platform}-${process.arch}-musl`);
  }
  for (const variant of variants) {
    const candidate = path.join(
      extensionPath,
      'node_modules',
      '@anthropic-ai',
      `claude-agent-sdk-${variant}`,
      binaryName
    );
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) {
      return false;
    }
    if (process.platform !== 'win32') {
      fs.accessSync(candidate, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}
