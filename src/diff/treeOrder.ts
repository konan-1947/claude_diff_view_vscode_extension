import * as path from 'path';
import * as vscode from 'vscode';

// One shared collator: localeCompare() with options builds a new one per call,
// which made sorting ~1,300 pending files take ~200ms instead of ~1ms.
const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

function pathSegments(filePath: string): string[] {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!folder) { return [path.basename(filePath)]; }
  const relative = path.relative(folder.uri.fsPath, filePath) || path.basename(filePath);
  return [folder.name, ...relative.split(path.sep).filter(Boolean)];
}

/**
 * Sort pending files in the order the Pending Files tree lists them: depth
 * first, folders before files, siblings by name. The aggregate preview uses it
 * so scrolling the preview walks down the tree instead of in edit order.
 */
export function sortLikePendingTree(filePaths: string[]): string[] {
  const keyed = filePaths.map((filePath) => ({ filePath, segments: pathSegments(filePath) }));
  keyed.sort((left, right) => {
    const shared = Math.min(left.segments.length, right.segments.length);
    for (let i = 0; i < shared; i++) {
      const leftIsFolder = i < left.segments.length - 1;
      const rightIsFolder = i < right.segments.length - 1;
      if (leftIsFolder !== rightIsFolder) { return leftIsFolder ? -1 : 1; }
      const byName = nameCollator.compare(left.segments[i], right.segments[i]);
      if (byName !== 0) { return byName; }
    }
    return 0;
  });
  return keyed.map((entry) => entry.filePath);
}
