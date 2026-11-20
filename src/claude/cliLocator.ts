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
  const configuredTarget = configured && isExecutableFile(configured) ? resolveCliTarget(configured) : undefined;
  if (configuredTarget) {
    return { path: configuredTarget, source: 'setting' };
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
    if (isShellShim(configured) && isExecutableFile(configured)) {
      return `The configured Claude CLI (${configured}) is a shell script that cannot be run directly, and the executable it launches was not found. Set "ai-cli-diff-view.${CLAUDE_CLI_SETTING}" to claude.exe (or cli.js) instead.`;
    }
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
      const target = isExecutableFile(candidate) ? resolveCliTarget(candidate) : undefined;
      if (target) {
        return target;
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

  for (const candidate of candidates) {
    const target = isExecutableFile(candidate) ? resolveCliTarget(candidate) : undefined;
    if (target) {
      return target;
    }
  }
  return undefined;
}

/**
 * Turns a found `claude` into something the SDK can spawn directly.
 *
 * The SDK spawns without a shell, and Node on Windows refuses to spawn a
 * `.cmd`/`.bat` that way (`spawn EINVAL`, since the CVE-2024-27980 fix). Those
 * files are package-manager shims (npm, pnpm, yarn, bun, volta, scoop), so we
 * run what they launch instead: a native `claude.exe`, or a `cli.js` the SDK
 * runs with a JS runtime itself. Returns undefined when a shim's target cannot
 * be found, so the caller moves on to the next candidate.
 */
export function resolveCliTarget(candidate: string): string | undefined {
  if (!isShellShim(candidate)) {
    // On Windows only real executables/JS entry points spawn without a shell
    // (npm also drops an extensionless sh script next to its .cmd shim).
    if (process.platform === 'win32' && !RUNNABLE_EXTENSIONS.has(path.extname(candidate).toLowerCase())) {
      return undefined;
    }
    // npm global / Homebrew installs are symlinks; spawn the real file.
    try {
      return fs.realpathSync(candidate);
    } catch {
      return candidate;
    }
  }

  const dir = path.dirname(candidate);
  const fromShim = readShimTarget(candidate, dir);
  if (fromShim) {
    return fromShim;
  }

  // Layout of a global npm install next to its shim.
  const packageDir = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code');
  const fallbacks = [
    path.join(packageDir, 'bin', 'claude.exe'),
    path.join(packageDir, 'cli.js'),
  ];
  return fallbacks.find(isRunnableTarget);
}

const SHIM_EXTENSIONS = new Set(['.cmd', '.bat', '.ps1']);
const RUNNABLE_EXTENSIONS = new Set(['.exe', '.js', '.mjs', '.cjs']);

function isShellShim(candidate: string): boolean {
  return process.platform === 'win32' && SHIM_EXTENSIONS.has(path.extname(candidate).toLowerCase());
}

/**
 * Shims quote the launched file relative to their own folder:
 * `"%dp0%\node_modules\...\claude.exe"` (npm cmd), `"%~dp0\..."` (bat),
 * `"$basedir/node_modules/..."` (npm ps1). Absolute quoted paths (volta, scoop)
 * are taken as they are.
 */
function readShimTarget(shim: string, dir: string): string | undefined {
  let text: string;
  try {
    const stat = fs.statSync(shim);
    if (stat.size > 64 * 1024) {
      return undefined;
    }
    text = fs.readFileSync(shim, 'utf8');
  } catch {
    return undefined;
  }

  for (const match of text.matchAll(/"([^"\r\n]+)"/g)) {
    const raw = match[1]
      .replace(/%~?dp0%?/gi, `${dir}${path.sep}`)
      .replace(/\$basedir/g, dir);
    if (!path.isAbsolute(raw)) {
      continue;
    }
    const target = path.normalize(raw);
    if (isRunnableTarget(target)) {
      return target;
    }
  }
  return undefined;
}

function isRunnableTarget(candidate: string): boolean {
  return RUNNABLE_EXTENSIONS.has(path.extname(candidate).toLowerCase()) && isExecutableFile(candidate);
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
