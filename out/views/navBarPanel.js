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
exports.NavBarPanel = void 0;
const vscode = __importStar(require("vscode"));
class NavBarPanel {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.onDidReceiveMessage((msg) => {
            switch (msg.command) {
                case 'acceptAllChanges':
                    vscode.commands.executeCommand('ai-cli-diff-view.acceptAllChanges');
                    break;
            }
        });
        this.render();
    }
    update(navInfo) {
        this.navInfo = navInfo;
        this.render();
    }
    setActiveFile(filePath) {
        this.activeFilePath = filePath;
        this.render();
    }
    render() {
        if (!this.view) {
            return;
        }
        this.view.webview.html = this.buildHtml();
    }
    buildHtml() {
        const info = this.navInfo;
        const bgNoDiffUri = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'meo_ngu.png')).toString();
        const bgHasDiffUri = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'meo_diff.png')).toString();
        const bodyClass = info ? 'has-diff' : 'no-diff';
        const controls = info ? `
      <div class="controls">
        <div class="line line-all-changes">
          <button class="btn btn-accept-all" onclick="send('acceptAllChanges')">Accept All Changes</button>
        </div>
      </div>` : `<div class="empty">No pending diffs</div>`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    overflow: hidden;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-foreground);
    background: transparent;
    user-select: none;
    padding: 10px 12px;
  }

  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
    pointer-events: none;
    z-index: 0;
  }

  body.no-diff::before {
    inset: 8px 0 32px;
    opacity: 1;
    background-image: url('${bgNoDiffUri}');
  }

  body.no-diff {
    justify-content: flex-end;
  }

  body.has-diff::before {
    opacity: 0.3;
    background-image: url('${bgHasDiffUri}');
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    z-index: 1;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
  }

  .file-label {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    text-transform: none;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn {
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, rgba(128,128,128,0.35));
    color: var(--vscode-foreground);
    border-radius: 6px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    text-align: center;
    transition: background 0.1s;
  }
  .btn:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
  }
  .btn:active {
    opacity: 0.7;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .btn:disabled:hover {
    background: transparent;
  }

  .line-all-changes .btn { flex: 1 1 100%; }

  .btn-accept-all {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border-color: transparent;
  }
  .btn-accept-all:hover {
    background: var(--vscode-button-hoverBackground, rgba(76,175,80,0.2));
  }

  .btn-nav {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
    font-size: 12px;
    padding: 7px 10px;
    color: var(--vscode-foreground);
    opacity: 0.8;
  }
  .counter {
    flex-shrink: 0;
    font-size: 13px;
    opacity: 0.7;
    font-weight: 500;
    white-space: nowrap;
    padding: 0 4px;
  }

  .empty {
    text-align: center;
    opacity: 0.85;
    font-style: italic;
    font-size: 12px;
    font-weight: 600;
    position: relative;
    z-index: 1;
  }
</style>
</head>
<body class="${bodyClass}">
  ${controls}
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
    }
}
exports.NavBarPanel = NavBarPanel;
NavBarPanel.viewType = 'ai-cli-diff-view.navBar';
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
//# sourceMappingURL=navBarPanel.js.map