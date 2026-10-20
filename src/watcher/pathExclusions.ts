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
 *
 * With `ai-cli-diff-view.respectGitignore` (default on), files matched by the
 * repo's own `.gitignore` files / `.git/info/exclude` are skipped too, so build
 * output or unpacked packages an agent writes in bulk never open a diff (issue #37).
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
let respectGitignore = true;

/** dir -> rules from its `.gitignore` (+ `.git/info/exclude` at a repo root); null = none. */
const dirRulesCache = new Map<string, ignore.Ignore | null>();
/** dir -> whether it holds a `.git` entry, i.e. is a repo root. */
const repoRootCache = new Map<string, boolean>();
/** workspace folder root -> repo root that contains it (or the folder itself when none). */
const gitBaseCache = new Map<string, string>();

/** Forget every cached `.gitignore`, e.g. after one was created, edited or deleted. */
export function clearGitignoreCache(): void {
  dirRulesCache.clear();
  repoRootCache.clear();
  gitBaseCache.clear();
}

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

  respectGitignore = config.get<boolean>('respectGitignore', true) !== false;
  clearGitignoreCache();

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
  if (userIgnore !== undefined && userIgnore.ignores(relParts.join('/'))) { return true; }

  return respectGitignore && isGitIgnored(root, relParts);
}

function cacheKey(dir: string): string {
  return process.platform === 'win32' ? dir.toLowerCase() : dir;
}

function isRepoRoot(dir: string): boolean {
  const key = cacheKey(dir);
  let result = repoRootCache.get(key);
  if (result === undefined) {
    result = fs.existsSync(path.join(dir, '.git'));
    repoRootCache.set(key, result);
  }
  return result;
}

function readIfExists(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function dirRules(dir: string): ignore.Ignore | null {
  const key = cacheKey(dir);
  const cached = dirRulesCache.get(key);
  if (cached !== undefined) { return cached; }
  // info/exclude first so the directory's .gitignore wins, as in git.
  const exclude = isRepoRoot(dir) ? readIfExists(path.join(dir, '.git', 'info', 'exclude')) : undefined;
  const gitignore = readIfExists(path.join(dir, '.gitignore'));
  let result: ignore.Ignore | null = null;
  if (exclude !== undefined || gitignore !== undefined) {
    try {
      result = ignore({ ignorecase: process.platform !== 'linux' })
        .add(exclude ?? '')
        .add(gitignore ?? '');
    } catch (err) {
      console.warn(`[ai-cli-diff] unreadable ignore rules in ${dir}:`, err);
    }
  }
  dirRulesCache.set(key, result);
  return result;
}

/** Innermost repo root at or above `root`; `root` itself when it is in no repo. */
function gitBase(root: string): string {
  const key = cacheKey(root);
  const cached = gitBaseCache.get(key);
  if (cached !== undefined) { return cached; }
  let base = root;
  for (let dir = root; ; dir = path.dirname(dir)) {
    if (isRepoRoot(dir)) { base = dir; break; }
    if (path.dirname(dir) === dir) { break; }
  }
  gitBaseCache.set(key, base);
  return base;
}

/**
 * Walks from the repo root down to the file's folder, applying each folder's
 * `.gitignore` to the path below it; a deeper match overrides a shallower one
 * (`!keep.log` re-includes), and a nested repo starts over with its own rules.
 *
 * Known gaps versus git: the global `core.excludesFile` is not read, a file
 * inside an ignored folder can still be re-included by a deeper `.gitignore`,
 * and `info/exclude` is skipped when `.git` is a file (worktrees, submodules).
 */
function isGitIgnored(root: string, relParts: string[]): boolean {
  const base = gitBase(root);
  const parts = base === root
    ? relParts
    : [...path.relative(base, root).split(path.sep), ...relParts];
  let ignored = false;
  let dir = base;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      dir = path.join(dir, parts[i - 1]);
      if (isRepoRoot(dir)) { ignored = false; }
    }
    const rules = dirRules(dir);
    if (!rules) { continue; }
    const result = rules.test(parts.slice(i).join('/'));
    if (result.ignored) {
      ignored = true;
    } else if (result.unignored) {
      ignored = false;
    }
  }
  return ignored;
}
