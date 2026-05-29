/**
 * Path segments to skip for workspace snapshot + external-write diff triggers.
 * Match whole path components (e.g. .../obj/foo.json → skip because of `obj`).
 */
import * as fs from 'fs';
import * as path from 'path';

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

export function isExcludedPathSegment(absPath: string): boolean {
  const parts = absPath.split(path.sep);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (EXCLUDED_SEGMENTS.has(p)) { return true; }
    if (p === 'packages' && i > 0) {
      const parentDir = parts.slice(0, i).join(path.sep);
      if (isNugetPackagesParent(parentDir)) { return true; }
    }
  }
  return false;
}
