/**
 * Path segments to skip for workspace snapshot + external-write diff triggers.
 * Match whole path components (e.g. .../obj/foo.json → skip because of `obj`).
 *
 * Every check runs on the path RELATIVE to its workspace folder, so folders
 * above the repo never count: a repo cloned into `D:\build\proj` or `~/src/app`
 * is still tracked.
 *
 * On top of the built-in list below, users can add `.gitignore`-style patterns
 * through `ai-cli-diff-view.excludedPaths` (see `refreshPathExclusions()`).
 * They only ADD to the built-in list; they never replace it.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import ignore from 'ignore';

const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'out',
  'dist',
  'build',
  '.vscode',
  '.idea',
  '.claude',
  // .NET / Visual Studio
  'bin',
  'obj',
  'TestResults',
  'artifacts',
  '.vs',
  // Java / JVM
  'target',
  '.gradle',
  '.settings',
  '.classpath',
  '.project',
  // Python
  'venv',
  '.venv',
  'env',
  '.env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'site-packages',
  'dist-info',
  'egg-info',
]);

/**
 * Cache parentDir -> boolean: whether `<parentDir>/packages` is a legacy NuGet
 * solution folder. A NuGet `packages/` folder is always a sibling of a `.sln`
 * file. Anything else named `packages/` (npm/pnpm/yarn workspaces, lerna, …)
 * is real source we must NOT exclude.
 */
const nugetPackagesCache = new Map<string, boolean>();

function isNugetPackagesParent(parentDir: string): boolean {
  const cached = nugetPackagesCache.get(parentDir);
  if (cached !== undefined) { return cached; }
  let result = false;
  try {
    for (const entry of fs.readdirSync(parentDir)) {
      if (entry.toLowerCase().endsWith('.sln')) { result = true; break; }
    }
  } catch {
    result = false;
  }
  nugetPackagesCache.set(parentDir, result);
  return result;
}

/** Compiled `excludedPaths`; undefined when the user configured none. */
let userRules: ignore.Ignore | undefined;
let userRulesLoaded = false;

/**
 * Re-reads `excludedPaths`.
 * Called on activation and whenever the configuration changes — see `extension.ts`.
 */
export function refreshPathExclusions(): void {
  const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
  const entries = config.get<unknown>('excludedPaths', []);
  const patterns = Array.isArray(entries)
    ? entries.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map(e => e.trim())
    : [];

  userRules = undefined;
  userRulesLoaded = true;
  if (patterns.length === 0) { return; }
  try {
    // Windows / macOS file systems are case-insensitive, and WorkspaceWatcher
    // hands us lowercased paths on Windows.
    userRules = ignore({ ignorecase: process.platform !== 'linux' }).add(patterns);
  } catch (err) {
    console.warn('[ai-cli-diff] invalid excludedPaths entry, user exclusions disabled:', err);
  }
}

function rules(): ignore.Ignore | undefined {
  if (!userRulesLoaded) { refreshPathExclusions(); }
  return userRules;
}

/**
 * Splits `absPath` into its workspace folder root and the path below it.
 * Picks the innermost folder when workspace folders are nested.
 */
function splitByWorkspaceFolder(absPath: string): { root: string; relParts: string[] } | undefined {
  let best: { root: string; relParts: string[] } | undefined;
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = folder.uri.fsPath;
    // path.relative compares case-insensitively on Windows.
    const rel = path.relative(root, absPath);
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) { continue; }
    const relParts = rel.split(path.sep);
    if (!best || relParts.length < best.relParts.length) {
      best = { root, relParts };
    }
  }
  return best;
}

function hasExcludedSegment(baseDir: string, parts: string[]): boolean {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (EXCLUDED_SEGMENTS.has(p)) { return true; }
    if (p === 'packages') {
      const parentDir = path.join(baseDir, ...parts.slice(0, i));
      if (isNugetPackagesParent(parentDir)) { return true; }
    }
  }
  return false;
}

export function isExcludedPathSegment(absPath: string): boolean {
  const inWorkspace = splitByWorkspaceFolder(absPath);
  if (!inWorkspace) {
    // Outside every workspace folder: callers drop these paths anyway, keep
    // the old whole-path check (minus the drive / root component).
    const parts = absPath.split(path.sep);
    return hasExcludedSegment(parts[0] + path.sep, parts.slice(1));
  }

  const { root, relParts } = inWorkspace;
  if (hasExcludedSegment(root, relParts)) { return true; }

  const userIgnore = rules();
  return userIgnore !== undefined && userIgnore.ignores(relParts.join('/'));
}
