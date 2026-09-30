/**
 * Path segments to skip for workspace snapshot + external-write diff triggers.
 * Match whole path components (e.g. .../obj/foo.json → skip because of `obj`).
 *
 * On top of the built-in list below, users can configure extra rules through two
 * settings (see `refreshPathExclusions()`):
 *   - `excludedPathSegments`: exact segment names, e.g. `myvendor`
 *   - `excludedPathPatterns`: globs matched against the path, e.g. `src/generated/**`
 * Both only ADD to the built-in list; they never replace it.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

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

/** User-configured exclusion rules, already normalized/compiled for reuse. */
interface UserExclusionRules {
  segments: Set<string>;
  patterns: RegExp[];
}

let userRules: UserExclusionRules | undefined;

/**
 * Re-reads `excludedPathSegments` / `excludedPathPatterns`.
 * Called on activation and whenever the configuration changes — see `extension.ts`.
 */
export function refreshPathExclusions(): void {
  const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
  userRules = {
    segments: normalizeSegments(config.get<string[]>('excludedPathSegments', [])),
    patterns: compilePathPatterns(config.get<string[]>('excludedPathPatterns', [])),
  };
}

function rules(): UserExclusionRules {
  if (!userRules) { refreshPathExclusions(); }
  return userRules!;
}

function normalizeSegments(values: unknown): Set<string> {
  const normalized = new Set<string>();
  if (!Array.isArray(values)) { return normalized; }

  for (const value of values) {
    if (typeof value !== 'string') { continue; }
    const segment = value.trim().toLowerCase();
    if (!segment) { continue; }
    if (segment.includes('/') || segment.includes('\\')) {
      console.warn(
        `[ai-cli-diff] excludedPathSegments entry "${value}" contains a path separator — ` +
        `use excludedPathPatterns for path globs. Entry ignored.`
      );
      continue;
    }
    normalized.add(segment);
  }
  return normalized;
}

/**
 * Compiles a glob pattern into a RegExp matched against a `/`-normalized path.
 * A pattern may match at ANY depth in the tree, so `src/generated/**` also
 * matches `packages/foo/src/generated/x.ts`.
 */
function compilePathPatterns(values: unknown): RegExp[] {
  if (!Array.isArray(values)) { return []; }

  const seen = new Set<string>();
  const compiled: RegExp[] = [];
  for (const value of values) {
    if (typeof value !== 'string') { continue; }
    const pattern = value.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
    if (!pattern) { continue; }
    const key = pattern.toLowerCase();
    if (seen.has(key)) { continue; }
    seen.add(key);

    // A trailing `…/**` must match the directory itself as well as everything inside it.
    const body = globFragment(key).replace(/\/\.\*$/, '(?:/.*)?');
    compiled.push(new RegExp(`^(?:.*/)?${body}$`, 'i'));
  }
  return compiled;
}

function globFragment(pattern: string): string {
  let source = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          // `**/` matches zero or more leading segments.
          source += '(?:.*/)?';
          i += 3;
          continue;
        }
        source += '.*';
        i += 2;
        continue;
      }
      // A single `*` does not cross a `/`.
      source += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      source += '[^/]';
      i += 1;
      continue;
    }
    source += escapeRegExp(ch);
    i += 1;
  }
  return source;
}

function escapeRegExp(ch: string): string {
  return /[\\^$+?.()|[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

export function isExcludedPathSegment(absPath: string): boolean {
  const { segments, patterns } = rules();
  const parts = absPath.split(path.sep);

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (EXCLUDED_SEGMENTS.has(p)) { return true; }
    // User-provided segments are compared case-insensitively: the same file can
    // arrive here with an already-lowercased path (WorkspaceWatcher) or not
    // (BaselineScanner).
    if (segments.size > 0 && segments.has(p.toLowerCase())) { return true; }
    if (p === 'packages' && i > 0) {
      const parentDir = parts.slice(0, i).join(path.sep);
      if (isNugetPackagesParent(parentDir)) { return true; }
    }
  }

  // Only pay for regex matching when the user actually configured patterns.
  if (patterns.length > 0) {
    const matchPath = absPath.replace(/\\/g, '/').toLowerCase();
    if (patterns.some(pattern => pattern.test(matchPath))) { return true; }
  }
  return false;
}
