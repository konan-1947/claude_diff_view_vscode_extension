import * as vscode from 'vscode';
import { findInstallableForPrimary } from './fontInstaller';
import { PENDING_TREE_CSS } from '../views/pendingTree';
import { DEFAULT_BURST_DETECTION_SETTINGS, DEFAULT_EXCLUSION_SETTINGS, DEFAULT_FILE_LIMIT_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SOUND_NOTIFICATION_SETTINGS } from './terminalTypes';

interface FontOption {
  label: string;
  value: string;
  primary: string;
}

const FONT_OPTIONS: ReadonlyArray<FontOption> = [
  { label: 'Consolas',          value: 'Consolas, "Courier New", monospace',                     primary: 'Consolas' },
  { label: 'Cascadia Code',     value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',  primary: 'Cascadia Code' },
  { label: 'Cascadia Mono',     value: '"Cascadia Mono", Consolas, monospace',                   primary: 'Cascadia Mono' },
  { label: 'Fira Code',         value: '"Fira Code", Consolas, monospace',                       primary: 'Fira Code' },
  { label: 'JetBrains Mono',    value: '"JetBrains Mono", Consolas, monospace',                  primary: 'JetBrains Mono' },
  { label: 'Source Code Pro',   value: '"Source Code Pro", Consolas, monospace',                 primary: 'Source Code Pro' },
  { label: 'Hack',              value: 'Hack, Consolas, monospace',                              primary: 'Hack' },
  { label: 'Menlo / Monaco',    value: 'Menlo, Monaco, "Courier New", monospace',                primary: 'Menlo' },
  { label: 'Ubuntu Mono',       value: '"Ubuntu Mono", Consolas, monospace',                     primary: 'Ubuntu Mono' },
  { label: 'IBM Plex Mono',     value: '"IBM Plex Mono", Consolas, monospace',                   primary: 'IBM Plex Mono' },
  { label: 'Roboto Mono',       value: '"Roboto Mono", Consolas, monospace',                     primary: 'Roboto Mono' },
  { label: 'SF Mono',           value: '"SF Mono", Menlo, Consolas, monospace',                  primary: 'SF Mono' },
  { label: 'Courier New',       value: '"Courier New", Courier, monospace',                      primary: 'Courier New' },
];

export interface IntroSlide {
  src: string;
  caption: string;
}

export interface BuildTerminalHtmlArgs {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
}

/** Icon "i" cho nút mở mô tả cạnh tiêu đề setting — cùng hình với nút Introduce. */
const INFO_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

export function buildTerminalHtml(args: BuildTerminalHtmlArgs): string {
  const { webview, extensionUri } = args;

  const xtermBase = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'xterm'));
  const xtermJs = `${xtermBase}/xterm.js`;
  const xtermCss = `${xtermBase}/xterm.css`;
  const addonFitJs = `${xtermBase}/addon-fit.js`;
  const monacoBase = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'monaco-editor', 'min', 'vs'));
  const aggregateDiffJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'res', 'webview', 'aggregateDiff.js'));
  const previewDir = vscode.Uri.joinPath(extensionUri, 'res', 'webview', 'preview');
  const previewCss = webview.asWebviewUri(vscode.Uri.joinPath(previewDir, 'preview.css'));
  const previewScripts = ['libs', 'code', 'mermaid', 'markdown', 'image', 'csv', 'index']
    .map((name) => webview.asWebviewUri(vscode.Uri.joinPath(previewDir, `${name}.js`)));
  const previewLibs = {
    marked: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'marked', 'lib', 'marked.umd.js')).toString(),
    dompurify: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'dompurify', 'dist', 'purify.min.js')).toString(),
    mermaid: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js')).toString(),
  };

  const introBase = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'introduce'));
  const introSlides: IntroSlide[] = [
    { src: `${introBase}/welcome.png`, caption: 'Welcome to AI CLI Diff — review every AI edit before it lands.' },
    { src: `${introBase}/image1.png`,  caption: 'Accept or reject each AI change with one click in the side panel.' },
    { src: `${introBase}/image2.png`,  caption: 'Run an AI CLI agent right inside the embedded terminal.' },
    { src: `${introBase}/image3.png`,  caption: 'See changed files in their real folder structure.' },
    { src: `${introBase}/image4.png`,  caption: 'Review changes hunk by hunk directly in the editor.' },
    { src: `${introBase}/image5.png`,  caption: 'Customize terminal font, theme, and cursor from the Settings popover.' },
  ];

  const nonce = randomNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `worker-src blob:`,
    `child-src blob:`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${xtermCss}">
<link rel="stylesheet" href="${previewCss}">
<style>
  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground, #cccccc);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #header {
    flex: 0 0 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    background: var(--vscode-sideBar-background);
    font-family: var(--vscode-font-family);
    font-size: 11px;
    user-select: none;
  }
  /* The header follows the terminal colours. */
  body.page-terminal #header {
    border-bottom-color: var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.25)));
    background: var(--chrome-bg, var(--vscode-sideBar-background));
    color: var(--chrome-fg, var(--vscode-foreground));
  }
  #header-title {
    opacity: 0.75;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  #header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .header-separator {
    width: 1px;
    height: 16px;
    margin: 0 5px;
    background: var(--vscode-panel-border, rgba(128,128,128,0.45));
  }
  .agent-mode-btn {
    min-width: 92px;
    height: 22px;
    padding: 0 9px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    line-height: 20px;
    white-space: nowrap;
  }
  .agent-mode-btn:hover { background: var(--vscode-button-hoverBackground); }
  .agent-mode-btn:active { transform: translateY(1px); }
  #btn-view-diff[hidden] { display: none; }
  body.agent-mode-active #header-actions { display: none; }
  .view-diff-btn {
    min-width: 76px;
    height: 22px;
    padding: 0 9px;
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-button-border, rgba(128,128,128,0.45));
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    line-height: 20px;
    white-space: nowrap;
  }
  .view-diff-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); }
  .view-diff-btn:active { transform: translateY(1px); }
  .header-btn {
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    line-height: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
  }
  .header-btn svg { display: block; }
  .header-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); color: var(--vscode-foreground); }
  body.page-terminal #header .header-btn:hover { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); color: var(--chrome-fg, var(--vscode-foreground)); }
  body.page-terminal #header .header-btn { color: var(--chrome-fg, var(--vscode-icon-foreground, var(--vscode-foreground))); }
  body.page-terminal #header .header-separator { background: var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.45))); }
  .header-btn:active { background: var(--vscode-toolbar-activeBackground, rgba(128,128,128,0.28)); }



  /* Tab strip */
  #tab-strip {
    flex: 0 0 28px;
    height: 28px;
    display: flex;
    align-items: stretch;
    background: var(--chrome-bg, var(--vscode-sideBar-background));
    border-bottom: 1px solid var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.25)));
    color: var(--chrome-fg, var(--vscode-foreground));
    font-family: var(--vscode-font-family);
    font-size: 11px;
    user-select: none;
    min-width: 0;
  }
  .tabs {
    /* Shrink-only: the + button stays right after the last tab instead of at the far edge. */
    flex: 0 1 auto;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    min-width: 0;
    scrollbar-width: thin;
  }
  .tabs::-webkit-scrollbar { height: 4px; }
  .tabs::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.4)); border-radius: 2px; }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 10px;
    min-width: 90px;
    max-width: 160px;
    height: 100%;
    border-right: 1px solid var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.18)));
    cursor: pointer;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--chrome-fg, var(--vscode-foreground));
    opacity: 0.78;
  }
  .tab:hover { background: var(--chrome-hover, var(--vscode-list-hoverBackground, rgba(128,128,128,0.12))); opacity: 1; }
  .tab.active {
    background: var(--chrome-active, var(--vscode-editor-background));
    opacity: 1;
  }
  .tab.active::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 1px;
    background: var(--vscode-focusBorder, #007fd4);
  }
  .tab-title {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-close {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    opacity: 0;
    font-size: 14px;
    line-height: 1;
  }
  .tab:hover .tab-close, .tab.active .tab-close { opacity: 0.7; }
  .tab-close:hover { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); opacity: 1; }
  .tab-add {
    flex: 0 0 28px;
    margin-right: auto;
    background: transparent;
    border: none;
    color: var(--chrome-fg, var(--vscode-icon-foreground, var(--vscode-foreground)));
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .tab-add:hover { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); }

  #content {
    flex: 1 1 auto;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  #term-wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--vscode-editor-background);
  }
  #term-host { width: 100%; height: 100%; position: relative; }
  .term-pane {
    position: absolute;
    inset: 0;
    display: none;
  }
  .term-pane.active { display: block; }
  .xterm { padding: 4px 0 0 6px; height: 100%; }


  #err {
    position: absolute;
    top: 8px; left: 10px; right: 10px;
    color: #f48771;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    white-space: pre-wrap;
    background: rgba(0,0,0,0.6);
    padding: 6px 8px;
    border-radius: 4px;
    display: none;
    z-index: 5;
  }

  #settings-overlay {
    position: absolute;
    inset: 0;
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground);
    padding: 12px 14px 14px;
    overflow: auto;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    z-index: 10;
  }
  #settings-overlay[hidden] { display: none; }
  /* Pending Files is drawn over the terminal; the terminal keeps running underneath. */
  #pending-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12px;
  }
  #pending-overlay[hidden] { display: none; }
  .pending-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px 6px 10px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  }
  .pending-head h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }
  #pending-tree { flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; padding-bottom: 5px; }
  #pending-tree * { box-sizing: border-box; }
  ${PENDING_TREE_CSS}
  .settings-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .settings-head h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }
  #btn-close {
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    cursor: pointer;
    line-height: 0;
    padding: 3px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
  }
  #btn-close svg { display: block; }
  #btn-close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); color: var(--vscode-foreground); }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .field label {
    flex: 0 0 96px;
    opacity: 0.85;
  }
  .field input[type="text"],
  .field input[type="number"],
  .field select {
    flex: 1 1 auto;
    min-width: 0;
    padding: 4px 6px;
    background: var(--vscode-input-background, #2a2a2a);
    color: var(--vscode-input-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    box-sizing: border-box;
  }
  .field input[type="number"] { flex: 0 0 80px; }
  .field input[type="color"] {
    width: 38px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
    background: transparent;
    cursor: pointer;
  }
  .field input[type="checkbox"] { margin: 0; }
  .field.file-ext-field {
    align-items: flex-start;
    flex-direction: column;
  }
  .field.file-ext-field > label,
  .field.file-ext-field > .label-row {
    flex: none;
  }
  .label-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .info-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--vscode-descriptionForeground, rgba(128,128,128,0.9));
    cursor: pointer;
  }
  .info-btn:hover,
  .info-btn[aria-expanded="true"] {
    color: var(--vscode-foreground);
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18));
  }
  .info-btn:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
  }
  .setting-info {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border-left: 2px solid var(--vscode-textLink-foreground, #3794ff);
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.1));
    color: var(--vscode-foreground);
    font-size: 11px;
    line-height: 1.5;
  }
  .setting-info[hidden] { display: none; }
  .info-examples {
    width: 100%;
    margin: 6px 0;
    border-collapse: collapse;
  }
  .info-examples th,
  .info-examples td {
    padding: 3px 6px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.22));
  }
  .info-examples th { font-weight: 600; }
  .info-examples td:first-child { white-space: nowrap; }
  .field.indent { padding-left: 16px; }
  .color-row { display: flex; align-items: center; gap: 8px; }
  .color-row span { font-family: var(--vscode-editor-font-family, monospace); opacity: 0.7; font-size: 11px; }
  .file-ext-controls {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .file-ext-list {
    width: 100%;
    min-height: 104px;
    max-height: 160px;
    overflow: auto;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
    background: var(--vscode-input-background, #2a2a2a);
  }
  .file-ext-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .file-ext-table th,
  .file-ext-table td {
    padding: 4px 6px;
    text-align: left;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.22));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-ext-table th {
    font-weight: 600;
    color: var(--vscode-foreground);
    background: var(--vscode-editorWidget-background, rgba(128,128,128,0.08));
  }
  .file-ext-table tr {
    cursor: default;
  }
  .file-ext-table tbody tr.selected {
    color: var(--vscode-list-activeSelectionForeground, #ffffff);
    background: var(--vscode-list-activeSelectionBackground, #094771);
  }
  .file-ext-table td:has(> .list-cell-input) {
    padding: 2px;
  }
  .file-ext-table tr.list-add-row td {
    border-bottom: none;
  }
  .list-cell-input {
    width: 100%;
    padding: 2px 4px;
    background: transparent;
    color: var(--vscode-input-foreground, var(--vscode-foreground));
    border: 1px solid transparent;
    border-radius: 2px;
    font-family: inherit;
    font-size: 12px;
    box-sizing: border-box;
    outline: none;
  }
  .list-cell-input::placeholder {
    color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.8));
  }
  .list-cell-input:focus {
    background: var(--vscode-input-background, #2a2a2a);
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .file-ext-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .setting-help {
    color: var(--vscode-descriptionForeground, rgba(128,128,128,0.9));
    font-size: 11px;
    margin-bottom: 10px;
  }
  .settings-section-title {
    margin: 4px 0 10px;
    padding-top: 10px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.22));
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  .install-controls { display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 0; }
  .install-status { font-size: 11px; opacity: 0.8; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .install-status.ok { color: var(--vscode-charts-green, #4caf50); }
  .install-status.err { color: var(--vscode-errorForeground, #f48771); }
  #btn-install-font[disabled] { opacity: 0.55; cursor: default; }
  #btn-reload-window { display: none; }

  /* Aggregate diff preview */
  #diff-preview-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    z-index: 15;
  }
  #diff-preview-overlay[hidden] { display: none; }
  #file-preview-overlay {
    position: absolute;
    top: 56px;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 16;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    font-family: var(--vscode-font-family);
  }
  #file-preview-overlay[hidden] { display: none; }
  .file-preview-card {
    width: calc(100% - 16px);
    max-width: none;
    height: calc(100% - 16px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-focusBorder, #007fd4);
    border-radius: 6px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.48);
  }
  .file-preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
    background: var(--vscode-sideBar-background, #1e1e1e);
    font-size: 12px;
  }
  #file-preview-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #file-preview-editor { flex: 1 1 auto; min-height: 0; }
  .diff-preview-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    background: var(--vscode-sideBar-background, #1e1e1e);
  }
  .diff-preview-title {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 9px;
  }
  .diff-preview-title strong { font-size: 13px; font-weight: 600; }
  .diff-preview-title span {
    color: var(--vscode-descriptionForeground, rgba(128,128,128,0.9));
    font-size: 11px;
  }
  .diff-preview-head-actions { display: flex; align-items: center; gap: 6px; }
  .diff-preview-head-actions .btn { margin: 0; padding: 4px 9px; font-size: 11px; }
  .diff-preview-scroll {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    /* Size container so .aggregate-editor can size itself in cqh. */
    container-type: size;
  }
  .diff-add { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
  .diff-delete { color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c); }
  .diff-preview-content {
    overflow: auto;
    padding: 16px 18px 28px;
  }
  .diff-preview-status {
    padding: 28px 12px;
    color: var(--vscode-descriptionForeground, rgba(128,128,128,0.9));
    font-size: 12px;
    text-align: center;
  }
  .aggregate-file-section {
    margin: 0 0 18px;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.28));
    border-radius: 5px;
    overflow: hidden;
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .aggregate-file-section.is-active {
    border-color: var(--vscode-focusBorder, #007fd4);
  }
  .aggregate-file-section.is-collapsed .aggregate-file-body { display: none; }
  .aggregate-file-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 5px 8px 5px 10px;
    background: var(--vscode-editorWidget-background, rgba(128,128,128,0.1));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
  }
  .aggregate-file-section.is-collapsed .aggregate-file-head { border-bottom: 0; }
  .aggregate-file-toggle {
    flex: 0 0 22px;
    width: 22px;
    height: 22px;
    border: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    background: transparent;
    cursor: pointer;
  }
  .aggregate-file-toggle svg { display: block; }
  .aggregate-file-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aggregate-file-stats { margin-left: auto; flex: 0 0 auto; font-family: var(--vscode-font-family); font-size: 10px; }
  .aggregate-file-actions { display: flex; flex: 0 0 auto; gap: 4px; margin-left: 4px; }
  .aggregate-hunk-nav {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: stretch;
    margin-left: 6px;
    height: 24px;
    overflow: hidden;
    border: 1px solid var(--vscode-button-border, rgba(128,128,128,0.4));
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground, transparent);
    font-family: var(--vscode-font-family);
    font-size: 10px;
  }
  .aggregate-hunk-nav[hidden] { display: none; }
  .aggregate-hunk-nav button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    padding: 0;
    border: 0;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    background: transparent;
    cursor: pointer;
  }
  .aggregate-hunk-nav button svg { display: block; }
  .aggregate-hunk-nav button:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.22)); }
  .aggregate-hunk-nav button:active:not(:disabled) { background: var(--vscode-toolbar-activeBackground, rgba(128,128,128,0.32)); }
  .aggregate-hunk-nav button:disabled { opacity: .35; cursor: default; }
  .aggregate-hunk-counter {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 42px;
    padding: 0 6px;
    border-left: 1px solid var(--vscode-button-border, rgba(128,128,128,0.4));
    border-right: 1px solid var(--vscode-button-border, rgba(128,128,128,0.4));
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .aggregate-file-actions button,
  .aggregate-hunk-actions button {
    padding: 3px 7px;
    border: 1px solid var(--vscode-button-border, rgba(128,128,128,0.4));
    border-radius: 3px;
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: 10px;
  }
  .aggregate-file-actions button:hover,
  .aggregate-hunk-actions button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); }
  .aggregate-file-actions .accept,
  .aggregate-hunk-actions .accept { color: var(--vscode-testing-iconPassed, #73c991); }
  .aggregate-file-actions .reject,
  .aggregate-hunk-actions .reject { color: var(--vscode-testing-iconFailed, #f14c4c); }
  .aggregate-file-body { padding: 0; }
  .aggregate-file-loading,
  .aggregate-file-error {
    padding: 20px 12px;
    color: var(--vscode-descriptionForeground, rgba(128,128,128,0.9));
    font-family: var(--vscode-font-family);
    font-size: 11px;
  }
  .aggregate-file-error { color: var(--vscode-errorForeground, #f48771); }
  .aggregate-hunk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 7px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .aggregate-hunk-label {
    align-self: center;
    margin-right: 3px;
    color: var(--vscode-descriptionForeground, rgba(128,128,128,0.9));
    font-size: 10px;
  }
  .aggregate-editor {
    width: 100%;
    /* aggregateDiff.js sets the height to the file's content height; long files cap here. */
    height: 90cqh;
    max-height: 90cqh;
    min-height: 40px;
  }
  .aggregate-diff-added-line { background-color: rgba(46, 160, 67, 0.18); }
  .aggregate-diff-added-gutter {
    width: 3px !important;
    margin-left: 3px;
    background-color: rgba(46, 160, 67, 0.55);
  }
  .aggregate-diff-removed-zone {
    background-color: rgba(248, 81, 73, 0.12);
    color: rgba(248, 81, 73, 0.95);
    padding: 0;
    white-space: pre;
  }
  .aggregate-diff-removed-line { padding: 0; }
  .aggregate-hunk-bar {
    display: inline-flex;
    gap: 4px;
    padding: 3px 4px;
    border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.35));
    border-radius: 4px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
    opacity: 0;
    pointer-events: none;
    transition: opacity .12s ease;
  }
  .aggregate-hunk-bar.visible { opacity: 1; pointer-events: auto; }
  .aggregate-hunk-bar button {
    padding: 2px 8px;
    border: 0;
    border-radius: 3px;
    color: var(--vscode-button-foreground);
    cursor: pointer;
    font: 11px var(--vscode-font-family);
  }
  .aggregate-hunk-bar .accept { background: var(--vscode-testing-iconPassed, #73c991); }
  .aggregate-hunk-bar .reject { background: var(--vscode-testing-iconFailed, #f14c4c); }
  .aggregate-file-section.is-collapsed .aggregate-editor { display: none; }
  @media (max-width: 600px) {
    .diff-preview-scroll { grid-template-columns: 1fr; }
    .diff-preview-files { display: none; }
    .aggregate-file-head { flex-wrap: wrap; }
    .aggregate-file-actions { width: 100%; margin-left: 26px; padding-bottom: 3px; }
  }

  /* Introduce overlay */
  #introduce-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 20;
    font-family: var(--vscode-font-family);
    font-size: 12px;
  }
  #introduce-overlay[hidden] { display: none; }
  .intro-card {
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 6px;
    width: 100%;
    max-width: 520px;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  }
  .intro-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  }
  .intro-head h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }
  #btn-intro-close {
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    cursor: pointer;
    line-height: 0;
    padding: 3px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
  }
  #btn-intro-close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); }
  .intro-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;
  }
  #intro-img {
    width: 100%;
    aspect-ratio: 1919 / 1023;
    height: auto;
    object-fit: contain;
    border-radius: 4px;
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  #intro-caption {
    margin: 0;
    text-align: center;
    line-height: 1.4;
    opacity: 0.92;
  }
  .intro-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  }
  #intro-counter { opacity: 0.7; font-size: 11px; }
  .intro-nav { display: flex; gap: 8px; }
  #btn-intro-prev[disabled] { opacity: 0.5; cursor: default; }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 16px;
    padding-top: 10px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  .btn {
    padding: 6px 14px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    transition: filter 0.12s;
  }
  .btn-primary {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  .btn-secondary {
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-button-secondaryBorder, rgba(128,128,128,0.35));
  }
  .btn:hover { filter: brightness(1.1); }
  .btn:active { filter: brightness(0.95); }
</style>
</head>
<body class="page-terminal">
  <div id="header">
    <span id="header-title">
      <span class="title-terminal">Terminal</span>
    </span>
    <div id="header-actions">
      <button id="btn-view-diff" class="view-diff-btn" type="button" title="Preview all pending changes" aria-label="Preview all pending changes" hidden>View diff</button>
      <button id="btn-toggle-page" class="header-btn" title="Switch view" aria-label="Switch view">
        <svg class="toggle-to-files" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"/>
          <path d="M3 12h18"/>
          <path d="M3 18h12"/>
        </svg>
      </button>
      <button id="btn-introduce" class="header-btn" title="Introduce" aria-label="Introduce">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>
      <button id="btn-settings" class="header-btn" title="Settings" aria-label="Settings">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
      <span class="header-separator" aria-hidden="true"></span>
      <button id="btn-agent-mode" class="agent-mode-btn" type="button" title="Open Agent mode" aria-label="Open Agent mode">Agent mode</button>
    </div>
  </div>
  <div id="tab-strip">
    <div id="tabs" class="tabs"></div>
    <button id="tab-add" class="tab-add" type="button" title="New terminal" aria-label="New terminal">+</button>
  </div>
  <div id="content">
    <div id="pending-overlay" hidden>
      <div class="pending-head">
        <h2>Pending files</h2>
        <button id="btn-pending-back" class="header-btn" type="button" title="Back to terminal" aria-label="Back to terminal">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div id="pending-tree" class="pending-tree"></div>
    </div>
    <div id="term-wrap">
      <div id="err"></div>
      <div id="term-host"></div>
      <div id="settings-overlay" hidden>
        <div class="settings-head">
          <h2>Settings</h2>
          <button id="btn-close" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="field">
          <label for="f-font-family">Font family</label>
          <select id="f-font-family">
${FONT_OPTIONS.map((f) => {
  const installable = !!findInstallableForPrimary(f.primary);
  return `            <option value="${escapeAttr(f.value)}" data-primary="${escapeAttr(f.primary)}"${installable ? ' data-installable="1"' : ''}>${escapeHtml(f.label)}</option>`;
}).join('\n')}
          </select>
        </div>
        <div class="field field-install" id="install-row" hidden>
          <label></label>
          <div class="install-controls">
            <button id="btn-install-font" class="btn btn-secondary" type="button">Install font</button>
            <button id="btn-reload-window" class="btn btn-secondary" type="button">Reload window</button>
            <span class="install-status" id="install-status"></span>
          </div>
        </div>
        <div class="field">
          <label for="f-font-size">Font size</label>
          <input id="f-font-size" type="number" min="6" max="32" step="1">
        </div>
        <div class="field">
          <label for="f-preset">Theme</label>
          <select id="f-preset">
            <option value="vscode">Follow VS Code</option>
            <option value="default-dark">Default Dark</option>
            <option value="solarized-dark">Solarized Dark</option>
            <option value="dracula">Dracula</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="field indent custom-only">
          <label for="f-bg">Background</label>
          <div class="color-row">
            <input id="f-bg" type="color">
            <span id="f-bg-hex"></span>
          </div>
        </div>
        <div class="field indent custom-only">
          <label for="f-fg">Foreground</label>
          <div class="color-row">
            <input id="f-fg" type="color">
            <span id="f-fg-hex"></span>
          </div>
        </div>
        <div class="field indent custom-only">
          <label for="f-cursor-color">Cursor color</label>
          <div class="color-row">
            <input id="f-cursor-color" type="color">
            <span id="f-cursor-hex"></span>
          </div>
        </div>
        <div class="field">
          <label for="f-cursor-style">Cursor style</label>
          <select id="f-cursor-style">
            <option value="block">Block</option>
            <option value="underline">Underline</option>
            <option value="bar">Bar</option>
          </select>
        </div>
        <div class="field">
          <label for="f-cursor-blink">Cursor blink</label>
          <input id="f-cursor-blink" type="checkbox">
        </div>
        <div class="field">
          <label for="f-sound-notifications">Sound notifications</label>
          <input id="f-sound-notifications" type="checkbox">
        </div>
        <div class="setting-help">Plays a sound when Claude finishes a turn or needs input (Windows only). Writes to <code>~/.claude/settings.json</code>.</div>
        <div class="field file-ext-field">
          <div class="label-row">
            <label>Included files</label>
            <button class="info-btn" type="button" data-info="info-file-ext" aria-expanded="false"
              title="About included files" aria-label="About included files">${INFO_ICON_SVG}</button>
          </div>
          <div id="info-file-ext" class="setting-info" hidden>
            Extra files to track for AI edits — a baseline is kept and edits open a diff — on top
            of the built-in list (<code>.ts</code>, <code>.py</code>, <code>.md</code>,
            <code>Dockerfile</code>, …). Add one when edits to a file you care about never open a
            diff. Uses <code>.gitignore</code> syntax, the reverse of Excluded paths below, matched
            relative to each workspace folder's root. Applies to every repo you open.
            <table class="info-examples">
              <tr><th>Pattern</th><th>Tracks</th></tr>
              <tr><td><code>*.prisma</code></td><td>every <code>.prisma</code> file, at any depth</td></tr>
              <tr><td><code>Jenkinsfile</code></td><td>every file named exactly <code>Jenkinsfile</code> — no extension needed</td></tr>
              <tr><td><code>config.*.local</code></td><td><code>config.dev.local</code>, <code>config.prod.local</code>; <code>*</code> = any characters, <code>?</code> = exactly one</td></tr>
              <tr><td><code>templates/**/*.tpl</code></td><td><code>.tpl</code> files only inside <code>templates</code>; <code>*</code> stays within one folder, <code>**</code> spans folders</td></tr>
              <tr><td><code>/scripts/*</code></td><td>files directly in <code>scripts</code> at the repo root — <code>src/scripts</code> is not affected</td></tr>
              <tr><td><code>!*.lock</code></td><td>stop tracking <code>.lock</code> files, even though they are on the built-in list</td></tr>
            </table>
            Watch out: <code>.prisma</code> on its own only matches a file named exactly
            <code>.prisma</code>. To track all Prisma files, use <code>*.prisma</code>.
            <br><br>
            Excluded paths and <code>.gitignore</code> always win: a file that is both included and
            excluded is not tracked. Binary files (images, <code>.dll</code>, …) are skipped even if
            a pattern matches them.
            <br><br>
            Type in the last row and press Enter; separate several with commas. Double-click a
            row to edit it, select it and press Delete to remove it.
          </div>
          <div class="file-ext-controls">
            <div class="file-ext-list">
              <table class="file-ext-table" aria-label="Included files">
                <thead>
                  <tr><th>Pattern</th></tr>
                </thead>
                <tbody id="file-ext-body"></tbody>
              </table>
            </div>
            <div class="file-ext-actions">
              <button id="btn-ext-new" class="btn btn-secondary" type="button">New...</button>
              <button id="btn-ext-edit" class="btn btn-secondary" type="button">Edit...</button>
              <button id="btn-ext-delete" class="btn btn-secondary" type="button">Delete</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label for="f-respect-gitignore">Respect .gitignore</label>
          <input id="f-respect-gitignore" type="checkbox">
        </div>
        <div class="setting-help">Files ignored by the repo's <code>.gitignore</code> (any folder level, nested repos included) or <code>.git/info/exclude</code> are never tracked — no diff. Turn off to review AI edits to ignored files such as <code>.env.local</code>.</div>
        <div class="field file-ext-field">
          <div class="label-row">
            <label>Excluded paths</label>
            <button class="info-btn" type="button" data-info="info-excluded-paths" aria-expanded="false"
              title="About excluded paths" aria-label="About excluded paths">${INFO_ICON_SVG}</button>
          </div>
          <div id="info-excluded-paths" class="setting-info" hidden>
            Paths that are never tracked — no baseline, no diff. Uses <code>.gitignore</code>
            syntax, matched relative to each workspace folder's root, so it never matches folders
            outside the repo. Applies to every repo you open.
            <table class="info-examples">
              <tr><th>Pattern</th><th>Excludes</th></tr>
              <tr><td><code>*.html</code></td><td>every <code>.html</code> file, at any depth</td></tr>
              <tr><td><code>.omx</code></td><td>anything named exactly <code>.omx</code> (e.g. the <code>.omx/</code> folder), at any depth</td></tr>
              <tr><td><code>generated/</code></td><td>every folder named <code>generated</code> and everything inside</td></tr>
              <tr><td><code>/docs</code></td><td>only <code>docs</code> at the repo root — <code>src/docs</code> is still tracked</td></tr>
              <tr><td><code>src/gen/**</code></td><td>everything under <code>src/gen</code>; <code>*</code> stays within one folder, <code>**</code> spans folders</td></tr>
              <tr><td><code>*.log</code> + <code>!keep.log</code></td><td>every <code>.log</code> file except <code>keep.log</code></td></tr>
            </table>
            Watch out: <code>.html</code> on its own only matches something named exactly
            <code>.html</code>. To exclude all HTML files, use <code>*.html</code>.
            <br><br>
            Adds to the built-in list (<code>node_modules</code>, <code>.git</code>,
            <code>build</code>, <code>dist</code>, <code>out</code>, …), which cannot be re-included.
            Diffs already open for a newly excluded file stay until you Accept or Reject them.
            <br><br>
            Type in the last row and press Enter; separate several with commas. Double-click a
            row to edit it, select it and press Delete to remove it.
          </div>
          <div class="file-ext-controls">
            <div class="file-ext-list">
              <table class="file-ext-table" aria-label="Excluded paths">
                <thead>
                  <tr><th>Pattern</th></tr>
                </thead>
                <tbody id="excluded-path-body"></tbody>
              </table>
            </div>
            <div class="file-ext-actions">
              <button id="btn-excl-new" class="btn btn-secondary" type="button">New...</button>
              <button id="btn-excl-edit" class="btn btn-secondary" type="button">Edit...</button>
              <button id="btn-excl-delete" class="btn btn-secondary" type="button">Delete</button>
            </div>
          </div>
        </div>

        <h3 class="settings-section-title">Advanced</h3>
        <div class="field">
          <label for="f-burst-enabled">Burst-write detection</label>
          <input id="f-burst-enabled" type="checkbox">
        </div>
        <div class="field">
          <label for="f-burst-window">Burst window (ms)</label>
          <input id="f-burst-window" type="number" min="50" max="5000" step="10">
        </div>
        <div class="field">
          <label for="f-burst-threshold">Burst threshold (files)</label>
          <input id="f-burst-threshold" type="number" min="2" max="500" step="1">
        </div>
        <div class="field">
          <label for="f-burst-hold">Burst hold (ms)</label>
          <input id="f-burst-hold" type="number" min="500" max="10000" step="100">
        </div>
        <div class="setting-help">
          When this many files change within the window, files beyond the threshold are held
          for "Burst hold" ms — opened as a diff only if no git branch change is confirmed in
          time, so a real git checkout never flashes a diff tab.
        </div>

        <div class="field">
          <label for="f-max-auto-open">Max auto-opened diffs</label>
          <input id="f-max-auto-open" type="number" min="0" max="1000" step="10">
        </div>
        <div class="setting-help">
          Once this many diff tabs are open, further files the AI changes only appear in Pending
          Files — open them from there or with Alt+H / Alt+L. A notification says how many were
          left out. <strong>0 turns the limit off.</strong>
        </div>

        <div class="field">
          <label for="f-max-file-lines">Max file lines</label>
          <input id="f-max-file-lines" type="number" min="0" max="200000" step="500">
        </div>
        <div class="setting-help">
          Files longer than this are ignored completely — no baseline is kept and no diff tab
          ever opens for them. <strong>0 turns the limit off.</strong>
          <br><br>
          Why there is a limit: diff cost grows with the <em>square</em> of how many lines
          differ, so a large file that gets largely rewritten can block VS Code for seconds.
          Files that big are also almost always generated code, bundles or lock files rather
          than something you review hunk by hunk.
          <br><br>
          Why 5000: measured across microsoft/vscode, 99.8% of source files are under it
          (median ~112 lines, p99 ~1980). Raise it if you genuinely review very large
          hand-written files — the TypeScript compiler's <code>checker.ts</code> is 54,433
          lines — and accept that opening such a diff may stall the editor.
        </div>

        <div class="actions">
          <button id="btn-reset" class="btn btn-secondary" type="button">Reset</button>
          <button id="btn-apply" class="btn btn-primary" type="button">Apply</button>
        </div>
      </div>
    </div>
    <div id="diff-preview-overlay" hidden>
      <div class="diff-preview-head">
        <div class="diff-preview-title">
          <strong>Preview diff mode</strong>
          <span id="diff-preview-summary">Loading changes…</span>
        </div>
        <div class="diff-preview-head-actions">
          <button id="btn-diff-toggle-all" class="btn btn-secondary" type="button">Collapse all</button>
        </div>
      </div>
      <div class="diff-preview-scroll">
        <main id="diff-preview-content" class="diff-preview-content">
          <div id="diff-preview-status" class="diff-preview-status">Loading pending changes…</div>
        </main>
      </div>
    </div>
    <div id="file-preview-overlay" hidden>
      <section class="file-preview-card" role="dialog" aria-label="File preview">
        <header class="file-preview-head">
          <strong id="file-preview-path">Loading file…</strong>
          <span class="file-preview-head-right">
            <span id="file-preview-modes" hidden>
              <button type="button" data-mode="preview">Preview</button>
              <button type="button" data-mode="source">Source</button>
            </span>
            <button id="file-preview-beside" type="button" hidden title="Open in a side editor with its own viewer (closes this preview)">Open in side</button>
            <span id="file-preview-hint">Ctrl+S to save</span>
          </span>
        </header>
        <div id="file-preview-render" hidden></div>
        <div id="file-preview-editor"></div>
      </section>
    </div>
    <div id="introduce-overlay" hidden>
      <div class="intro-card">
        <div class="intro-head">
          <h2>Introduction</h2>
          <button id="btn-intro-close" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="intro-body">
          <img id="intro-img" src="" alt="">
          <p id="intro-caption"></p>
        </div>
        <div class="intro-footer">
          <span id="intro-counter">1 / 4</span>
          <div class="intro-nav">
            <button id="btn-intro-prev" class="btn btn-secondary" type="button">Prev</button>
            <button id="btn-intro-next" class="btn btn-primary" type="button">Next</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${xtermJs}"></script>
  <script nonce="${nonce}" src="${addonFitJs}"></script>
  <script nonce="${nonce}">
    window.__AI_CLI_MONACO_BASE__ = ${JSON.stringify(monacoBase.toString())};
    window.__AI_CLI_PREVIEW_LIBS__ = ${JSON.stringify(previewLibs)};
  </script>
  <script nonce="${nonce}" src="${aggregateDiffJs}"></script>
${previewScripts.map((src) => `  <script nonce="${nonce}" src="${src}"></script>`).join('\n')}
  <script nonce="${nonce}">
    (function () {
      const vscode = window.__AI_CLI_VSCODE_API__ || (
        window.__AI_CLI_VSCODE_API__ = acquireVsCodeApi()
      );
      const errEl = document.getElementById('err');
      function showError(msg) {
        errEl.style.display = 'block';
        errEl.textContent = msg;
      }

      if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined' || !FitAddon.FitAddon) {
        showError('xterm.js failed to load');
        return;
      }

      const DEFAULTS = ${JSON.stringify({ ...DEFAULT_SETTINGS, ...DEFAULT_BURST_DETECTION_SETTINGS, ...DEFAULT_SOUND_NOTIFICATION_SETTINGS, ...DEFAULT_FILE_LIMIT_SETTINGS, ...DEFAULT_EXCLUSION_SETTINGS })};
      let currentSettings = JSON.parse(JSON.stringify(DEFAULTS));

      const termHost = document.getElementById('term-host');
      const tabsEl = document.getElementById('tabs');
      const btnAddTab = document.getElementById('tab-add');
      const btnAgentMode = document.getElementById('btn-agent-mode');
      const btnViewDiff = document.getElementById('btn-view-diff');
      const diffPreviewOverlay = document.getElementById('diff-preview-overlay');
      const filePreviewOverlay = document.getElementById('file-preview-overlay');
      let agentModeActive = false;

      function setAgentModeState(active) {
        agentModeActive = !!active;
        document.body.classList.toggle('agent-mode-active', agentModeActive);
        btnAgentMode.textContent = agentModeActive ? 'Tắt Agent mode' : 'Agent mode';
        const label = agentModeActive ? 'Tắt Agent mode' : 'Bật Agent mode';
        btnAgentMode.title = label;
        btnAgentMode.setAttribute('aria-label', label);
        btnViewDiff.hidden = !agentModeActive;
        if (!agentModeActive) closeActivePreview();
      }

      // id -> { id, term, fit, host, tab, dataDisp, exited }
      const sessions = new Map();
      let activeId = null;

      function safeFitSession(sess) { try { sess.fit.fit(); } catch (_) { /* ignore */ } }

      function pickVar(name, fallback) {
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fallback;
      }

      function resolveTheme(s) {
        switch (s.themePreset) {
          case 'default-dark':
            return { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' };
          case 'solarized-dark':
            return { background: '#002b36', foreground: '#93a1a1', cursor: '#93a1a1' };
          case 'dracula':
            return { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2' };
          case 'custom':
            return {
              background: s.customColors.background,
              foreground: s.customColors.foreground,
              cursor: s.customColors.cursor,
            };
          case 'vscode':
          default: {
            const bg = pickVar('--vscode-terminal-background', '') ||
                       pickVar('--vscode-editor-background', '#1e1e1e');
            const fg = pickVar('--vscode-terminal-foreground', '') ||
                       pickVar('--vscode-editor-foreground', '#cccccc');
            const cur = pickVar('--vscode-terminalCursor-foreground', '') ||
                        pickVar('--vscode-editorCursor-foreground', fg);
            return { background: bg, foreground: fg, cursor: cur };
          }
        }
      }

      // The header and tab strip follow the terminal colours for fixed presets, so they
      // do not clash with the terminal below; with the "VS Code theme" preset they keep
      // the VS Code variables.
      function applyChromeColors(s, theme) {
        const root = document.documentElement.style;
        const names = ['--chrome-bg', '--chrome-fg', '--chrome-border', '--chrome-hover', '--chrome-active'];
        if (s.themePreset === 'vscode') {
          names.forEach((name) => root.removeProperty(name));
          return;
        }
        const fg = theme.foreground;
        root.setProperty('--chrome-bg', 'color-mix(in srgb, ' + theme.background + ' 88%, ' + fg + ' 12%)');
        root.setProperty('--chrome-fg', fg);
        root.setProperty('--chrome-border', 'color-mix(in srgb, ' + fg + ' 25%, transparent)');
        root.setProperty('--chrome-hover', 'color-mix(in srgb, ' + fg + ' 15%, transparent)');
        root.setProperty('--chrome-active', theme.background);
      }

      function applySettings(s) {
        currentSettings = s;
        const theme = resolveTheme(s);
        applyChromeColors(s, theme);
        const wrap = document.getElementById('term-wrap');
        if (wrap) wrap.style.background = theme.background;
        for (const sess of sessions.values()) {
          sess.term.options.fontFamily = s.fontFamily;
          sess.term.options.fontSize = s.fontSize;
          sess.term.options.cursorStyle = s.cursorStyle;
          sess.term.options.cursorBlink = s.cursorBlink;
          sess.term.options.theme = theme;
          try { sess.term.clearTextureAtlas && sess.term.clearTextureAtlas(); } catch (_) {}
          safeFitSession(sess);
          try { sess.term.refresh(0, sess.term.rows - 1); } catch (_) {}
          vscode.postMessage({ type: 'resize', id: sess.id, cols: sess.term.cols, rows: sess.term.rows });
        }
      }

      function makeXterm() {
        const t = new Terminal({
          fontFamily: currentSettings.fontFamily,
          fontSize: currentSettings.fontSize,
          cursorStyle: currentSettings.cursorStyle,
          cursorBlink: currentSettings.cursorBlink,
          allowProposedApi: true,
          theme: resolveTheme(currentSettings),
        });
        t.attachCustomKeyEventHandler((e) => {
          if (e.type !== 'keydown') return true;
          // Ctrl/Cmd+C copies when there is a selection; otherwise fall through (SIGINT).
          if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'c' || e.key === 'C') && t.hasSelection()) {
            navigator.clipboard.writeText(t.getSelection()).catch(() => {});
            return false;
          }
          // Ctrl+Shift+C always copies (VS Code-style).
          if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c') && t.hasSelection()) {
            navigator.clipboard.writeText(t.getSelection()).catch(() => {});
            return false;
          }
          // Ctrl/Cmd+V pastes clipboard text (Claude Code on Windows waits for the terminal to
          // paste; it ignores ^V). With no text (e.g. an image), send a raw ^V instead so CLIs
          // that read the clipboard themselves (opencode image paste) still get the key.
          // The native paste event is suppressed in onSessionCreated, otherwise it duplicates the text.
          if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'v' || e.key === 'V')) {
            e.preventDefault();
            navigator.clipboard.readText().then((text) => {
              if (text) t.paste(text);
              else t.input('\\x16');
            }).catch(() => t.input('\\x16'));
            return false;
          }
          // Ctrl+Insert copies.
          if (e.ctrlKey && e.key === 'Insert' && t.hasSelection()) {
            navigator.clipboard.writeText(t.getSelection()).catch(() => {});
            return false;
          }
          return true;
        });
        return t;
      }

      function buildTabDom(id, title) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.id = id;
        const titleEl = document.createElement('span');
        titleEl.className = 'tab-title';
        titleEl.textContent = title;
        const closeEl = document.createElement('span');
        closeEl.className = 'tab-close';
        closeEl.title = 'Close terminal';
        closeEl.textContent = '×';
        tab.appendChild(titleEl);
        tab.appendChild(closeEl);
        tab.addEventListener('click', (e) => {
          if (e.target === closeEl) return;
          activateTab(id);
        });
        closeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'closeSession', id });
        });
        return tab;
      }

      // Programs set the terminal title with OSC 0/2 (Claude Code, PowerShell...). Follow it,
      // debounced because an agent can rewrite it many times a second.
      function shortTitle(text) {
        const clean = Array.from(String(text || '')).filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127).join('').trim();
        return clean.length > 60 ? clean.slice(0, 59) + '…' : clean;
      }

      function reportPanelTitle() {
        const sess = sessions.get(activeId);
        vscode.postMessage({ type: 'sessionTitle', title: sess ? sess.shownTitle : '' });
      }

      function applySessionTitle(sess) {
        const title = shortTitle(sess.rawTitle) || sess.defaultTitle;
        if (title === sess.shownTitle) return;
        sess.shownTitle = title;
        const titleEl = sess.tab.querySelector('.tab-title');
        if (titleEl) titleEl.textContent = title;
        sess.tab.title = sess.rawTitle || sess.defaultTitle;
        if (sess.id === activeId) reportPanelTitle();
      }

      function activateTab(id) {
        if (!sessions.has(id)) return;
        if (activeId === id) return;
        const old = sessions.get(activeId);
        if (old) {
          old.host.classList.remove('active');
          old.tab.classList.remove('active');
        }
        const next = sessions.get(id);
        next.host.classList.add('active');
        next.tab.classList.add('active');
        activeId = id;
        vscode.postMessage({ type: 'activeSession', id });
        // scroll the tab into view
        try { next.tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
        reportPanelTitle();
        requestAnimationFrame(() => {
          safeFitSession(next);
          vscode.postMessage({ type: 'resize', id, cols: next.term.cols, rows: next.term.rows });
          try { next.term.focus(); } catch (_) {}
        });
      }

      let focusOnSessionCreated = false;

      function onSessionCreated(id, title, restoring) {
        const host = document.createElement('div');
        host.className = 'term-pane';
        host.dataset.id = id;
        termHost.appendChild(host);

        const t = makeXterm();
        const f = new FitAddon.FitAddon();
        t.loadAddon(f);
        t.open(host);
        const ta = host.querySelector('.xterm-helper-textarea');
        if (ta) {
          // VS Code still runs its own paste in the webview on Ctrl+V (keydown preventDefault
          // does not stop it), so xterm's native paste handler would paste a second time.
          // Ctrl/Cmd+V is handled in attachCustomKeyEventHandler instead.
          ta.addEventListener('paste', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
          }, true);
          ta.addEventListener('focus', () => {
            vscode.postMessage({ type: 'terminalFocusState', focused: true });
          });
          ta.addEventListener('blur', () => {
            // Always reported: the host compares it with the window-focus event
            // to tell alt-tab (keep "was focused") from a click on another view.
            vscode.postMessage({ type: 'terminalFocusState', focused: false });
          });
        }

        const tab = buildTabDom(id, title);
        tabsEl.appendChild(tab);

        const sess = {
          id, term: t, fit: f, host, tab, dataDisp: null, exited: false,
          defaultTitle: title, shownTitle: title, rawTitle: '', titleTimer: 0, titleDisp: null,
        };
        sess.titleDisp = t.onTitleChange((next) => {
          sess.rawTitle = next;
          clearTimeout(sess.titleTimer);
          sess.titleTimer = setTimeout(() => applySessionTitle(sess), 300);
        });
        sess.dataDisp = t.onData((data) => {
          if (sess.exited) return;
          vscode.postMessage({ type: 'input', id, data });
        });
        sessions.set(id, sess);
        // A restored tab is activated by onRestoreSessions after its screen is replayed.
        if (restoring) return;
        activateTab(id);
        // also fit + report dims (activateTab already does this on the rAF tick)
        if (focusOnSessionCreated) {
          focusOnSessionCreated = false;
          requestAnimationFrame(() => { try { t.focus(); } catch (_) {} });
        }
      }

      function onSessionClosed(id) {
        const sess = sessions.get(id);
        if (!sess) return;
        try { sess.dataDisp && sess.dataDisp.dispose(); } catch (_) {}
        try { sess.titleDisp && sess.titleDisp.dispose(); } catch (_) {}
        clearTimeout(sess.titleTimer);
        try { sess.term.dispose(); } catch (_) {}
        sess.host.remove();
        sess.tab.remove();
        sessions.delete(id);
        if (activeId === id) {
          activeId = null;
          const remaining = Array.from(sessions.keys());
          if (remaining.length > 0) {
            activateTab(remaining[remaining.length - 1]);
          }
          // if zero remain, extension auto-spawns a replacement and we receive sessionCreated.
        }
      }

      function isFontInstalled(family) {
        const test = 'mmmmmmmmmmlliIWW';
        const size = '72px';
        function measure(stack) {
          const el = document.createElement('span');
          el.textContent = test;
          el.style.fontFamily = stack;
          el.style.fontSize = size;
          el.style.position = 'absolute';
          el.style.left = '-9999px';
          el.style.top = '-9999px';
          el.style.visibility = 'hidden';
          el.style.whiteSpace = 'nowrap';
          document.body.appendChild(el);
          const w = el.offsetWidth;
          document.body.removeChild(el);
          return w;
        }
        const baseline = measure('monospace');
        const primary = (family.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
        if (!primary) return true;
        const target = measure('"' + primary + '", monospace');
        return target !== baseline;
      }

      // Sessions outlive this webview. The extension replies to 'ready' with
      // restoreSessions (shells already running) or sessionCreated (first start).
      requestAnimationFrame(() => {
        vscode.postMessage({ type: 'ready' });
        vscode.postMessage({ type: 'getSettings' });
      });

      function markExited(s, id, code) {
        s.exited = true;
        s.term.writeln('\\r\\n\\x1b[2m[shell exited: ' + code + '] press any key to restart\\x1b[0m');
        const once = s.term.onData(() => {
          once.dispose();
          s.exited = false;
          try { s.term.reset(); } catch (_) {}
          vscode.postMessage({ type: 'restart', id });
        });
      }

      function onRestoreSessions(list, restoreActiveId) {
        const written = [];
        for (const snap of list) {
          if (sessions.has(snap.id)) continue;
          onSessionCreated(snap.id, snap.title, true);
          const s = sessions.get(snap.id);
          // Replay at the size it was serialized at; activateTab fits and reflows
          // only once the replay is parsed, otherwise lines wrap at the wrong width.
          try { s.term.resize(snap.cols, snap.rows); } catch (_) {}
          written.push(new Promise((resolve) => s.term.write(snap.serialized, resolve)).then(() => {
            if (snap.exited) markExited(s, snap.id, snap.exitCode);
          }));
          if (snap.rawTitle) {
            s.rawTitle = snap.rawTitle;
            applySessionTitle(s);
          }
        }
        Promise.all(written).then(() => {
          const ids = Array.from(sessions.keys());
          const target = restoreActiveId && sessions.has(restoreActiveId) ? restoreActiveId : ids[ids.length - 1];
          // activateTab focuses the terminal itself.
          focusOnSessionCreated = false;
          if (target) activateTab(target);
        });
      }

      const ro = new ResizeObserver(() => {
        const sess = sessions.get(activeId);
        if (!sess) return;
        safeFitSession(sess);
        vscode.postMessage({ type: 'resize', id: activeId, cols: sess.term.cols, rows: sess.term.rows });
      });
      ro.observe(termHost);

      btnAddTab.addEventListener('click', () => {
        const sess = sessions.get(activeId);
        const cols = sess ? sess.term.cols : 80;
        const rows = sess ? sess.term.rows : 24;
        vscode.postMessage({ type: 'createSession', cols, rows });
      });

      const themeObserver = new MutationObserver(() => {
        if (currentSettings.themePreset === 'vscode') {
          applySettings(currentSettings);
        }
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

      // Auto-close aux bar when panel narrows past ~1/4 screen width.
      // Fires once per wide→narrow crossing; resets when width recovers or view hides.
      (function () {
        const MIN_VALID_WIDTH = 50;
        let baselineWidth = null;
        let cooldown = false;
        function threshold() {
          return Math.floor((window.screen.availWidth || 1920) / 4);
        }
        function check() {
          const w = document.documentElement.clientWidth;
          if (w < MIN_VALID_WIDTH) {
            baselineWidth = null;
            return;
          }
          const t = threshold();
          if (baselineWidth === null) {
            baselineWidth = w;
            return;
          }
          if (!cooldown && baselineWidth >= t && w < t) {
            cooldown = true;
            vscode.postMessage({ type: 'viewTooNarrow' });
          }
          if (w >= t) {
            cooldown = false;
          }
          baselineWidth = w;
        }
        const widthRO = new ResizeObserver(check);
        widthRO.observe(document.documentElement);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            baselineWidth = null;
            cooldown = false;
          }
        });
      })();

      // Auto-close aux bar when panel narrows past ~1/4 screen width. Fires once
      // per wide→narrow transition; resets when width recovers or view hides.
      (function () {
        const MIN_VALID_WIDTH = 50;
        let baselineWidth = null;
        let cooldown = false;
        function threshold() {
          return Math.floor((window.screen.availWidth || 1920) / 4);
        }
        function check() {
          const w = document.documentElement.clientWidth;
          if (w < MIN_VALID_WIDTH) {
            baselineWidth = null;
            return;
          }
          const t = threshold();
          if (baselineWidth === null) {
            baselineWidth = w;
            return;
          }
          if (!cooldown && baselineWidth >= t && w < t) {
            cooldown = true;
            vscode.postMessage({ type: 'viewTooNarrow' });
          }
          if (w >= t) {
            cooldown = false;
          }
          baselineWidth = w;
        }
        const widthRO = new ResizeObserver(check);
        widthRO.observe(document.documentElement);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            baselineWidth = null;
            cooldown = false;
          }
        });
      })();

      window.addEventListener('message', (e) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === 'sessionCreated') {
          onSessionCreated(msg.id, msg.title);
        } else if (msg.type === 'pendingFiles') {
          onPendingFiles(msg.html || '');
        } else if (msg.type === 'restoreSessions') {
          onRestoreSessions(msg.sessions || [], msg.activeId);
        } else if (msg.type === 'sessionClosed') {
          onSessionClosed(msg.id);
        } else if (msg.type === 'data') {
          const s = sessions.get(msg.id);
          if (s) s.term.write(msg.data);
        } else if (msg.type === 'exit') {
          const s = sessions.get(msg.id);
          if (s) markExited(s, msg.id, msg.code);
        } else if (msg.type === 'error') {
          showError('PTY error: ' + msg.message);
        } else if (msg.type === 'settings') {
          applySettings(msg.settings);
        } else if (msg.type === 'installProgress') {
          setInstallStatus(msg.message || 'Installing…', '');
        } else if (msg.type === 'installDone') {
          refreshFontAnnotations();
          btnInstallFont.disabled = true;
          btnInstallFont.textContent = 'Installed';
          if (msg.restartRecommended) {
            btnReload.style.display = '';
            setInstallStatus('Installed. Reload window to start using it.', 'ok');
          } else {
            setInstallStatus('Installed.', 'ok');
          }
        } else if (msg.type === 'installError') {
          btnInstallFont.disabled = false;
          btnInstallFont.textContent = 'Retry install';
          setInstallStatus(msg.error || 'Install failed', 'err');
        } else if (msg.type === 'showIntroduce') {
          openIntro();
        } else if (msg.type === 'agentModeState') {
          setAgentModeState(msg.active);
        } else if (msg.type === 'toggleDiffPreview') {
          btnViewDiff.click();
        } else if (msg.type === 'openIntroduce') {
          openIntro();
        } else if (msg.type === 'openSettings') {
          btnOpen.click();
        } else if (msg.type === 'showDiffPreview') {
          openDiffPreview(msg.path);
        } else if (msg.type === 'showFilePreview') {
          openFilePreview(msg.path);
        } else if (msg.type === 'focusTerminal') {
          if (msg.onlyIfIdle) {
            const active = document.activeElement;
            const typing = active && active !== document.body
              && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && !active.closest('.xterm');
            const overlayOpen = ['diff-preview-overlay', 'file-preview-overlay', 'settings-overlay', 'introduce-overlay']
              .some((id) => { const el = document.getElementById(id); return el && !el.hidden; });
            if (typing || overlayOpen) return;
          }
          const sess = sessions.get(activeId);
          if (sess) {
            requestAnimationFrame(() => { try { sess.term.focus(); } catch (_) {} });
          } else {
            // First session is still being spawned; focus it once it exists.
            focusOnSessionCreated = true;
          }
        }
      });

      // ---- Page toggle ----
      btnAgentMode.addEventListener('click', () => {
        vscode.postMessage({ type: 'toggleAgentMode' });
      });

      // Aggregate diff preview stays in this webview so
      // the terminal sessions remain alive underneath when the preview closes.
      function openDiffPreview(targetPath) {
        if (!filePreviewOverlay.hidden) closeFilePreview();
        diffPreviewOverlay.hidden = false;
        window.aiCliDiffPreview?.open(targetPath);
        btnViewDiff.textContent = 'Back to terminal';
        btnViewDiff.title = 'Back to terminal';
        btnViewDiff.setAttribute('aria-label', 'Back to terminal');
      }

      function closeDiffPreview() {
        diffPreviewOverlay.hidden = true;
        window.aiCliDiffPreview?.close();
        btnViewDiff.textContent = 'View diff';
        btnViewDiff.title = 'Preview all pending changes';
        btnViewDiff.setAttribute('aria-label', 'Preview all pending changes');
      }

      function openFilePreview(filePath) {
        if (!diffPreviewOverlay.hidden) closeDiffPreview();
        filePreviewOverlay.hidden = false;
        window.aiCliFilePreview?.open(filePath);
        btnViewDiff.textContent = 'Back to terminal';
        btnViewDiff.title = 'Back to terminal';
      }

      function closeFilePreview() {
        filePreviewOverlay.hidden = true;
        window.aiCliFilePreview?.close();
        btnViewDiff.textContent = 'View diff';
        btnViewDiff.title = 'Preview all pending changes';
      }

      document.addEventListener('ai-cli-preview-close-request', () => {
        if (!filePreviewOverlay.hidden) closeFilePreview();
      });

      function closeActivePreview() {
        if (!diffPreviewOverlay.hidden) closeDiffPreview();
        if (!filePreviewOverlay.hidden) closeFilePreview();
      }

      btnViewDiff.addEventListener('click', () => {
        if (diffPreviewOverlay.hidden && filePreviewOverlay.hidden) openDiffPreview();
        else closeActivePreview();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && (!diffPreviewOverlay.hidden || !filePreviewOverlay.hidden)) closeActivePreview();
      });
      // Focus leaving this webview (Explorer/Pending Files click) deliberately
      // does not close a preview. The host replaces it when the click opens a
      // file; closing on blur only exposed the terminal until that arrived.
      filePreviewOverlay.addEventListener('click', (event) => {
        if (event.target === filePreviewOverlay) closeFilePreview();
      });
      document.addEventListener('mousedown', (event) => {
        if (filePreviewOverlay.hidden) return;
        const card = filePreviewOverlay.querySelector('.file-preview-card');
        if (card && event.target instanceof Node && !card.contains(event.target)) {
          closeFilePreview();
        }
      });

      // ---- Pending Files overlay ----
      // Shown over the terminal instead of switching views: hiding the terminal
      // view would dispose this webview and drop its xterm tabs.
      const btnTogglePage = document.getElementById('btn-toggle-page');
      const pendingOverlay = document.getElementById('pending-overlay');
      const pendingTree = document.getElementById('pending-tree');
      function setPendingOverlay(open) {
        if (pendingOverlay.hidden === !open) return;
        pendingOverlay.hidden = !open;
        vscode.postMessage({ type: 'pendingOverlay', open });
        if (!open) {
          const sess = sessions.get(activeId);
          if (sess) requestAnimationFrame(() => { try { sess.term.focus(); } catch (_) {} });
        }
      }
      btnTogglePage.addEventListener('click', () => setPendingOverlay(pendingOverlay.hidden));
      document.getElementById('btn-pending-back').addEventListener('click', () => setPendingOverlay(false));
      pendingOverlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setPendingOverlay(false);
      });
      pendingTree.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const toggle = target.closest('[data-folder-toggle]');
        if (toggle) {
          toggle.parentElement.classList.toggle('collapsed');
          return;
        }
        const file = target.closest('[data-path]');
        if (file) vscode.postMessage({ type: 'openPendingFile', path: file.dataset.path });
      });
      function onPendingFiles(html) {
        // Keep folders the user collapsed collapsed across refreshes.
        const collapsed = new Set(Array.from(pendingTree.querySelectorAll('.folder-block.collapsed > .folder'))
          .map((el) => el.textContent));
        const scrollTop = pendingTree.scrollTop;
        pendingTree.innerHTML = html;
        pendingTree.querySelectorAll('.folder-block > .folder').forEach((el) => {
          if (collapsed.has(el.textContent)) el.parentElement.classList.add('collapsed');
        });
        pendingTree.scrollTop = scrollTop;
      }

      // ---- Settings overlay ----
      const overlay = document.getElementById('settings-overlay');
      const btnOpen = document.getElementById('btn-settings');
      const btnClose = document.getElementById('btn-close');
      const btnReset = document.getElementById('btn-reset');
      const btnApply = document.getElementById('btn-apply');
      const fFontFamily = document.getElementById('f-font-family');
      const fFontSize = document.getElementById('f-font-size');
      const fPreset = document.getElementById('f-preset');
      const fBg = document.getElementById('f-bg');
      const fFg = document.getElementById('f-fg');
      const fCursorColor = document.getElementById('f-cursor-color');
      const fBgHex = document.getElementById('f-bg-hex');
      const fFgHex = document.getElementById('f-fg-hex');
      const fCursorHex = document.getElementById('f-cursor-hex');
      const fCursorStyle = document.getElementById('f-cursor-style');
      const fCursorBlink = document.getElementById('f-cursor-blink');
      const fSoundNotifications = document.getElementById('f-sound-notifications');
      const fRespectGitignore = document.getElementById('f-respect-gitignore');
      const fBurstEnabled = document.getElementById('f-burst-enabled');
      const fBurstWindow = document.getElementById('f-burst-window');
      const fBurstThreshold = document.getElementById('f-burst-threshold');
      const fBurstHold = document.getElementById('f-burst-hold');
      const fMaxFileLines = document.getElementById('f-max-file-lines');
      const fMaxAutoOpen = document.getElementById('f-max-auto-open');
      const customRows = document.querySelectorAll('.custom-only');

      // Pattern .gitignore (Included files + Excluded paths): giữ nguyên hoa/thường, không tự thêm dấu chấm.
      function parsePatterns(value) {
        const seen = new Set();
        const result = [];
        String(value || '').split(/[,\\n]/).forEach((part) => {
          const trimmed = part.trim();
          if (!trimmed || seen.has(trimmed)) return;
          seen.add(trimmed);
          result.push(trimmed);
        });
        return result;
      }

      // Bảng New/Edit/Delete dùng chung cho Included files và Excluded paths.
      // Nhập trực tiếp trong bảng: dòng cuối luôn là ô thêm mới (Enter để thêm,
      // nhiều mục cách nhau bằng dấu phẩy); double-click / Edit sửa ngay tại dòng.
      function createListEditor(body, btnNew, btnEdit, btnDelete, parse, placeholder) {
        let items = [];
        let selected = '';
        let editing = '';   // item đang sửa tại chỗ, '' = không sửa
        let addInput;

        function add(raw) {
          const additions = parse(raw);
          if (!additions.length) return;
          const seen = new Set(items);
          additions.forEach((item) => {
            if (!seen.has(item)) {
              seen.add(item);
              items.push(item);
            }
          });
          selected = additions[additions.length - 1];
        }

        function applyEdit(previousValue, nextValue) {
          if (!items.includes(previousValue)) return;
          const next = parse(nextValue)[0];
          if (!next) return;
          const idx = items.indexOf(previousValue);
          items = items.filter((item) => item !== previousValue && item !== next);
          items.splice(Math.min(idx, items.length), 0, next);
          selected = next;
        }

        // Ô nhập trong bảng. onCommit chạy đúng một lần (Enter hoặc rời ô);
        // Escape huỷ. stopPropagation để phím không lọt xuống terminal/overlay.
        function createCellInput(value, onCommit, onCancel) {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'list-cell-input';
          input.spellcheck = false;
          input.value = value;
          let done = false;
          const finish = (commit) => {
            if (done) return;
            done = true;
            if (commit) { onCommit(input.value); } else { onCancel(); }
          };
          input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              finish(true);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              finish(false);
            }
          });
          input.addEventListener('blur', () => finish(true));
          return input;
        }

        function render(focus) {
          body.innerHTML = '';
          items.forEach((item) => {
            const row = document.createElement('tr');
            row.className = item === selected ? 'selected' : '';
            const cell = document.createElement('td');
            if (item === editing) {
              const input = createCellInput(
                item,
                (value) => { editing = ''; applyEdit(item, value); render(); },
                () => { editing = ''; render(); }
              );
              cell.appendChild(input);
              if (focus === 'edit') {
                setTimeout(() => { input.focus(); input.select(); }, 0);
              }
            } else {
              cell.textContent = item;
              cell.title = item;
              row.addEventListener('click', () => {
                if (selected === item) return;
                selected = item;
                render();
              });
              row.addEventListener('dblclick', () => startEdit(item));
            }
            row.appendChild(cell);
            body.appendChild(row);
          });

          const addRow = document.createElement('tr');
          addRow.className = 'list-add-row';
          const addCell = document.createElement('td');
          addInput = createCellInput(
            '',
            (value) => {
              const isEnter = document.activeElement === addInput;
              // Rời ô trống thì không render lại — tránh dựng lại bảng ngay lúc
              // người dùng đang click chọn một dòng khác.
              if (!value.trim() && !isEnter) return;
              add(value);
              // Enter thì giữ con trỏ ở ô thêm mới để gõ tiếp mục sau.
              render(isEnter ? 'add' : undefined);
            },
            () => render()
          );
          addInput.placeholder = placeholder;
          addCell.appendChild(addInput);
          addRow.appendChild(addCell);
          body.appendChild(addRow);
          if (focus === 'add') {
            setTimeout(() => addInput.focus(), 0);
          }

          const hasSelection = items.includes(selected);
          btnEdit.disabled = !hasSelection;
          btnDelete.disabled = !hasSelection;
        }

        function startEdit(item) {
          if (!items.includes(item)) return;
          selected = item;
          editing = item;
          render('edit');
        }

        btnNew.addEventListener('click', () => addInput.focus());
        btnEdit.addEventListener('click', () => startEdit(selected));
        btnDelete.addEventListener('click', () => {
          if (!items.includes(selected)) return;
          const idx = items.indexOf(selected);
          items = items.filter((item) => item !== selected);
          selected = items[Math.min(idx, items.length - 1)] || '';
          render();
        });

        return {
          // Mục đang gõ dở (chưa Enter) vẫn được tính khi bấm Apply.
          get: () => {
            if (addInput && addInput.value.trim()) {
              add(addInput.value);
              addInput.value = '';
            }
            return items.slice();
          },
          set(values) {
            items = parse(Array.isArray(values) ? values.join('\\n') : '');
            editing = '';
            if (!items.includes(selected)) {
              selected = items[0] || '';
            }
            render();
          },
        };
      }

      const listEditors = {
        includedPaths: createListEditor(
          document.getElementById('file-ext-body'),
          document.getElementById('btn-ext-new'),
          document.getElementById('btn-ext-edit'),
          document.getElementById('btn-ext-delete'),
          parsePatterns,
          'e.g. *.prisma, Jenkinsfile or templates/**/*.tpl — press Enter'
        ),
        excludedPaths: createListEditor(
          document.getElementById('excluded-path-body'),
          document.getElementById('btn-excl-new'),
          document.getElementById('btn-excl-edit'),
          document.getElementById('btn-excl-delete'),
          parsePatterns,
          'e.g. *.log, generated/ or /docs — press Enter'
        ),
      };

      // Nút "i" cạnh tiêu đề setting: mở/đóng khung mô tả ngay bên dưới.
      document.querySelectorAll('.info-btn[data-info]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const panel = document.getElementById(btn.dataset.info);
          if (!panel) return;
          panel.hidden = !panel.hidden;
          btn.setAttribute('aria-expanded', String(!panel.hidden));
        });
      });

      function populateForm(s) {
        fFontFamily.value = s.fontFamily;
        if (fFontFamily.value !== s.fontFamily) {
          let extra = fFontFamily.querySelector('option[data-extra="1"]');
          if (!extra) {
            extra = document.createElement('option');
            extra.dataset.extra = '1';
            fFontFamily.appendChild(extra);
          }
          extra.value = s.fontFamily;
          extra.textContent = 'Custom: ' + (s.fontFamily.split(',')[0] || s.fontFamily).replace(/"/g, '').trim();
          fFontFamily.value = s.fontFamily;
        }
        fFontSize.value = String(s.fontSize);
        fPreset.value = s.themePreset;
        fBg.value = s.customColors.background;
        fFg.value = s.customColors.foreground;
        fCursorColor.value = s.customColors.cursor;
        fBgHex.textContent = s.customColors.background;
        fFgHex.textContent = s.customColors.foreground;
        fCursorHex.textContent = s.customColors.cursor;
        fCursorStyle.value = s.cursorStyle;
        fCursorBlink.checked = s.cursorBlink;
        fSoundNotifications.checked = s.soundNotificationsEnabled;
        listEditors.includedPaths.set(s.includedPaths);
        listEditors.excludedPaths.set(s.excludedPaths);
        fRespectGitignore.checked = s.respectGitignore;
        fBurstEnabled.checked = s.burstDetectionEnabled;
        fBurstWindow.value = String(s.burstDetectionWindowMs);
        fBurstThreshold.value = String(s.burstDetectionThreshold);
        fBurstHold.value = String(s.burstDetectionHoldMs);
        fMaxFileLines.value = String(s.maxFileLines);
        fMaxAutoOpen.value = String(s.maxAutoOpenDiffs);
        toggleCustomRows();
      }

      function toggleCustomRows() {
        const show = fPreset.value === 'custom';
        customRows.forEach((el) => { el.style.display = show ? '' : 'none'; });
      }

      function readForm() {
        const size = parseInt(fFontSize.value, 10);
        const burstWindow = parseInt(fBurstWindow.value, 10);
        const burstThreshold = parseInt(fBurstThreshold.value, 10);
        const burstHold = parseInt(fBurstHold.value, 10);
        const maxFileLines = parseInt(fMaxFileLines.value, 10);
        const maxAutoOpen = parseInt(fMaxAutoOpen.value, 10);
        return {
          fontFamily: fFontFamily.value.trim() || DEFAULTS.fontFamily,
          fontSize: isFinite(size) ? Math.min(32, Math.max(6, size)) : DEFAULTS.fontSize,
          themePreset: fPreset.value,
          customColors: {
            background: fBg.value,
            foreground: fFg.value,
            cursor: fCursorColor.value,
          },
          cursorStyle: fCursorStyle.value,
          cursorBlink: !!fCursorBlink.checked,
          soundNotificationsEnabled: !!fSoundNotifications.checked,
          includedPaths: listEditors.includedPaths.get(),
          burstDetectionEnabled: !!fBurstEnabled.checked,
          burstDetectionWindowMs: isFinite(burstWindow) ? Math.min(5000, Math.max(50, burstWindow)) : DEFAULTS.burstDetectionWindowMs,
          burstDetectionThreshold: isFinite(burstThreshold) ? Math.min(500, Math.max(2, burstThreshold)) : DEFAULTS.burstDetectionThreshold,
          burstDetectionHoldMs: isFinite(burstHold) ? Math.min(10000, Math.max(500, burstHold)) : DEFAULTS.burstDetectionHoldMs,
          // 0 = tắt giới hạn, nên chặn dưới là 0 chứ không phải một mức tối thiểu.
          maxFileLines: isFinite(maxFileLines) ? Math.min(200000, Math.max(0, maxFileLines)) : DEFAULTS.maxFileLines,
          maxAutoOpenDiffs: isFinite(maxAutoOpen) ? Math.min(1000, Math.max(0, maxAutoOpen)) : DEFAULTS.maxAutoOpenDiffs,
          excludedPaths: listEditors.excludedPaths.get(),
          respectGitignore: !!fRespectGitignore.checked,
        };
      }

      // ---- Font install row ----
      const installRow = document.getElementById('install-row');
      const btnInstallFont = document.getElementById('btn-install-font');
      const btnReload = document.getElementById('btn-reload-window');
      const installStatus = document.getElementById('install-status');

      function refreshFontAnnotations() {
        Array.from(fFontFamily.options).forEach((opt) => {
          if (!opt.value || opt.dataset.extra === '1') return;
          const installed = isFontInstalled(opt.value);
          opt.dataset.installed = installed ? '1' : '0';
          const baseLabel = opt.dataset.baseLabel || opt.textContent;
          opt.dataset.baseLabel = baseLabel;
          opt.textContent = installed ? baseLabel : (baseLabel + ' — not installed');
          opt.style.opacity = installed ? '' : '0.55';
        });
      }
      refreshFontAnnotations();

      function setInstallStatus(text, kind) {
        installStatus.textContent = text || '';
        installStatus.className = 'install-status' + (kind ? ' ' + kind : '');
      }

      function updateInstallRow() {
        const opt = fFontFamily.options[fFontFamily.selectedIndex];
        if (!opt) { installRow.hidden = true; return; }
        const installable = opt.dataset.installable === '1';
        const installed = opt.dataset.installed === '1';
        if (installable && !installed) {
          installRow.hidden = false;
          btnInstallFont.disabled = false;
          btnInstallFont.textContent = 'Install font';
          btnReload.style.display = 'none';
          setInstallStatus('', '');
        } else {
          installRow.hidden = true;
        }
      }

      btnInstallFont.addEventListener('click', () => {
        const opt = fFontFamily.options[fFontFamily.selectedIndex];
        if (!opt || opt.dataset.installable !== '1') return;
        btnInstallFont.disabled = true;
        btnInstallFont.textContent = 'Installing…';
        setInstallStatus('Preparing…', '');
        vscode.postMessage({ type: 'installFont', primary: opt.dataset.primary });
      });
      btnReload.addEventListener('click', () => {
        vscode.postMessage({ type: 'reloadWindow' });
      });

      btnOpen.addEventListener('click', () => {
        populateForm(currentSettings);
        overlay.hidden = false;
        updateInstallRow();
      });
      btnClose.addEventListener('click', () => { overlay.hidden = true; });
      btnReset.addEventListener('click', () => { populateForm(DEFAULTS); updateInstallRow(); });
      btnApply.addEventListener('click', () => {
        const next = readForm();
        vscode.postMessage({ type: 'updateSettings', settings: next });
        overlay.hidden = true;
      });
      fFontFamily.addEventListener('change', updateInstallRow);
      fPreset.addEventListener('change', toggleCustomRows);
      fBg.addEventListener('input', () => { fBgHex.textContent = fBg.value; });
      fFg.addEventListener('input', () => { fFgHex.textContent = fFg.value; });
      fCursorColor.addEventListener('input', () => { fCursorHex.textContent = fCursorColor.value; });

      // ---- Introduce overlay ----
      const INTRO_SLIDES = ${JSON.stringify(introSlides)};
      const introOverlay = document.getElementById('introduce-overlay');
      const introImg = document.getElementById('intro-img');
      const introCaption = document.getElementById('intro-caption');
      const introCounter = document.getElementById('intro-counter');
      const btnIntroOpen = document.getElementById('btn-introduce');
      const btnIntroClose = document.getElementById('btn-intro-close');
      const btnIntroPrev = document.getElementById('btn-intro-prev');
      const btnIntroNext = document.getElementById('btn-intro-next');
      let introIdx = 0;
      let introSeenSent = false;

      function renderIntro() {
        const slide = INTRO_SLIDES[introIdx];
        introImg.src = slide.src;
        introImg.alt = slide.caption;
        introCaption.textContent = slide.caption;
        introCounter.textContent = (introIdx + 1) + ' / ' + INTRO_SLIDES.length;
        btnIntroPrev.disabled = introIdx === 0;
        btnIntroNext.textContent = introIdx === INTRO_SLIDES.length - 1 ? 'Done' : 'Next';
      }

      function openIntro() {
        introIdx = 0;
        renderIntro();
        introOverlay.hidden = false;
      }

      function closeIntro() {
        introOverlay.hidden = true;
        if (!introSeenSent) {
          introSeenSent = true;
          vscode.postMessage({ type: 'introduceSeen' });
        }
      }

      btnIntroOpen.addEventListener('click', openIntro);
      btnIntroClose.addEventListener('click', closeIntro);
      btnIntroPrev.addEventListener('click', () => {
        if (introIdx > 0) { introIdx--; renderIntro(); }
      });
      btnIntroNext.addEventListener('click', () => {
        if (introIdx < INTRO_SLIDES.length - 1) {
          introIdx++;
          renderIntro();
        } else {
          closeIntro();
        }
      });
    })();
  </script>
</body>
</html>`;
}

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
