"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentChangesPanel = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
/** Pending-files webview with diff stats aligned independently of Git decorations. */
class AgentChangesPanel {
    constructor(extensionUri, diffManager, openPendingFile, actions) {
        this.extensionUri = extensionUri;
        this.diffManager = diffManager;
        this.openPendingFile = openPendingFile;
        this.actions = actions;
        this.active = false;
        this.showAgentActions = false;
        this.previewOpen = false;
        this.root = { type: 'folder', id: 'root', label: '', children: [] };
        this.generation = 0;
        this.diffDisposable = this.diffManager.onDidChangeDiffs(() => {
            if (this.active) {
                void this.refresh();
            }
        });
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media', 'file-icons')],
        };
        this.viewMessageDisposable?.dispose();
        this.viewMessageDisposable = webviewView.webview.onDidReceiveMessage((message) => {
            if (!message || typeof message !== 'object') {
                return;
            }
            const msg = message;
            if (msg.type === 'open' && typeof msg.path === 'string') {
                this.openPendingFile(msg.path);
            }
            else if (msg.type === 'action') {
                const action = message.action;
                if (action === 'toggleDiff') {
                    this.actions.toggleDiff();
                }
                if (action === 'showIntroduce') {
                    this.actions.showIntroduce();
                }
                if (action === 'showSettings') {
                    this.actions.showSettings();
                }
                if (action === 'toggleAgentMode') {
                    this.actions.toggleAgentMode();
                }
            }
        });
        void this.refresh();
    }
    setAgentMode(active) {
        this.active = active;
        this.showAgentActions = active;
        if (!active) {
            this.previewOpen = false;
            this.activeFilePath = undefined;
            this.root = this.emptyRoot();
            this.render();
            return;
        }
        void this.refresh();
    }
    setCodeModeFilesVisible(visible) {
        if (this.active === visible) {
            return;
        }
        this.active = visible;
        if (!visible) {
            this.root = this.emptyRoot();
            this.render();
            return;
        }
        void this.refresh();
    }
    setActiveFile(filePath) {
        this.activeFilePath = filePath;
        this.render();
    }
    setPreviewOpen(open) {
        this.previewOpen = open;
        this.render();
    }
    async refresh() {
        const generation = ++this.generation;
        const metadata = this.active ? await this.diffManager.getDiffPreviewMetadata() : [];
        if (generation !== this.generation) {
            return;
        }
        this.root = this.createTree(metadata);
        if (this.activeFilePath && !metadata.some((file) => file.filePath === this.activeFilePath)) {
            this.activeFilePath = undefined;
        }
        this.render();
    }
    render() {
        if (!this.view) {
            return;
        }
        const iconBase = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'file-icons')).toString() + '/';
        const rows = this.renderChildren(this.root.children, 0, iconBase);
        const header = this.showAgentActions ? `<header class="panel-header">
  <button class="view-diff" data-action="toggleDiff" title="${this.previewOpen ? 'Back to terminal' : 'View diff'}">${this.previewOpen ? 'Back to terminal' : 'View diff'}</button>
  <button data-action="showIntroduce" title="Introduce" aria-label="Introduce"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>
  <button data-action="showSettings" title="Settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1.51-1V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
  <button class="agent-mode" data-action="toggleAgentMode" title="Turn off Agent mode">Tắt Agent mode</button>
</header>` : '';
        this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view.webview.cspSource}; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; padding: 5px 0; overflow: auto; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: 12px var(--vscode-font-family); }
  .panel-header { min-height: 30px; display: flex; align-items: center; gap: 3px; padding: 2px 5px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  .panel-header button { height: 23px; padding: 0 5px; color: var(--vscode-icon-foreground); background: transparent; border: 0; border-radius: 3px; cursor: pointer; font: inherit; }
  .panel-header button:hover { background: var(--vscode-toolbar-hoverBackground); }
  .panel-header .view-diff { padding: 0 7px; color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, rgba(128,128,128,.45)); }
  .panel-header .agent-mode { margin-left: auto; padding: 0 7px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .row { width: 100%; min-height: 22px; display: flex; align-items: center; padding: 2px 8px; gap: 5px; }
  .folder { color: var(--vscode-foreground); font-weight: 500; border: 0; background: transparent; text-align: left; cursor: pointer; font: inherit; }
  .folder:hover { background: var(--vscode-list-hoverBackground); }
  .folder .chevron { position: relative; z-index: 1; width: 7px; height: 7px; margin: 0 3px 2px 1px; border-right: 1.4px solid currentColor; border-bottom: 1.4px solid currentColor; transform: rotate(45deg); transition: transform .1s ease; }
  .folder-block.collapsed .folder .chevron { transform: rotate(-45deg); margin-bottom: -2px; }
  .folder-block.collapsed > .folder-children { display: none; }
  .folder-children {
    position: relative;
  }
  .folder-children::before {
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
  .folder-block:hover > .folder-children::before { opacity: .28; }
  .file { border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; font: inherit; }
  .file:hover { background: var(--vscode-list-hoverBackground); }
  .file.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .icon { width: 16px; height: 16px; flex: 0 0 16px; object-fit: contain; }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stats { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; white-space: nowrap; font-size: 11px; }
  .added { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
  .removed { color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c); }
  .hunks { color: var(--vscode-descriptionForeground); }
  .empty { padding: 10px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
${header}
${rows || '<div class="empty">No pending changes</div>'}
<script>
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => vscode.postMessage({ type: 'action', action: el.dataset.action }));
  });
  document.querySelectorAll('[data-folder-toggle]').forEach((el) => {
    el.addEventListener('click', () => el.parentElement.classList.toggle('collapsed'));
  });
  document.querySelectorAll('[data-path]').forEach((el) => {
    el.addEventListener('click', () => vscode.postMessage({ type: 'open', path: el.dataset.path }));
  });
</script>
</body>
</html>`;
    }
    renderChildren(children, depth, iconBase) {
        return children.map((child) => {
            if (child.type === 'folder') {
                return `<div class="folder-block"><button class="row folder" data-folder-toggle="true" style="padding-left:${8 + depth * 8}px"><span class="chevron" aria-hidden="true"></span><span>${escapeHtml(child.label)}</span></button><div class="folder-children" style="--tree-depth:${depth}">${this.renderChildren(child.children, depth + 1, iconBase)}</div></div>`;
            }
            const metadata = child.metadata;
            const active = metadata.filePath === this.activeFilePath ? ' active' : '';
            const icon = `${iconBase}${this.fileIconName(metadata.filePath)}`;
            const stats = metadata.hunks === 0
                ? '<span class="hunks">empty</span>'
                : `<span class="added">+${metadata.additions}</span><span class="removed">-${metadata.deletions}</span><span class="hunks">${metadata.hunks} ${metadata.hunks === 1 ? 'hunk' : 'hunks'}</span>`;
            return `<button class="row file${active}" style="padding-left:${22 + depth * 8}px" data-path="${escapeAttribute(metadata.filePath)}" title="${escapeAttribute(metadata.filePath)}"><img class="icon" src="${escapeAttribute(icon)}" alt=""><span class="name">${escapeHtml(path.basename(metadata.filePath))}</span><span class="stats">${stats}</span></button>`;
        }).join('');
    }
    createTree(metadata) {
        const root = this.emptyRoot();
        const folders = new Map([['', root]]);
        for (const file of metadata) {
            const segments = this.pathSegments(file.filePath);
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
        this.sortTree(root);
        for (const child of root.children) {
            if (child.type === 'folder') {
                this.compactSingleChildFolders(child);
            }
        }
        return root;
    }
    /**
     * A package-style path such as src/main/java/com/example otherwise spends
     * most of a narrow side bar on indentation. Preserve meaningful branches,
     * but show each unbranched run as one compact, expandable path label.
     */
    compactSingleChildFolders(folder) {
        for (const child of folder.children) {
            if (child.type === 'folder') {
                this.compactSingleChildFolders(child);
            }
        }
        while (folder.children.length === 1 && folder.children[0]?.type === 'folder') {
            const onlyChild = folder.children[0];
            if (onlyChild.type !== 'folder') {
                break;
            }
            folder.label = folder.label ? `${folder.label}/${onlyChild.label}` : onlyChild.label;
            folder.id = `folder:${folder.label}`;
            folder.children = onlyChild.children;
        }
    }
    sortTree(folder) {
        folder.children.sort((left, right) => {
            if (left.type !== right.type) {
                return left.type === 'folder' ? -1 : 1;
            }
            const leftName = left.type === 'folder' ? left.label : path.basename(left.metadata.filePath);
            const rightName = right.type === 'folder' ? right.label : path.basename(right.metadata.filePath);
            return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
        });
        for (const child of folder.children) {
            if (child.type === 'folder') {
                this.sortTree(child);
            }
        }
    }
    pathSegments(filePath) {
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (!folder) {
            return [path.basename(filePath)];
        }
        const relative = path.relative(folder.uri.fsPath, filePath) || path.basename(filePath);
        return [folder.name, ...relative.split(path.sep).filter(Boolean)];
    }
    fileIconName(filePath) {
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const icons = {
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
    emptyRoot() {
        return { type: 'folder', id: 'root', label: '', children: [] };
    }
    dispose() {
        this.generation += 1;
        this.diffDisposable.dispose();
        this.viewMessageDisposable?.dispose();
    }
}
exports.AgentChangesPanel = AgentChangesPanel;
AgentChangesPanel.viewType = 'ai-cli-diff-view.agentChanges';
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function escapeAttribute(value) {
    return escapeHtml(value);
}
//# sourceMappingURL=agentChangesPanel.js.map