import * as path from 'path';
import * as vscode from 'vscode';
import { DiffPreviewMetadata } from '../diff/diffManager';

type PendingTreeElement = PendingFolder | PendingFile;

interface PendingFolder {
  type: 'folder';
  id: string;
  label: string;
  children: PendingTreeElement[];
}

interface PendingFile {
  type: 'file';
  metadata: DiffPreviewMetadata;
}

/**
 * Row styles of the pending-files tree, shared by the PENDING FILES view and the
 * overlay inside the terminal webview. Scoped under `.pending-tree`.
 */
export const PENDING_TREE_CSS = `
  .pending-tree .pending-summary { margin-bottom: 4px; padding: 6px 12px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25)); color: var(--vscode-descriptionForeground); font-size: 13px; font-weight: 600; font-style: italic; }
  .pending-tree .row { width: 100%; min-height: 22px; display: flex; align-items: center; padding: 2px 8px; gap: 5px; }
  .pending-tree .folder { color: var(--vscode-foreground); font-weight: 500; border: 0; background: transparent; text-align: left; cursor: pointer; font: inherit; }
  .pending-tree .folder:hover { background: var(--vscode-list-hoverBackground); }
  .pending-tree .folder .chevron { position: relative; z-index: 1; width: 7px; height: 7px; margin: 0 3px 2px 1px; border-right: 1.4px solid currentColor; border-bottom: 1.4px solid currentColor; transform: rotate(45deg); transition: transform .1s ease; }
  .pending-tree .folder-block.collapsed .folder .chevron { transform: rotate(-45deg); margin-bottom: -2px; }
  .pending-tree .folder-block.collapsed > .folder-children { display: none; }
  .pending-tree .folder-children { position: relative; }
  .pending-tree .folder-children::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(12px + var(--tree-depth) * 8px);
    border-left: 1px solid var(--vscode-tree-indentGuidesStroke, var(--vscode-widget-border, rgba(128,128,128,.28)));
    pointer-events: none;
    opacity: 0;
    transition: opacity .12s ease;
  }
  .pending-tree .folder-block:hover > .folder-children::before { opacity: .28; }
  .pending-tree .file { border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; font: inherit; }
  .pending-tree .file:hover { background: var(--vscode-list-hoverBackground); }
  .pending-tree .file.active { background: var(--vscode-list-inactiveSelectionBackground); color: var(--vscode-list-inactiveSelectionForeground, inherit); font-weight: 600; }
  body:focus-within .pending-tree .file.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .pending-tree .icon { width: 16px; height: 16px; flex: 0 0 16px; object-fit: contain; }
  .pending-tree .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pending-tree .stats { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; white-space: nowrap; font-size: 11px; }
  .pending-tree .added { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
  .pending-tree .removed { color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c); }
  .pending-tree .hunks { color: var(--vscode-descriptionForeground); }
  .pending-tree .empty { padding: 10px; color: var(--vscode-descriptionForeground); }
`;

/**
 * Pending files as a folder tree with diff stats. Folders toggle through
 * `[data-folder-toggle]`, files carry their path in `[data-path]`; the host page wires the clicks.
 */
export function renderPendingTree(
  metadata: DiffPreviewMetadata[],
  activeFilePath: string | undefined,
  iconBase: string,
): string {
  const rows = renderChildren(createTree(metadata).children, 0, activeFilePath, iconBase);
  if (!rows) { return '<div class="empty">No pending changes</div>'; }
  const count = metadata.length;
  return `<div class="pending-summary">${count.toLocaleString('en-US')} pending ${count === 1 ? 'file' : 'files'}</div>${rows}`;
}

function renderChildren(
  children: PendingTreeElement[],
  depth: number,
  activeFilePath: string | undefined,
  iconBase: string,
): string {
  return children.map((child) => {
    if (child.type === 'folder') {
      return `<div class="folder-block"><button class="row folder" data-folder-toggle="true" style="padding-left:${8 + depth * 8}px"><span class="chevron" aria-hidden="true"></span><span>${escapeHtml(child.label)}</span></button><div class="folder-children" style="--tree-depth:${depth}">${renderChildren(child.children, depth + 1, activeFilePath, iconBase)}</div></div>`;
    }
    const metadata = child.metadata;
    const active = isSameFile(metadata.filePath, activeFilePath) ? ' active' : '';
    const icon = `${iconBase}${fileIconName(metadata.filePath)}`;
    const stats = metadata.hunks === 0
      ? '<span class="hunks">empty</span>'
      : `<span class="added">+${metadata.additions}</span><span class="removed">-${metadata.deletions}</span><span class="hunks">${metadata.hunks} ${metadata.hunks === 1 ? 'hunk' : 'hunks'}</span>`;
    return `<button class="row file${active}" style="padding-left:${22 + depth * 8}px" data-path="${escapeHtml(metadata.filePath)}" title="${escapeHtml(metadata.filePath)}"><img class="icon" src="${escapeHtml(icon)}" alt=""><span class="name">${escapeHtml(path.basename(metadata.filePath))}</span><span class="stats">${stats}</span></button>`;
  }).join('');
}

function createTree(metadata: DiffPreviewMetadata[]): PendingFolder {
  const root = emptyRoot();
  const folders = new Map<string, PendingFolder>([['', root]]);
  for (const file of metadata) {
    const segments = pathSegments(file.filePath);
    let parent = root;
    let folderPath = '';
    for (const segment of segments.slice(0, -1)) {
      folderPath = folderPath ? `${folderPath}/${segment}` : segment;
      let folder = folders.get(folderPath);
      if (!folder) {
        folder = { type: 'folder', id: `folder:${folderPath}`, label: segment, children: [] };
        parent.children.push(folder);
        folders.set(folderPath, folder);
      }
      parent = folder;
    }
    parent.children.push({ type: 'file', metadata: file });
  }
  sortTree(root);
  for (const child of root.children) {
    if (child.type === 'folder') {
      compactSingleChildFolders(child);
    }
  }
  return root;
}

/**
 * A package-style path such as src/main/java/com/example otherwise spends
 * most of a narrow side bar on indentation. Preserve meaningful branches,
 * but show each unbranched run as one compact, expandable path label.
 */
function compactSingleChildFolders(folder: PendingFolder): void {
  for (const child of folder.children) {
    if (child.type === 'folder') {
      compactSingleChildFolders(child);
    }
  }

  while (folder.children.length === 1 && folder.children[0]?.type === 'folder') {
    const onlyChild = folder.children[0];
    if (onlyChild.type !== 'folder') { break; }
    folder.label = folder.label ? `${folder.label}/${onlyChild.label}` : onlyChild.label;
    folder.id = `folder:${folder.label}`;
    folder.children = onlyChild.children;
  }
}

function sortTree(folder: PendingFolder): void {
  folder.children.sort((left, right) => {
    if (left.type !== right.type) { return left.type === 'folder' ? -1 : 1; }
    const leftName = left.type === 'folder' ? left.label : path.basename(left.metadata.filePath);
    const rightName = right.type === 'folder' ? right.label : path.basename(right.metadata.filePath);
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
  });
  for (const child of folder.children) {
    if (child.type === 'folder') { sortTree(child); }
  }
}

function pathSegments(filePath: string): string[] {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!folder) { return [path.basename(filePath)]; }
  const relative = path.relative(folder.uri.fsPath, filePath) || path.basename(filePath);
  return [folder.name, ...relative.split(path.sep).filter(Boolean)];
}

function fileIconName(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const icons: Record<string, string> = {
    ts: 'typescript.svg', tsx: 'react_ts.svg', js: 'javascript.svg', jsx: 'react.svg',
    css: 'css.svg', scss: 'sass.svg', sass: 'sass.svg', less: 'less.svg',
    html: 'html.svg', htm: 'html.svg', json: 'json.svg', jsonc: 'json.svg',
    md: 'markdown.svg', mdx: 'markdown.svg', py: 'python.svg', rs: 'rust.svg', go: 'go.svg',
    java: 'java.svg', kt: 'kotlin.svg', kts: 'kotlin.svg', rb: 'ruby.svg', php: 'php.svg',
    c: 'c.svg', cc: 'cpp.svg', cpp: 'cpp.svg', h: 'h.svg', hpp: 'hpp.svg', cs: 'csharp.svg',
    sh: 'console.svg', bash: 'console.svg', yaml: 'yaml.svg', yml: 'yaml.svg', toml: 'toml.svg',
    xml: 'xml.svg', svg: 'svg.svg', vue: 'vue.svg', svelte: 'svelte.svg', sql: 'database.svg',
    graphql: 'graphql.svg', png: 'image.svg', jpg: 'image.svg', jpeg: 'image.svg',
    gif: 'image.svg', webp: 'image.svg',
  };
  return icons[ext] ?? 'file.svg';
}

function emptyRoot(): PendingFolder {
  return { type: 'folder', id: 'root', label: '', children: [] };
}

/** Windows paths are case-insensitive: Explorer and pending metadata may differ only in case. */
export function isSameFile(a: string, b: string | undefined): boolean {
  if (b === undefined) { return false; }
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
