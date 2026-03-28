/**
 * Path segments to skip for workspace snapshot + external-write diff triggers.
 * Match whole path components (e.g. .../obj/foo.json → skip because of `obj`).
 */
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
  // .NET / Visual Studio
  'bin',
  'obj',
  'TestResults',
  'artifacts',
  '.vs',
  'packages', // legacy NuGet solution folder
]);

export function isExcludedPathSegment(absPath: string): boolean {
  const parts = absPath.split(path.sep);
  return parts.some((p) => EXCLUDED_SEGMENTS.has(p));
}
