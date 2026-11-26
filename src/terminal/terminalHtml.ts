import * as vscode from 'vscode';
import { findInstallableForPrimary } from './fontInstaller';
import { PENDING_TREE_CSS } from '../views/pendingTree';
import { CLAUDE_UI_LIMITS, DEFAULT_CLAUDE_UI_APPEARANCE, DEFAULT_BURST_DETECTION_SETTINGS, DEFAULT_EXCLUSION_SETTINGS, DEFAULT_FILE_LIMIT_SETTINGS, DEFAULT_FOCUS_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SOUND_NOTIFICATION_SETTINGS } from './terminalTypes';
import { TERMINAL_THEMES } from './terminalThemes';

interface FontOption {
  label: string;
  value: string;
  primary: string;
}

function themeOptionsHtml(): string {
  const group = (label: string, g: 'dark' | 'light'): string =>
    `<optgroup label="${label}">` +
    TERMINAL_THEMES.filter((t) => t.group === g)
      .map((t) => `<option value="${t.id}">${t.label}</option>`).join('') +
    '</optgroup>';
  return group('Dark', 'dark') + group('Light', 'light');
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

/** Claude UI font: '' follows VS Code's editor font (what the chat uses by default). */
const CLAUDE_FONT_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Follow VS Code', value: '' },
  { label: 'System UI (sans-serif)', value: 'system-ui, -apple-system, "Segoe UI", Ubuntu, sans-serif' },
  ...FONT_OPTIONS.map((f) => ({ label: f.label, value: f.value })),
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

// Custom AI CLI Diff View icon set: 24 grid, 20 live area, round caps/joins.
// 16px with stroke-width 2.7 renders a ~1.8px stroke at this size.
const TAB_ICON_ATTRS = 'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const TAB_ICON_LIST = `<svg ${TAB_ICON_ATTRS}><path d="M4 6.5h16M4 12h16M4 17.5h9"/></svg>`;
const TAB_ICON_INFO = `<svg ${TAB_ICON_ATTRS}><circle cx="12" cy="12" r="8.75"/><path d="M12 11v5.5"/><path d="M12 7.5h.01"/></svg>`;
const TAB_ICON_SETTINGS = `<svg ${TAB_ICON_ATTRS}><path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.5"/><circle cx="15" cy="16" r="2.5"/></svg>`;
const TAB_ICON_TABS = `<svg ${TAB_ICON_ATTRS}><rect x="3" y="7.5" width="14" height="12.5" rx="3"/><path d="M7.5 4h10.5a3 3 0 0 1 3 3v9"/></svg>`;
const TAB_ICON_BACK = `<svg class="btn-icon icon-back" ${TAB_ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7 9l3 3-3 3"/><rect x="12.5" y="12.5" width="4" height="3.5" rx="1" fill="currentColor" stroke="none"/></svg>`;

export function buildTerminalHtml(args: BuildTerminalHtmlArgs): string {
  const { webview, extensionUri } = args;

  const iconsBase = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'icons')).toString();
  const agentModeIcon = `<img class="btn-icon icon-agent" src="${iconsBase}/agent-mode.svg" alt="" aria-hidden="true">`;
  const viewDiffIcon = `<img class="btn-icon icon-diff" src="${iconsBase}/view-diff.png" alt="" aria-hidden="true">`;

  const xtermBase = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'xterm'));
  const xtermJs = `${xtermBase}/xterm.js`;
  const xtermCss = `${xtermBase}/xterm.css`;
  const addonFitJs = `${xtermBase}/addon-fit.js`;
  const monacoBase = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'monaco-editor', 'min', 'vs'));
  const aggregateDiffJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'res', 'webview', 'aggregateDiff.js'));
  const claudeFrameJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'res', 'webview', 'claudeFrame.js'));
  const paneLayoutJs = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'res', 'webview', 'paneLayout.js'));
  const claudeUiDir = vscode.Uri.joinPath(extensionUri, 'dist', 'claude-ui');
  const claudeUi = {
    js: webview.asWebviewUri(vscode.Uri.joinPath(claudeUiDir, 'main.js')).toString(),
    css: webview.asWebviewUri(vscode.Uri.joinPath(claudeUiDir, 'style.css')).toString(),
  };
  const previewDir = vscode.Uri.joinPath(extensionUri, 'res', 'webview', 'preview');
  const previewCss = webview.asWebviewUri(vscode.Uri.joinPath(previewDir, 'preview.css'));
  const previewScripts = ['libs', 'code', 'zoom', 'mermaid', 'markdown', 'image', 'csv', 'index']
    .map((name) => webview.asWebviewUri(vscode.Uri.joinPath(previewDir, `${name}.js`)));
  const previewLibs = {
    marked: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'marked', 'lib', 'marked.umd.js')).toString(),
    dompurify: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'dompurify', 'dist', 'purify.min.js')).toString(),
    mermaid: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js')).toString(),
  };

  const introBase = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'introduce'));
  const catDiffImg = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'meo_diff_wide.png')).toString();
  const catIdleImg = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'meo_ngu_wide.png')).toString();
  const introSlides: IntroSlide[] = [
    { src: `${introBase}/sidebar-inline-diff.png`,   caption: 'Welcome to AI CLI Diff — every AI edit becomes a diff you accept or reject block by block.' },
    { src: `${introBase}/sidebar-pending-files.png`, caption: 'See every changed file in its real folder structure, with +/- line counts.' },
    { src: `${introBase}/agent-mode.png`,            caption: 'Agent mode: the terminal takes the editor area, with changed files beside it.' },
    { src: `${introBase}/agent-aggregate-diff.png`,  caption: 'Review all changes on one page, and accept or reject whole files.' },
    { src: `${introBase}/agent-file-diff.png`,       caption: 'Click a file in the tree to jump straight to its changes.' },
    { src: `${introBase}/agent-preview-csv.png`,     caption: 'Preview CSV, Markdown, images and code without leaving the terminal.' },
    { src: `${introBase}/agent-preview-mermaid.png`, caption: 'Mermaid diagrams render right in the panel.' },
    { src: `${introBase}/sidebar-settings.png`,      caption: 'Choose which files are tracked and customize the terminal from Settings.' },
  ];

  const nonce = randomNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval'`,
    `font-src ${webview.cspSource} data:`,
    `img-src ${webview.cspSource} data: blob:`,
    // Claude UI tabs fetch their bundle once and inline it into an iframe (claudeFrame.js).
    `connect-src ${webview.cspSource}`,
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
  /* html must clip too: body's overflow only clips its own box when html's overflow is not visible
     (otherwise it propagates to the viewport and the rounded corners get overdrawn). */
  html { height: 100%; margin: 0; padding: 4px; box-sizing: border-box; overflow: hidden; background: var(--vscode-sideBar-background, #1e1e1e); }
  body { margin: 0; padding: 0; height: 100%; }
  /* Dark outer frame around the whole tab (tab strip + terminal) to make it stand out. */
  body {
    border: 1px solid #000;
    border-radius: 8px;
    box-sizing: border-box;
    isolation: isolate;
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground, #cccccc);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* Header actions — herdr-style: quiet ghost icon buttons, one soft accent pill. */
  #header-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .header-separator {
    width: 1px;
    height: 14px;
    margin: 0 4px;
    background: var(--vscode-panel-border, rgba(128,128,128,0.45));
  }
  .agent-mode-btn,
  .view-diff-btn {
    height: 26px;
    padding: 0 12px;
    border-radius: 7px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    line-height: 24px;
    white-space: nowrap;
    box-sizing: border-box;
    transition: background 0.12s, border-color 0.12s, transform 0.06s;
  }
  .agent-mode-btn {
    min-width: 92px;
    color: var(--chrome-fg, var(--vscode-foreground));
    background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-button-background, #0e639c) 50%, transparent);
  }
  .agent-mode-btn:hover {
    background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 30%, transparent);
    border-color: var(--vscode-button-background, #0e639c);
  }
  #btn-view-diff[hidden] { display: none; }
  body.agent-mode-active #header-actions { display: none; }
  .view-diff-btn {
    min-width: 76px;
    color: var(--chrome-fg, var(--vscode-foreground));
    background: transparent;
    border: 1px solid var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.4)));
  }
  .view-diff-btn:hover { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); }
  .agent-mode-btn,
  .view-diff-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .agent-mode-btn .btn-icon,
  .view-diff-btn .btn-icon { flex: 0 0 auto; height: 16px; width: auto; display: block; }
  .view-diff-btn .icon-back { width: 16px; }
  .view-diff-btn:not(.preview-open) .icon-back,
  .view-diff-btn.preview-open .icon-diff { display: none; }
  /* Narrow sidebar: the labelled buttons turn icon-only one by one (View diff
     first, then Agent mode), so the tab strip keeps room for the tab titles. */
  @container group (max-width: 560px) {
    .view-diff-btn { width: 26px; min-width: 26px; padding: 0; }
    .view-diff-btn .btn-label { display: none; }
  }
  @container group (max-width: 420px) {
    .agent-mode-btn { width: 26px; min-width: 26px; padding: 0; }
    .agent-mode-btn .btn-label { display: none; }
  }
  .agent-mode-btn:active, .view-diff-btn:active { transform: translateY(1px); }
  .agent-mode-btn:focus-visible, .view-diff-btn:focus-visible, .header-btn:focus-visible, .tab-add:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: 1px;
  }
  .header-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    border-radius: 7px;
    cursor: pointer;
    line-height: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.75;
    transition: background 0.12s, color 0.12s, opacity 0.12s;
  }
  .header-btn svg { display: block; }
  .header-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); color: var(--vscode-foreground); opacity: 1; }
  body.page-terminal .tab-strip .header-btn:hover { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); color: var(--chrome-fg, var(--vscode-foreground)); }
  body.page-terminal .tab-strip .header-btn { color: var(--chrome-fg, var(--vscode-icon-foreground, var(--vscode-foreground))); }
  body.page-terminal .tab-strip .header-separator { background: var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.45))); }
  .header-btn:active { background: var(--vscode-toolbar-activeBackground, rgba(128,128,128,0.28)); }

  /* Tab strip — rounded pills, a raised active tab and a "+" that opens the launcher menu. */
  .tab-strip {
    flex: 0 0 38px;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    box-sizing: border-box;
    background: var(--chrome-bg, var(--vscode-sideBar-background));
    border-bottom: 1px solid var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.25)));
    color: var(--chrome-fg, var(--vscode-foreground));
    font-family: var(--vscode-font-family);
    font-size: 12px;
    user-select: none;
    min-width: 0;
  }
  .tabs {
    /* Shrink-only: the + button stays right after the last tab instead of at the far edge. */
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    /* never squeezed away by the header buttons: at least part of a title shows */
    min-width: 60px;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 10px;
    min-width: 72px;
    max-width: 180px;
    height: 26px;
    flex: 0 0 auto;
    border: 1px solid transparent;
    border-radius: 7px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--chrome-fg, var(--vscode-foreground));
    opacity: 0.7;
    transition: background 0.12s, border-color 0.12s, opacity 0.12s;
  }
  .tab:hover { background: var(--chrome-hover, var(--vscode-list-hoverBackground, rgba(128,128,128,0.12))); opacity: 1; }
  .tab.active {
    background: var(--chrome-active, var(--vscode-editor-background));
    border-color: var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.3)));
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    opacity: 1;
  }
  .tab-title {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-close {
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    opacity: 0;
    font-size: 14px;
    line-height: 1;
  }
  .tab:hover .tab-close, .tab.active .tab-close { opacity: 0.6; }
  .tab-close:hover { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); opacity: 1; }
  .tab-add {
    flex: 0 0 26px;
    width: 26px;
    height: 26px;
    margin-right: auto;
    background: transparent;
    border: none;
    border-radius: 7px;
    color: var(--chrome-fg, var(--vscode-icon-foreground, var(--vscode-foreground)));
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.75;
    transition: background 0.12s, opacity 0.12s;
  }
  .tab-add:hover, .tab-add[aria-expanded="true"] { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); opacity: 1; }
  /* Very narrow group: tighter strip (after the base rules above, which
     would otherwise win at equal specificity). Container queries: each pane
     group measures its own width, not the whole view. */
  @container group (max-width: 320px) {
    .tab-strip { padding: 0 6px; }
    #header-actions { gap: 2px; }
    .header-separator { display: none; }
  }
  @container group (max-width: 260px) {
    .tab-strip { gap: 2px; }
    .tab-strip .header-btn,
    .agent-mode-btn,
    .view-diff-btn { width: 24px; min-width: 24px; }
    .tab-add { flex-basis: 22px; width: 22px; }
  }

  /* Narrow side bar: the tab row gives way to one icon (like View diff) that
     lists the tabs in a menu, so the header buttons keep their room. */
  .tabs-btn { display: none; position: relative; flex: 0 0 auto; }
  .tabs-count {
    position: absolute;
    right: 1px;
    bottom: 1px;
    min-width: 11px;
    height: 11px;
    padding: 0 2px;
    box-sizing: border-box;
    border-radius: 6px;
    background: var(--chrome-bg, var(--vscode-sideBar-background));
    font-size: 9px;
    font-weight: 600;
    line-height: 11px;
    text-align: center;
  }
  .tabs-count:empty { display: none; }
  /* a background tab finished (same signal as the green dot on a tab) */
  .tabs-btn.has-done::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3fb950;
  }
  /* The group holding the header buttons gives up its tab row early (as the whole
     side bar used to); other groups keep their tabs until they are really narrow. */
  @container group (max-width: 560px) {
    #layout-root:not(.multi) .group.has-actions > .tab-strip .tabs { display: none; }
    #layout-root:not(.multi) .group.has-actions > .tab-strip .tabs-btn { display: inline-flex; }
  }
  @container group (max-width: 400px) {
    #layout-root.multi .group.has-actions > .tab-strip .tabs { display: none; }
    #layout-root.multi .group.has-actions > .tab-strip .tabs-btn { display: inline-flex; }
  }
  @container group (max-width: 220px) {
    .tab-strip .tabs { display: none; }
    .tab-strip .tabs-btn { display: inline-flex; }
  }
  .tabs-menu .agent-item.active { background: var(--vscode-list-inactiveSelectionBackground, rgba(128,128,128,0.16)); }
  .tabs-menu .agent-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tabs-menu .agent-item.done .agent-name::after { content: ' \u25CF'; color: #3fb950; }
  .tab-menu-close {
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: 14px;
    line-height: 1;
    opacity: 0.6;
  }
  .tab-menu-close:hover { background: var(--chrome-hover, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); opacity: 1; }

  /* Launcher menu opened by the "+" button */
  .agent-menu {
    position: fixed;
    z-index: 50;
    min-width: 220px;
    max-width: calc(100vw - 16px);
    padding: 6px;
    box-sizing: border-box;
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background, var(--vscode-sideBar-background)));
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, rgba(128,128,128,0.35)));
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    font-family: var(--vscode-font-family);
    font-size: 13px;
  }
  .agent-menu[hidden] { display: none; }
  .agent-menu-label {
    padding: 6px 10px 4px;
    font-size: 11px;
    opacity: 0.6;
  }
  .agent-menu-sep { height: 1px; margin: 6px 4px; background: var(--vscode-menu-separatorBackground, rgba(128,128,128,0.3)); }
  .agent-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .agent-item:hover:not(:disabled), .agent-item:focus-visible {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground, rgba(128,128,128,0.2)));
    color: var(--vscode-menu-selectionForeground, inherit);
    outline: none;
  }
  .agent-item:disabled { opacity: 0.45; cursor: default; }
  .agent-item .agent-icon { flex: 0 0 18px; display: inline-flex; align-items: center; justify-content: center; }
  .agent-item .agent-name { flex: 1 1 auto; }
  .agent-item .agent-hint { flex: 0 0 auto; font-size: 12px; opacity: 0.6; }

  #content {
    flex: 1 1 auto;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  /* Pane groups (res/webview/paneLayout.js): a split tree of groups, each a tab
     strip over an empty body. The panes themselves live in #term-host and are only
     positioned over their group's body: moving an iframe in the DOM reloads it. */
  #layout-root {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  .split { display: flex; flex: 1 1 0px; min-width: 0; min-height: 0; }
  .split-row { flex-direction: row; }
  .split-col { flex-direction: column; }
  .group {
    container: group / inline-size;
    display: flex;
    flex-direction: column;
    flex: 1 1 0px;
    min-width: 0;
    min-height: 0;
  }
  .group-body {
    flex: 1 1 auto;
    min-height: 0;
    background: var(--term-bg, var(--vscode-editor-background));
  }
  .sash {
    flex: 0 0 4px;
    position: relative;
    background: var(--chrome-bg, var(--vscode-sideBar-background));
    z-index: 1;
    touch-action: none;
  }
  .sash-v { cursor: col-resize; }
  .sash-h { cursor: row-resize; }
  .sash::after {
    content: '';
    position: absolute;
    background: var(--chrome-border, var(--vscode-panel-border, rgba(128,128,128,0.35)));
    transition: background 0.1s;
  }
  .sash-v::after { top: 0; bottom: 0; left: 1.5px; width: 1px; }
  .sash-h::after { left: 0; right: 0; top: 1.5px; height: 1px; }
  .sash:hover::after { transition-delay: 0.3s; }
  .sash:hover::after, .sash.active::after { background: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder, #007fd4)); }
  .sash-v:hover::after, .sash-v.active::after { left: 0; width: 4px; }
  .sash-h:hover::after, .sash-h.active::after { top: 0; height: 4px; }
  /* With several groups, the one taking input keeps a crisp active tab; the others dim theirs. */
  #layout-root.multi .group:not(.focused) .tab.active { opacity: 0.72; box-shadow: none; }
  #layout-root.multi .group.focused .tab.active { border-color: color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 55%, transparent); }
  /* Drag and drop */
  .pl-shield { position: fixed; inset: 0; z-index: 1000; background: transparent; }
  .pl-shield[hidden] { display: none; }
  body.pl-dragging, body.pl-dragging * { user-select: none !important; }
  .pl-drop-overlay {
    position: fixed;
    left: 0; top: 0; width: 0; height: 0;
    box-sizing: border-box;
    border-radius: 6px;
    background: var(--vscode-editorGroup-dropBackground, rgba(83, 89, 93, 0.5));
    border: 1px solid color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 45%, transparent);
    opacity: 0;
    pointer-events: none;
    transition: left 0.14s cubic-bezier(.2,.8,.2,1), top 0.14s cubic-bezier(.2,.8,.2,1),
      width 0.14s cubic-bezier(.2,.8,.2,1), height 0.14s cubic-bezier(.2,.8,.2,1), opacity 0.1s;
  }
  .pl-drop-overlay.show { opacity: 1; }
  .pl-drop-overlay.no-anim { transition: none; }
  .tab-ghost {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    background: var(--chrome-active, var(--vscode-editor-background));
    position: fixed !important;
    left: 0; top: 0;
    margin: 0;
    z-index: 2;
    pointer-events: none;
    opacity: 0.95 !important;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28) !important;
    will-change: transform;
    transition: none;
  }
  .tab-ghost.landing { transition: transform 0.16s cubic-bezier(.2,.8,.2,1), width 0.16s, box-shadow 0.16s; box-shadow: none !important; }
  .tab.dragging { opacity: 0.35 !important; }
  .tab.dragging.drag-hidden { opacity: 0 !important; }
  #layout-root .tab { transition: background 0.12s, border-color 0.12s, opacity 0.12s, transform 0.16s cubic-bezier(.2,.8,.2,1); }
  #layout-root.pl-no-anim .tab { transition: none !important; }
  .tab-strip.pl-drop-target { background: color-mix(in srgb, var(--chrome-bg, var(--vscode-sideBar-background)) 80%, var(--vscode-focusBorder, #007fd4) 20%); }
  .pl-tab-menu { min-width: 180px; }

  /* Overlays and the pane host start below the top row of tab strips (38px), so
     the strips (and their buttons) stay usable while an overlay is open. */
  #term-wrap {
    position: absolute;
    inset: 38px 0 0 0;
    overflow: hidden;
    pointer-events: none;
  }
  #term-wrap > * { pointer-events: auto; }
  #term-host { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .term-pane {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    display: none;
    pointer-events: auto;
    overflow: hidden;
  }
  .term-pane.active { display: block; }
  /* Claude UI tab: an iframe running the uic chat app (res/webview/claudeFrame.js). */
  .term-pane.claude { background: var(--vscode-sideBar-background); }
  .claude-frame-host { position: absolute; inset: 0; }
  .claude-frame { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
  .claude-frame-notice {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    padding: 16px; text-align: center; color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBar-background);
  }
  .tab.done .tab-title::after { content: ' \u25CF'; color: #3fb950; }
  /* xterm.css paints .xterm-viewport black and stretches it over the padding box, which showed
     as a hard black frame (top/left/bottom, not right). Paint the whole terminal with the theme
     colour instead, so the padding blends into it on every side. Claude UI panes are excluded:
     they follow the VS Code theme, and the terminal preset's background under VS Code's text
     colours made the chat unreadable. */
  .term-pane:not(.claude),
  .xterm,
  .xterm .xterm-viewport { background-color: var(--term-bg, var(--vscode-editor-background)) !important; }
  .xterm { padding: 8px 4px 6px 10px; height: 100%; box-sizing: border-box; }


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
    padding: 0 12px 14px;
    overflow: auto;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    z-index: 10;
  }
  #settings-overlay[hidden] { display: none; }
  .settings-head {
    position: sticky;
    top: 0;
    z-index: 3;
    margin: 0 -12px 12px !important;
    padding: 8px 12px;
    flex-wrap: wrap;
    gap: 6px 8px;
    background: var(--vscode-sideBar-background, #1e1e1e);
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
  }
  .settings-head h2 { margin-right: auto !important; }
  .settings-head-actions { display: flex; align-items: center; gap: 6px; }
  .settings-head-actions .btn { height: 24px; padding: 0 12px; }
  /* Cards flow into columns when there is room (Terminal + Behavior side by side) and stack when narrow. */
  .settings-cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    align-items: stretch;
  }
  /* Wide panel: 2/3 + 1/3 rows keep the page balanced; narrow panel stacks everything. */
  @media (min-width: 640px) {
    .settings-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .settings-card { grid-column: span 3; }
    .settings-card.span-2 { grid-column: span 2; }
    .settings-card.span-1 { grid-column: span 1; }
  }
  .track-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 12px; }
  @media (min-width: 900px) { .track-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .track-grid .file-ext-list { min-height: 72px; max-height: 120px; }
  /* Aero / Frutiger glass: soft aqua tint, gloss highlight on top, inner light edge. */
  .settings-card {
    --card-accent: #3a9ad9;
    container-type: inline-size;
    padding: 0 10px 2px;
    border: 1px solid color-mix(in srgb, var(--card-accent) 55%, transparent);
    border-radius: 9px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.14) 0, rgba(255,255,255,0.03) 34px, transparent 35px),
      color-mix(in srgb, var(--card-accent) 10%, transparent);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 0 0 1px rgba(255,255,255,0.05), 0 2px 6px rgba(0,0,0,0.25);
    min-width: 0;
  }
  .settings-card.danger { --card-accent: #e5534b; }
  .settings-card .field { margin-bottom: 6px; gap: 6px; }
  .settings-card .field label { flex-basis: 84px; }
  /* Labels only wrap when the card is genuinely too narrow. */
  .settings-card .field:has(input[type="checkbox"]) > label,
  .settings-card .field:has(#f-max-auto-open, #f-max-file-lines) > label { flex: 0 1 auto; }
  .settings-card .field:has(input[type="checkbox"]) { justify-content: flex-start; gap: 10px; }
  .settings-card .label-row label { flex: none; white-space: nowrap; }
  .settings-card .field.file-ext-field { align-self: stretch; margin-bottom: 8px; }
  .track-grid .file-ext-controls { flex: 1 1 auto; }
  .track-grid .file-ext-list { flex: 1 1 auto; }
  .settings-card .setting-help { margin: -2px 0 8px; font-size: 10.5px; line-height: 1.4; }
  .settings-card .field input[type="text"],
  .settings-card .field input[type="number"],
  .settings-card .field select { background: var(--vscode-input-background, #2a2a2a); border-color: color-mix(in srgb, var(--card-accent) 35%, transparent); border-radius: 5px; padding: 3px 6px; }
  .settings-card-title {
    margin: 0 -10px 8px;
    padding: 5px 10px;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid color-mix(in srgb, var(--card-accent) 40%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--card-accent) 38%, transparent), color-mix(in srgb, var(--card-accent) 14%, transparent));
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    text-shadow: 0 1px 0 rgba(0,0,0,0.3);
  }
  @container (max-width: 250px) {
    .settings-card .field:not(.field-check):not(:has(input[type="checkbox"])) { flex-direction: column; align-items: stretch; gap: 3px; }
    .settings-card .field:not(.field-check):not(:has(input[type="checkbox"])) > label { flex: none; }
  }
  .settings-card .field.file-ext-field:last-child,
  .settings-card .setting-help:last-child { margin-bottom: 8px; }
  .settings-head-actions .btn-primary {
    background: linear-gradient(180deg, color-mix(in srgb, var(--vscode-button-background, #0e639c) 70%, #fff) 0, var(--vscode-button-background, #0e639c) 50%, color-mix(in srgb, var(--vscode-button-background, #0e639c) 85%, #000) 100%);
    border-color: color-mix(in srgb, var(--vscode-button-background, #0e639c) 70%, #000);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);
  }
  .settings-head-actions .btn-secondary {
    background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.03));
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);
  }
  /* Short settings share a row; each cell wraps onto its own line when the panel is narrow. */
  .field-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 0 10px;
  }
  .field-grid .field { flex-direction: column; align-items: stretch; gap: 4px; }
  .field-grid .field > label { flex: none; }
  .field-grid .field input[type="number"] { flex: none; width: 100%; }
  .field-grid .field.field-check { flex-direction: row; align-items: center; justify-content: space-between; align-self: end; min-height: 26px; }
  .field-grid .field.field-check > label { flex: 1 1 auto; }
  .settings-card .field.file-ext-field:last-child,
  .settings-card .setting-help:last-child { margin-bottom: 8px; }
  /* Pending Files is drawn over the terminal; the terminal keeps running underneath. */
  #pending-overlay {
    position: absolute;
    inset: 38px 0 0 0;
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
  /* Thin rounded scrollbar instead of VS Code's 10px square default; the thumb brightens while the list is hovered. */
  #pending-tree::-webkit-scrollbar { width: 6px; height: 6px; }
  #pending-tree::-webkit-scrollbar-track { background: transparent; }
  #pending-tree::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
  #pending-tree:hover::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.4)); }
  #pending-tree::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.7)); }
  #pending-tree::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground, rgba(191,191,191,0.4)); }
  #pending-tree::-webkit-scrollbar-corner { background: transparent; }
  /* Fixed-height footer: the cat and Accept All stay put whether or not files are pending. */
  .pending-foot {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px 10px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  }
  .pending-cat {
    height: 84px;
    background: var(--pending-cat) center / contain no-repeat;
    opacity: 0.65;
    pointer-events: none;
  }
  .pending-cat { --pending-cat: var(--cat-diff); }
  #pending-overlay.no-pending .pending-cat { --pending-cat: var(--cat-idle); opacity: 1; }
  .pending-accept-all {
    height: 30px;
    padding: 0 12px;
    border-radius: 7px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    color: var(--vscode-foreground);
    background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-foreground) 22%, transparent);
    transition: background 0.12s, border-color 0.12s;
  }
  .pending-accept-all:hover:not(:disabled) {
    background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 18%, transparent);
    border-color: color-mix(in srgb, var(--vscode-button-background, #0e639c) 55%, transparent);
  }
  .pending-accept-all:active:not(:disabled) { opacity: 0.7; }
  .pending-accept-all:disabled { opacity: 0.45; cursor: default; }
  .pending-accept-all:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px; }
  #pending-tree * { box-sizing: border-box; }
  ${PENDING_TREE_CSS}
  .settings-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
    position: relative;
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
  #btn-diff-back { display: inline-flex; align-items: center; gap: 5px; }
  /* Outside Agent mode the header's View diff button already reads "Back to terminal". */
  body:not(.agent-mode-active) #btn-diff-back { display: none; }
  .diff-preview-scroll {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    position: relative;
    /* Size container so .aggregate-editor can size itself in cqh. */
    container-type: size;
  }
  .diff-add { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
  .diff-delete { color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c); }
  .diff-preview-content {
    /* Rail width; padding and the rail both resolve % against the preview width. */
    --diff-rail-width: clamp(56px, 11%, 140px);
    overflow: auto;
    /* Wide right gutter: room to wheel-scroll the list without landing in a file. */
    padding: 16px calc(var(--diff-rail-width) + 30px) 28px 18px;
  }
  /* Marks that gutter. pointer-events: none so the wheel falls through to the list. */
  .diff-preview-rail {
    position: absolute;
    top: 16px;
    bottom: 28px;
    right: 16px;
    width: clamp(56px, 11%, 140px);
    padding: 18px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    box-sizing: border-box;
    border: 1px dashed rgba(128,128,128,0.4);
    border-radius: 8px;
    color: rgba(128,128,128,0.45);
    pointer-events: none;
    user-select: none;
  }
  .diff-preview-rail svg {
    flex: 0 1 auto;
    width: 46%;
    max-height: 34%;
    min-height: 0;
  }
  .diff-rail-label {
    font-size: 11px;
    white-space: nowrap;
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
    padding: 0 10px;
    height: 22px;
    border: 1px solid var(--vscode-button-border, rgba(128,128,128,0.4));
    border-radius: 7px;
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: 11px;
    transition: background 0.12s, border-color 0.12s;
  }
  .aggregate-file-actions button:hover,
  .aggregate-hunk-actions button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18))); }
  .aggregate-file-actions .accept,
  .aggregate-hunk-actions .accept { color: var(--vscode-testing-iconPassed, #73c991); background: color-mix(in srgb, var(--vscode-testing-iconPassed, #73c991) 18%, transparent); border-color: transparent; }
  .aggregate-file-actions .reject,
  .aggregate-hunk-actions .reject { color: var(--vscode-testing-iconFailed, #f14c4c); background: color-mix(in srgb, var(--vscode-testing-iconFailed, #f14c4c) 18%, transparent); border-color: transparent; }
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
    padding: 3px;
    border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.35));
    border-radius: 9px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
    opacity: 0;
    pointer-events: none;
    transition: opacity .12s ease;
  }
  .aggregate-hunk-bar.visible { opacity: 1; pointer-events: auto; }
  .aggregate-hunk-bar button {
    padding: 2px 10px;
    border: 0;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    font: 11px var(--vscode-font-family);
    transition: filter 0.12s;
  }
  .aggregate-hunk-bar button:hover { filter: brightness(1.12); }
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
    padding: 0 14px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid transparent;
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
  .btn:active { filter: brightness(0.95); transform: translateY(1px); }
  .btn:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px; }
</style>
</head>
<body class="page-terminal">
  <div id="agent-menu" class="agent-menu" role="menu" hidden></div>
  <div id="tabs-menu" class="agent-menu tabs-menu" role="menu" hidden></div>
  <div id="content">
    <div id="layout-root">
      <div id="header-actions">
        <button id="btn-view-diff" class="view-diff-btn" type="button" title="Preview all pending changes" aria-label="Preview all pending changes" hidden>
          ${viewDiffIcon}
          ${TAB_ICON_BACK}
          <span class="btn-label">View diff</span>
        </button>
        <button id="btn-toggle-page" class="header-btn" title="Switch view" aria-label="Switch view">
          ${TAB_ICON_LIST}
        </button>
        <button id="btn-introduce" class="header-btn" title="Introduce" aria-label="Introduce">
          ${TAB_ICON_INFO}
        </button>
        <button id="btn-settings" class="header-btn" title="Settings" aria-label="Settings">
          ${TAB_ICON_SETTINGS}
        </button>
        <span class="header-separator" aria-hidden="true"></span>
        <button id="btn-agent-mode" class="agent-mode-btn" type="button" title="Open Agent mode" aria-label="Open Agent mode">
          ${agentModeIcon}
          <span class="btn-label">Agent mode</span>
        </button>
      </div>
    </div>
    <div id="pending-overlay" class="no-pending" hidden style="--cat-diff: url('${catDiffImg}'); --cat-idle: url('${catIdleImg}');">
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
      <div class="pending-foot">
        <div class="pending-cat" aria-hidden="true"></div>
        <button id="btn-pending-accept-all" class="pending-accept-all" type="button" disabled>Accept All Changes</button>
      </div>
    </div>
    <div id="term-wrap">
      <div id="err"></div>
      <div id="term-host"></div>
      <div id="settings-overlay" hidden>
        <div class="settings-head">
          <h2>Settings</h2>
          <div class="settings-head-actions">
            <button id="btn-reset" class="btn btn-secondary" type="button">Reset</button>
            <button id="btn-apply" class="btn btn-primary" type="button">Apply</button>
          </div>
          <button id="btn-close" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="settings-cards">
        <section class="settings-card span-2">
        <h3 class="settings-card-title">Terminal appearance</h3>
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
        <div class="field-grid">
        <div class="field">
          <label for="f-font-size">Font size</label>
          <input id="f-font-size" type="number" min="6" max="32" step="1">
        </div>
        <div class="field">
          <label for="f-cursor-style">Cursor style</label>
          <select id="f-cursor-style">
            <option value="block">Block</option>
            <option value="underline">Underline</option>
            <option value="bar">Bar</option>
          </select>
        </div>
        <div class="field field-check">
          <label for="f-cursor-blink">Cursor blink</label>
          <input id="f-cursor-blink" type="checkbox">
        </div>
        </div>
        <div class="field">
          <label for="f-preset">Theme</label>
          <select id="f-preset">
            <option value="vscode">Follow VS Code</option>
            ${themeOptionsHtml()}
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
        </section>

        <section class="settings-card">
        <h3 class="settings-card-title">Claude UI appearance</h3>
        <div class="field-grid">
        <div class="field">
          <label for="f-claude-font-size">Font size</label>
          <input id="f-claude-font-size" type="number" min="${CLAUDE_UI_LIMITS.fontSize.min}" max="${CLAUDE_UI_LIMITS.fontSize.max}" step="1">
        </div>
        <div class="field">
          <label for="f-claude-line-height">Line height</label>
          <input id="f-claude-line-height" type="number" min="${CLAUDE_UI_LIMITS.lineHeight.min}" max="${CLAUDE_UI_LIMITS.lineHeight.max}" step="1">
        </div>
        <div class="field">
          <label for="f-claude-row-gap">Row spacing</label>
          <input id="f-claude-row-gap" type="number" min="${CLAUDE_UI_LIMITS.rowGap.min}" max="${CLAUDE_UI_LIMITS.rowGap.max}" step="1">
        </div>
        <div class="field">
          <label for="f-claude-column-max">Max width</label>
          <input id="f-claude-column-max" type="number" min="0" max="${CLAUDE_UI_LIMITS.columnMaxWidth.max}" step="20">
        </div>
        </div>
        <p class="setting-help">Font size scales the whole chat (14 = 100%). Line height, row spacing and max width are in px at 100%; max width 0 = full width.</p>
        <div class="field">
          <label for="f-claude-font-family">Font family</label>
          <select id="f-claude-font-family">
${CLAUDE_FONT_OPTIONS.map((f) => `            <option value="${escapeAttr(f.value)}">${escapeHtml(f.label)}</option>`).join('\n')}
          </select>
        </div>
        <div class="field">
          <label for="f-claude-preset">Theme</label>
          <select id="f-claude-preset">
            <option value="vscode">Follow VS Code</option>
            ${themeOptionsHtml()}
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="field indent claude-custom-only">
          <label for="f-claude-bg">Background</label>
          <div class="color-row">
            <input id="f-claude-bg" type="color">
            <span id="f-claude-bg-hex"></span>
          </div>
        </div>
        <div class="field indent claude-custom-only">
          <label for="f-claude-fg">Foreground</label>
          <div class="color-row">
            <input id="f-claude-fg" type="color">
            <span id="f-claude-fg-hex"></span>
          </div>
        </div>
        <div class="field indent claude-custom-only">
          <label for="f-claude-accent">Accent</label>
          <div class="color-row">
            <input id="f-claude-accent" type="color">
            <span id="f-claude-accent-hex"></span>
          </div>
        </div>
        </section>

        <section class="settings-card span-1">
        <h3 class="settings-card-title">Behavior</h3>
        <div class="field">
          <label for="f-sound-notifications">Sound notifications</label>
          <input id="f-sound-notifications" type="checkbox">
        </div>
        <div class="setting-help">Plays a sound when Claude finishes a turn or needs input (Windows only). Writes to <code>~/.claude/settings.json</code>.</div>
        <div class="field">
          <label for="f-prevent-alt-menu-focus">Keep terminal focus on Alt</label>
          <input id="f-prevent-alt-menu-focus" type="checkbox">
        </div>
        <div class="setting-help">Stops Alt (e.g. Alt+Tab back to VS Code) from moving focus to the menu bar. Sets VS Code's <code>window.customMenuBarAltFocus</code> to off.</div>
        <div class="field">
          <label for="f-reveal-in-explorer">Reveal file in Explorer</label>
          <input id="f-reveal-in-explorer" type="checkbox">
        </div>
        <div class="setting-help">Agent mode: clicking a pending file also selects it in Explorer. If this panel shares a side bar with Explorer, the side bar switches to Explorer.</div>
        </section>

        <section class="settings-card">
        <h3 class="settings-card-title">File tracking</h3>
        <div class="track-grid">
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

        </div>
        <div class="field">
          <label for="f-respect-gitignore">Respect .gitignore</label>
          <input id="f-respect-gitignore" type="checkbox">
        </div>
        <div class="setting-help">Files ignored by the repo's <code>.gitignore</code> (any folder level, nested repos included) or <code>.git/info/exclude</code> are never tracked — no diff. Turn off to review AI edits to ignored files such as <code>.env.local</code>.</div>
        </section>

        <section class="settings-card danger span-1">
        <h3 class="settings-card-title">Advanced · Burst detection</h3>
        <div class="field">
          <label for="f-burst-enabled">Burst-write detection</label>
          <input id="f-burst-enabled" type="checkbox">
        </div>
        <div class="field-grid">
        <div class="field">
          <label for="f-burst-window">Window (ms)</label>
          <input id="f-burst-window" type="number" min="50" max="5000" step="10">
        </div>
        <div class="field">
          <label for="f-burst-threshold">Threshold (files)</label>
          <input id="f-burst-threshold" type="number" min="2" max="500" step="1">
        </div>
        <div class="field">
          <label for="f-burst-hold">Hold (ms)</label>
          <input id="f-burst-hold" type="number" min="500" max="10000" step="100">
        </div>
        </div>
        <div class="setting-help">
          When this many files change within the window, files beyond the threshold are held
          for "Burst hold" ms — opened as a diff only if no git branch change is confirmed in
          time, so a real git checkout never flashes a diff tab.
        </div>
        </section>

        <section class="settings-card danger span-2">
        <h3 class="settings-card-title">Advanced · Limits</h3>
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
        </section>
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
          <button id="btn-diff-back" class="btn btn-secondary" type="button" title="Back to terminal (Esc)" aria-label="Back to terminal">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to terminal
          </button>
        </div>
      </div>
      <div class="diff-preview-scroll">
        <main id="diff-preview-content" class="diff-preview-content">
          <div id="diff-preview-status" class="diff-preview-status">Loading pending changes…</div>
        </main>
        <div class="diff-preview-rail" aria-hidden="true">
          <svg viewBox="0 0 40 110" preserveAspectRatio="xMidYMid meet"><path d="M20 2 38 38H27v70H13V38H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
          <span class="diff-rail-label">Scroll here</span>
          <svg viewBox="0 0 40 110" preserveAspectRatio="xMidYMid meet"><path d="M20 108 38 72H27V2H13v70H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
        </div>
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
    window.__AI_CLI_CLAUDE_UI__ = ${JSON.stringify({ ...claudeUi, nonce })};
  </script>
  <script nonce="${nonce}" src="${claudeFrameJs}"></script>
  <script nonce="${nonce}" src="${paneLayoutJs}"></script>
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

      const DEFAULTS = ${JSON.stringify({ ...DEFAULT_SETTINGS, ...DEFAULT_BURST_DETECTION_SETTINGS, ...DEFAULT_SOUND_NOTIFICATION_SETTINGS, ...DEFAULT_FOCUS_SETTINGS, ...DEFAULT_FILE_LIMIT_SETTINGS, ...DEFAULT_EXCLUSION_SETTINGS, claudeUi: DEFAULT_CLAUDE_UI_APPEARANCE })};
      const CLAUDE_LIMITS = ${JSON.stringify(CLAUDE_UI_LIMITS)};
      let currentSettings = JSON.parse(JSON.stringify(DEFAULTS));

      const termHost = document.getElementById('term-host');
      const layoutRoot = document.getElementById('layout-root');
      const headerActions = document.getElementById('header-actions');
      // The "+" / tabs buttons are per pane group; these point at the one last clicked.
      let btnAddTab = null;
      let btnTabs = null;
      let tabsMenuGroup = null;
      const btnAgentMode = document.getElementById('btn-agent-mode');
      const btnViewDiff = document.getElementById('btn-view-diff');
      const diffPreviewOverlay = document.getElementById('diff-preview-overlay');
      const filePreviewOverlay = document.getElementById('file-preview-overlay');
      let agentModeActive = false;

      function setButtonLabel(button, text) {
        const label = button.querySelector('.btn-label');
        if (label) label.textContent = text;
        else button.textContent = text;
      }

      function setAgentModeState(active) {
        agentModeActive = !!active;
        document.body.classList.toggle('agent-mode-active', agentModeActive);
        setButtonLabel(btnAgentMode, agentModeActive ? 'Exit Agent mode' : 'Agent mode');
        const label = agentModeActive ? 'Exit Agent mode' : 'Enter Agent mode';
        btnAgentMode.title = label;
        btnAgentMode.setAttribute('aria-label', label);
        btnViewDiff.hidden = !agentModeActive;
        if (!agentModeActive) closeActivePreview();
      }

      // id -> { id, term, fit, host, tab, dataDisp, exited }
      const sessions = new Map();
      // Active tab of the focused pane group (what the host knows as the active session).
      let activeId = null;
      // Terminals whose restored screen is still being replayed: not fitted until done,
      // otherwise lines wrap at the wrong width.
      const replaying = new Set();
      const pendingResize = new Set();
      let resizeTimer = 0;

      function flushResize() {
        clearTimeout(resizeTimer);
        resizeTimer = 0;
        pendingResize.forEach((id) => {
          const s = sessions.get(id);
          if (s && s.term) vscode.postMessage({ type: 'resize', id, cols: s.term.cols, rows: s.term.rows });
        });
        pendingResize.clear();
      }

      // Panes were moved/resized by the layout. xterm is refitted at once (every frame while
      // a sash is dragged); the PTY hears about it at most every 100 ms until the drag ends,
      // so a TUI is not flooded with SIGWINCH redraws.
      function onPanesLayout(ids, final) {
        ids.forEach((id) => {
          const s = sessions.get(id);
          if (!s || !s.term || replaying.has(id)) return;
          const cols = s.term.cols;
          const rows = s.term.rows;
          safeFitSession(s);
          if (final || s.term.cols !== cols || s.term.rows !== rows) pendingResize.add(id);
        });
        if (final) flushResize();
        else if (pendingResize.size && !resizeTimer) resizeTimer = setTimeout(flushResize, 100);
      }

      function focusActive() {
        const sess = sessions.get(activeId);
        if (!sess) return;
        requestAnimationFrame(() => {
          if (sess.claude) { sess.claude.focus(); return; }
          try { sess.term.focus(); } catch (_) {}
        });
      }

      // The focused group's active tab changed (click, drag, split, close, focus moved).
      function onLayoutActive(id, o) {
        activeId = id;
        const next = id ? sessions.get(id) : null;
        if (!next) { reportPanelTitle(); return; }
        next.tab.classList.remove('done');
        vscode.postMessage({ type: 'activeSession', id });
        try { next.tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
        reportPanelTitle();
        if (o && o.focus) focusActive();
      }

      const layout = window.PaneLayout.create({
        root: layoutRoot,
        paneHost: termHost,
        actionsEl: headerActions,
        tabsIcon: ${JSON.stringify(TAB_ICON_TABS)},
        tabEl: (id) => { const s = sessions.get(id); return s ? s.tab : null; },
        paneEl: (id) => { const s = sessions.get(id); return s ? s.host : null; },
        onActive: onLayoutActive,
        onPanesLayout,
        onAddButton: (gid, btn) => toggleAgentMenu(btn),
        onTabsButton: (gid, btn) => toggleTabsMenu(gid, btn),
        onCloseTab: (id) => vscode.postMessage({ type: 'closeSession', id }),
        // Nothing to keep before the first session exists (an empty layout would
        // overwrite the one the host is about to restore).
        onLayoutChange: (data) => { if (sessions.size > 0) vscode.postMessage({ type: 'layout', layout: data }); },
      });

      function safeFitSession(sess) { try { if (sess.term) sess.fit.fit(); } catch (_) { /* ignore */ } }

      function pickVar(name, fallback) {
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fallback;
      }

      const BUILTIN_THEMES = ${JSON.stringify(Object.fromEntries(TERMINAL_THEMES.map((t) => [t.id, t.colors])))};

      const THEME_KINDS = ${JSON.stringify(Object.fromEntries(TERMINAL_THEMES.map((t) => [t.id, t.group])))};

      // Claude UI appearance → what ClaudeFrame.setAppearance applies (colors null = VS Code theme)
      function resolveClaudeAppearance(a) {
        a = a || DEFAULTS.claudeUi;
        let colors = null;
        const preset = BUILTIN_THEMES[a.themePreset];
        if (preset) {
          colors = {
            kind: THEME_KINDS[a.themePreset] === 'light' ? 'light' : 'dark',
            background: preset.background,
            foreground: preset.foreground,
            accent: preset.brightBlue || preset.blue,
            green: preset.green, red: preset.red, yellow: preset.yellow,
            blue: preset.blue, purple: preset.magenta, orange: preset.brightYellow,
          };
        } else if (a.themePreset === 'custom') {
          const c = a.customColors;
          colors = { kind: isLightColor(c.background) ? 'light' : 'dark', background: c.background, foreground: c.foreground, accent: c.accent };
        }
        return {
          zoom: a.fontSize / 14,
          fontFamily: a.fontFamily,
          lineHeight: a.lineHeight,
          rowGap: a.rowGap,
          columnMaxWidth: a.columnMaxWidth,
          colors,
        };
      }

      function isLightColor(hex) {
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        if (!m) return false;
        const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
        return 0.299 * r + 0.587 * g + 0.114 * b > 150;
      }

      function resolveTheme(s) {
        if (BUILTIN_THEMES[s.themePreset]) return BUILTIN_THEMES[s.themePreset];
        switch (s.themePreset) {
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
        if (window.ClaudeFrame && window.ClaudeFrame.setAppearance) {
          window.ClaudeFrame.setAppearance(resolveClaudeAppearance(s.claudeUi));
        }
        const theme = resolveTheme(s);
        applyChromeColors(s, theme);
        document.documentElement.style.setProperty('--term-bg', theme.background);
        for (const sess of sessions.values()) {
          if (!sess.term) continue;
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
        closeEl.title = 'Close tab';
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

      // Shows the tab in its pane group and makes that group the focused one;
      // onLayoutActive does the rest (host notice, title, focus).
      function activateTab(id) {
        if (!sessions.has(id)) return;
        layout.activate(id);
      }

      let focusOnSessionCreated = false;

      function onSessionCreated(id, title, restoring, kind, resume, backend) {
        if (kind === 'claude') {
          const isOmp = backend === 'omp';
          const host = document.createElement('div');
          host.className = 'term-pane claude';
          host.dataset.id = id;
          termHost.appendChild(host);
          // The uic chat app runs in its own iframe; its protocol messages are relayed
          // to the extension as { type: 'claudeUi' } (see claudeFrame.js).
          const claude = window.ClaudeFrame.create({
            id,
            resume,
            backend: isOmp ? 'omp' : 'claude',
            onMessage: (message) => vscode.postMessage({ type: 'claudeUi', id, message }),
          });
          host.appendChild(claude.el);
          const label = title || (isOmp ? 'OMP' : 'Claude Code');
          const tab = buildTabDom(id, label);
          sessions.set(id, {
            id, kind: 'claude', backend: isOmp ? 'omp' : 'claude', claude, host, tab, exited: false,
            defaultTitle: label, shownTitle: label, rawTitle: '',
          });
          // A restored tab is placed by onRestoreSessions with the rest.
          if (restoring) return;
          layout.addTab(id);
          if (focusOnSessionCreated) {
            focusOnSessionCreated = false;
            requestAnimationFrame(() => claude.focus());
          }
          return;
        }

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

        const sess = {
          id, kind: 'terminal', term: t, fit: f, host, tab, dataDisp: null, exited: false,
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
        // A restored tab is placed by onRestoreSessions after its screen is replayed.
        if (restoring) return;
        layout.addTab(id);
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
        if (sess.claude) {
          try { sess.claude.dispose(); } catch (_) {}
        } else {
          try { sess.term.dispose(); } catch (_) {}
        }
        sess.host.remove();
        sess.tab.remove();
        sessions.delete(id);
        pendingResize.delete(id);
        // The group shows its neighbouring tab; an emptied group closes. If no tab is left
        // at all, the extension spawns a replacement and we receive sessionCreated.
        layout.removeTab(id);
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
        if (!s.term) return;
        s.exited = true;
        s.term.writeln('\\r\\n\\x1b[2m[shell exited: ' + code + '] press any key to restart\\x1b[0m');
        const once = s.term.onData(() => {
          once.dispose();
          s.exited = false;
          try { s.term.reset(); } catch (_) {}
          vscode.postMessage({ type: 'restart', id });
        });
      }

      function onRestoreSessions(list, restoreActiveId, savedLayout) {
        const written = [];
        for (const snap of list) {
          if (sessions.has(snap.id)) continue;
          onSessionCreated(snap.id, snap.title, true, snap.kind, snap.resume, snap.backend);
          const s = sessions.get(snap.id);
          if (s.claude) {
            // The rebuilt iframe reopens the conversation from ~/.claude (snap.resume).
            if (snap.title) {
              s.defaultTitle = snap.title;
              s.rawTitle = snap.title;
              applySessionTitle(s);
            }
            continue;
          }
          // Replay at the size it was serialized at; activateTab fits and reflows
          // only once the replay is parsed, otherwise lines wrap at the wrong width.
          try { s.term.resize(snap.cols, snap.rows); } catch (_) {}
          replaying.add(snap.id);
          written.push(new Promise((resolve) => s.term.write(snap.serialized, resolve)).then(() => {
            if (snap.exited) markExited(s, snap.id, snap.exitCode);
          }));
          if (snap.rawTitle) {
            s.rawTitle = snap.rawTitle;
            applySessionTitle(s);
          }
        }
        // Groups and splits come back as they were; tabs it does not know join the focused group.
        layout.restore(savedLayout, Array.from(sessions.keys()));
        Promise.all(written).then(() => {
          replaying.clear();
          const ids = Array.from(sessions.keys());
          const target = restoreActiveId && sessions.has(restoreActiveId) ? restoreActiveId : ids[ids.length - 1];
          focusOnSessionCreated = false;
          if (target) layout.activate(target, false);
          // Fit every visible terminal now that its screen is parsed, then take focus.
          layout.relayout();
          focusActive();
        });
      }

      // "+" opens a launcher menu: a plain shell or one of the AI CLIs. Availability is
      // looked up by the extension each time the menu opens (PATH can change at any time).
      const agentMenu = document.getElementById('agent-menu');
      let agentList = [];

      const ICON_CLAUDE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/><path d="M5.5 6h5M5.5 8.2h3"/></svg>';
      const ICON_TERMINAL = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3.5 3.5L3 11.5"/><path d="M8.5 12h4.5"/></svg>';
      const AGENT_COLORS = { claude: '#d97757', opencode: '#8b8b8b', copilot: '#6e56cf', codex: '#10a37f', pi: '#c9a227' };
      function agentIconHtml(id, label) {
        const color = AGENT_COLORS[id] || 'currentColor';
        return '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="4" fill="' + color + '"/>' +
          '<text x="8" y="11.2" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="sans-serif">' +
          String(label || id).charAt(0).toUpperCase() + '</text></svg>';
      }

      function startSession(agent) {
        const sess = sessions.get(activeId);
        const cols = sess && sess.term ? sess.term.cols : 80;
        const rows = sess && sess.term ? sess.term.rows : 24;
        vscode.postMessage({ type: 'createSession', kind: 'terminal', cols, rows, agent });
      }

      function startOmpUI() {
        const sess = sessions.get(activeId);
        const cols = sess && sess.term ? sess.term.cols : 80;
        const rows = sess && sess.term ? sess.term.rows : 24;
        focusOnSessionCreated = true;
        vscode.postMessage({ type: 'createSession', kind: 'claude', backend: 'omp', cols, rows });
      }

      function startClaudeUI() {
        const sess = sessions.get(activeId);
        const cols = sess && sess.term ? sess.term.cols : 80;
        const rows = sess && sess.term ? sess.term.rows : 24;
        focusOnSessionCreated = true;
        vscode.postMessage({ type: 'createSession', kind: 'claude', cols, rows });
      }

      function closeAgentMenu(refocus) {
        if (agentMenu.hidden) return;
        agentMenu.hidden = true;
        if (!btnAddTab) return;
        btnAddTab.setAttribute('aria-expanded', 'false');
        if (refocus) { try { btnAddTab.focus(); } catch (_) {} }
      }

      function addMenuItem(parent, iconHtml, name, hint, disabled, onPick) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'agent-item';
        item.setAttribute('role', 'menuitem');
        item.disabled = !!disabled;
        const icon = document.createElement('span');
        icon.className = 'agent-icon';
        icon.innerHTML = iconHtml;
        const label = document.createElement('span');
        label.className = 'agent-name';
        label.textContent = name;
        item.appendChild(icon);
        item.appendChild(label);
        if (hint) {
          const hintEl = document.createElement('span');
          hintEl.className = 'agent-hint';
          hintEl.textContent = hint;
          item.appendChild(hintEl);
        }
        if (!disabled) {
          item.addEventListener('click', () => { closeAgentMenu(false); onPick(); });
        }
        parent.appendChild(item);
      }

      function renderAgentMenu() {
        agentMenu.textContent = '';
        addMenuItem(agentMenu, ICON_TERMINAL, 'Terminal', '', false, () => startSession());
        addMenuItem(agentMenu, ICON_CLAUDE, 'Claude UI', '', false, () => startClaudeUI());
        addMenuItem(agentMenu, ICON_CLAUDE, 'OMP UI', '', false, () => startOmpUI());
        if (agentList.length === 0) return;
        const sep = document.createElement('div');
        sep.className = 'agent-menu-sep';
        agentMenu.appendChild(sep);
        const heading = document.createElement('div');
        heading.className = 'agent-menu-label';
        heading.textContent = 'Start an agent';
        agentMenu.appendChild(heading);
        let shortcut = 0;
        agentList.forEach((agent) => {
          const hint = agent.installed ? String(++shortcut) : 'not installed';
          addMenuItem(agentMenu, agentIconHtml(agent.id, agent.label), agent.label, hint, !agent.installed, () => startSession(agent.id));
        });
      }

      function positionAgentMenu() {
        const rect = btnAddTab.getBoundingClientRect();
        const width = agentMenu.offsetWidth;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        agentMenu.style.left = left + 'px';
        agentMenu.style.top = (rect.bottom + 4) + 'px';
      }

      function toggleAgentMenu(btn) {
        const same = btn === btnAddTab;
        if (!agentMenu.hidden) {
          closeAgentMenu(false);
          if (same) return;
        }
        closeTabsMenu(false);
        btnAddTab = btn;
        renderAgentMenu();
        agentMenu.hidden = false;
        btnAddTab.setAttribute('aria-expanded', 'true');
        positionAgentMenu();
        const first = agentMenu.querySelector('.agent-item:not(:disabled)');
        if (first) first.focus();
        vscode.postMessage({ type: 'requestAgents' });
      }
      document.addEventListener('mousedown', (e) => {
        if (agentMenu.hidden) return;
        if (agentMenu.contains(e.target) || (btnAddTab && btnAddTab.contains(e.target))) return;
        closeAgentMenu(false);
      });
      window.addEventListener('blur', () => closeAgentMenu(false));
      agentMenu.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeAgentMenu(true); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = Array.from(agentMenu.querySelectorAll('.agent-item:not(:disabled)'));
          if (items.length === 0) return;
          const at = items.indexOf(document.activeElement);
          const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
          items[next].focus();
          return;
        }
        // Number keys start the matching installed agent, as the hints in the menu show.
        if (/^[1-9]$/.test(e.key)) {
          const installed = agentList.filter((agent) => agent.installed);
          const agent = installed[Number(e.key) - 1];
          if (agent) { e.preventDefault(); closeAgentMenu(false); startSession(agent.id); }
        }
      });

      // Narrow side bar: the tab row is replaced by one button (CSS) whose menu lists
      // the tabs. The tab elements stay the source of truth (order, title, state).
      // Each pane group has its own button (shown when that group is narrow).
      const tabsMenu = document.getElementById('tabs-menu');

      function menuTabsEl() {
        const g = layout.groups().find((x) => x.id === tabsMenuGroup);
        return g ? g.tabsEl : null;
      }

      let syncTabsRaf = 0;
      function syncTabsButton() {
        syncTabsRaf = 0;
        layout.groups().forEach((g) => {
          if (!g.tabsBtn || !g.tabsEl) return;
          const tabs = Array.from(g.tabsEl.children);
          const count = g.tabsBtn.querySelector('.tabs-count');
          if (count) count.textContent = tabs.length > 1 ? String(tabs.length) : '';
          g.tabsBtn.classList.toggle('has-done', tabs.some((t) => t.classList.contains('done')));
          const active = tabs.find((t) => t.classList.contains('active'));
          const title = active ? (active.querySelector('.tab-title') || active).textContent : '';
          g.tabsBtn.title = title ? 'Tabs: ' + title : 'Tabs';
        });
        if (!tabsMenu.hidden) {
          if (menuTabsEl()) renderTabsMenu();
          else closeTabsMenu(false);
        }
      }
      new MutationObserver(() => {
        if (!syncTabsRaf) syncTabsRaf = requestAnimationFrame(syncTabsButton);
      }).observe(layoutRoot, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'],
      });

      function closeTabsMenu(refocus) {
        if (tabsMenu.hidden) return;
        tabsMenu.hidden = true;
        if (!btnTabs) return;
        btnTabs.setAttribute('aria-expanded', 'false');
        if (refocus) { try { btnTabs.focus(); } catch (_) {} }
      }

      function renderTabsMenu() {
        const focusedId = document.activeElement && tabsMenu.contains(document.activeElement)
          ? document.activeElement.dataset.id : undefined;
        tabsMenu.textContent = '';
        const list = menuTabsEl();
        Array.from(list ? list.children : []).forEach((tab) => {
          const id = tab.dataset.id;
          const sess = sessions.get(id);
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'agent-item';
          item.dataset.id = id;
          item.setAttribute('role', 'menuitem');
          item.classList.toggle('active', tab.classList.contains('active'));
          item.classList.toggle('done', tab.classList.contains('done'));
          const icon = document.createElement('span');
          icon.className = 'agent-icon';
          icon.innerHTML = sess && sess.kind === 'claude' ? ICON_CLAUDE : ICON_TERMINAL;
          const label = document.createElement('span');
          label.className = 'agent-name';
          label.textContent = (tab.querySelector('.tab-title') || tab).textContent;
          label.title = tab.title || label.textContent;
          const close = document.createElement('span');
          close.className = 'tab-menu-close';
          close.title = 'Close tab';
          close.textContent = '\u00D7';
          close.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'closeSession', id });
          });
          item.appendChild(icon);
          item.appendChild(label);
          item.appendChild(close);
          item.addEventListener('click', () => { closeTabsMenu(false); activateTab(id); });
          tabsMenu.appendChild(item);
        });
        if (focusedId) {
          const again = tabsMenu.querySelector('.agent-item[data-id="' + CSS.escape(focusedId) + '"]');
          if (again) again.focus();
        }
        if (!tabsMenu.hidden) positionTabsMenu();
      }

      function positionTabsMenu() {
        const rect = btnTabs.getBoundingClientRect();
        const width = tabsMenu.offsetWidth;
        tabsMenu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
        tabsMenu.style.top = (rect.bottom + 4) + 'px';
      }

      function toggleTabsMenu(gid, btn) {
        const same = btn === btnTabs;
        if (!tabsMenu.hidden) {
          closeTabsMenu(false);
          if (same) return;
        }
        closeAgentMenu(false);
        btnTabs = btn;
        tabsMenuGroup = gid;
        tabsMenu.hidden = false;
        btnTabs.setAttribute('aria-expanded', 'true');
        renderTabsMenu();
        const current = tabsMenu.querySelector('.agent-item.active') || tabsMenu.querySelector('.agent-item');
        if (current) current.focus();
      }
      document.addEventListener('mousedown', (e) => {
        if (tabsMenu.hidden) return;
        if (tabsMenu.contains(e.target) || (btnTabs && btnTabs.contains(e.target))) return;
        closeTabsMenu(false);
      });
      window.addEventListener('blur', () => closeTabsMenu(false));
      // Widened past the breakpoint: the button is gone, so is its menu
      window.addEventListener('resize', () => { if (!btnTabs || !btnTabs.offsetParent) closeTabsMenu(false); });
      tabsMenu.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeTabsMenu(true); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = Array.from(tabsMenu.querySelectorAll('.agent-item'));
          if (items.length === 0) return;
          const at = items.indexOf(document.activeElement);
          const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
          items[next].focus();
        }
      });
      syncTabsButton();

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
        // Upward message from a Claude UI iframe: { __claudeUi: tabId, message }.
        if (e.data && typeof e.data.__claudeUi === 'string') {
          const s = sessions.get(e.data.__claudeUi);
          if (s && s.claude && s.claude.owns(e.source)) s.claude.receive(e.data.message);
          return;
        }
        const msg = e.data;
        if (!msg) return;
        if (msg.type === 'sessionCreated') {
          onSessionCreated(msg.id, msg.title, false, msg.kind, undefined, msg.backend);
        } else if (msg.type === 'agentAvailability') {
          agentList = msg.agents || [];
          // The menu may already be open (it opens first, availability arrives async).
          if (!agentMenu.hidden) {
            const hadFocus = agentMenu.contains(document.activeElement);
            renderAgentMenu();
            positionAgentMenu();
            if (hadFocus) {
              const first = agentMenu.querySelector('.agent-item:not(:disabled)');
              if (first) first.focus();
            }
          }
        } else if (msg.type === 'pendingFiles') {
          onPendingFiles(msg.html || '', msg.count || 0);
        } else if (msg.type === 'restoreSessions') {
          onRestoreSessions(msg.sessions || [], msg.activeId, msg.layout);
        } else if (msg.type === 'sessionClosed') {
          onSessionClosed(msg.id);
        } else if (msg.type === 'data') {
          const s = sessions.get(msg.id);
          if (s && s.term) s.term.write(msg.data);
        } else if (msg.type === 'claudeUi') {
          // Protocol message for one Claude UI tab, or for all of them when id is unset.
          sessions.forEach((s) => {
            if (s.claude && (!msg.id || msg.id === s.id)) s.claude.post(msg.payload);
          });
        } else if (msg.type === 'activateSession') {
          activateTab(msg.id);
        } else if (msg.type === 'sessionTitleChanged') {
          const s = sessions.get(msg.id);
          if (!s) return;
          s.rawTitle = msg.title || '';
          if (msg.title) s.defaultTitle = msg.title;
          applySessionTitle(s);
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
            requestAnimationFrame(() => {
              if (sess.claude) { sess.claude.focus(); return; }
              try { sess.term.focus(); } catch (_) {}
            });
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
        btnViewDiff.classList.add('preview-open');
        setButtonLabel(btnViewDiff, 'Back to terminal');
        btnViewDiff.title = 'Back to terminal';
        btnViewDiff.setAttribute('aria-label', 'Back to terminal');
      }

      function closeDiffPreview() {
        diffPreviewOverlay.hidden = true;
        window.aiCliDiffPreview?.close();
        btnViewDiff.classList.remove('preview-open');
        setButtonLabel(btnViewDiff, 'View diff');
        btnViewDiff.title = 'Preview all pending changes';
        btnViewDiff.setAttribute('aria-label', 'Preview all pending changes');
      }

      function openFilePreview(filePath) {
        if (!diffPreviewOverlay.hidden) closeDiffPreview();
        filePreviewOverlay.hidden = false;
        window.aiCliFilePreview?.open(filePath);
        btnViewDiff.classList.add('preview-open');
        setButtonLabel(btnViewDiff, 'Back to terminal');
        btnViewDiff.title = 'Back to terminal';
      }

      function closeFilePreview() {
        filePreviewOverlay.hidden = true;
        window.aiCliFilePreview?.close();
        btnViewDiff.classList.remove('preview-open');
        setButtonLabel(btnViewDiff, 'View diff');
        btnViewDiff.title = 'Preview all pending changes';
      }

      document.addEventListener('ai-cli-preview-close-request', () => {
        if (!filePreviewOverlay.hidden) closeFilePreview();
      });

      function closeActivePreview() {
        if (!diffPreviewOverlay.hidden) closeDiffPreview();
        if (!filePreviewOverlay.hidden) closeFilePreview();
      }

      document.getElementById('btn-diff-back').addEventListener('click', () => closeDiffPreview());
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
          if (sess) requestAnimationFrame(() => {
            if (sess.claude) { sess.claude.focus(); return; }
            try { sess.term.focus(); } catch (_) {}
          });
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
      const btnPendingAcceptAll = document.getElementById('btn-pending-accept-all');
      btnPendingAcceptAll.addEventListener('click', () => vscode.postMessage({ type: 'acceptAllChanges' }));
      function onPendingFiles(html, count) {
        pendingOverlay.classList.toggle('no-pending', count === 0);
        btnPendingAcceptAll.disabled = count === 0;
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
      const fPreventAltMenuFocus = document.getElementById('f-prevent-alt-menu-focus');
      const fRevealInExplorer = document.getElementById('f-reveal-in-explorer');
      const fRespectGitignore = document.getElementById('f-respect-gitignore');
      const fBurstEnabled = document.getElementById('f-burst-enabled');
      const fBurstWindow = document.getElementById('f-burst-window');
      const fBurstThreshold = document.getElementById('f-burst-threshold');
      const fBurstHold = document.getElementById('f-burst-hold');
      const fMaxFileLines = document.getElementById('f-max-file-lines');
      const fMaxAutoOpen = document.getElementById('f-max-auto-open');
      const customRows = document.querySelectorAll('.custom-only');
      const fClaudeFontSize = document.getElementById('f-claude-font-size');
      const fClaudeLineHeight = document.getElementById('f-claude-line-height');
      const fClaudeRowGap = document.getElementById('f-claude-row-gap');
      const fClaudeColumnMax = document.getElementById('f-claude-column-max');
      const fClaudeFontFamily = document.getElementById('f-claude-font-family');
      const fClaudePreset = document.getElementById('f-claude-preset');
      const fClaudeBg = document.getElementById('f-claude-bg');
      const fClaudeFg = document.getElementById('f-claude-fg');
      const fClaudeAccent = document.getElementById('f-claude-accent');
      const fClaudeBgHex = document.getElementById('f-claude-bg-hex');
      const fClaudeFgHex = document.getElementById('f-claude-fg-hex');
      const fClaudeAccentHex = document.getElementById('f-claude-accent-hex');
      const claudeCustomRows = document.querySelectorAll('.claude-custom-only');

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
        fPreventAltMenuFocus.checked = s.preventAltMenuFocus;
        fRevealInExplorer.checked = s.revealInExplorer;
        listEditors.includedPaths.set(s.includedPaths);
        listEditors.excludedPaths.set(s.excludedPaths);
        fRespectGitignore.checked = s.respectGitignore;
        fBurstEnabled.checked = s.burstDetectionEnabled;
        fBurstWindow.value = String(s.burstDetectionWindowMs);
        fBurstThreshold.value = String(s.burstDetectionThreshold);
        fBurstHold.value = String(s.burstDetectionHoldMs);
        fMaxFileLines.value = String(s.maxFileLines);
        fMaxAutoOpen.value = String(s.maxAutoOpenDiffs);
        const c = s.claudeUi || DEFAULTS.claudeUi;
        fClaudeFontSize.value = String(c.fontSize);
        fClaudeLineHeight.value = String(c.lineHeight);
        fClaudeRowGap.value = String(c.rowGap);
        fClaudeColumnMax.value = String(c.columnMaxWidth);
        fClaudeFontFamily.value = c.fontFamily;
        if (fClaudeFontFamily.value !== c.fontFamily) {
          // Stored font not in the list (an older list, or edited by hand): keep it selectable
          const extra = document.createElement('option');
          extra.value = c.fontFamily;
          extra.textContent = 'Custom: ' + (c.fontFamily.split(',')[0] || c.fontFamily).replace(/"/g, '').trim();
          fClaudeFontFamily.appendChild(extra);
          fClaudeFontFamily.value = c.fontFamily;
        }
        fClaudePreset.value = c.themePreset;
        fClaudeBg.value = c.customColors.background;
        fClaudeFg.value = c.customColors.foreground;
        fClaudeAccent.value = c.customColors.accent;
        fClaudeBgHex.textContent = c.customColors.background;
        fClaudeFgHex.textContent = c.customColors.foreground;
        fClaudeAccentHex.textContent = c.customColors.accent;
        toggleCustomRows();
      }

      function toggleCustomRows() {
        const show = fPreset.value === 'custom';
        customRows.forEach((el) => { el.style.display = show ? '' : 'none'; });
        const showClaude = fClaudePreset.value === 'custom';
        claudeCustomRows.forEach((el) => { el.style.display = showClaude ? '' : 'none'; });
      }

      function clampInt(input, limits, fallback, allowZero) {
        const v = parseInt(input.value, 10);
        if (!isFinite(v)) return fallback;
        if (allowZero && v === 0) return 0;
        return Math.min(limits.max, Math.max(limits.min, v));
      }

      function readClaudeForm() {
        const d = DEFAULTS.claudeUi;
        return {
          fontSize: clampInt(fClaudeFontSize, CLAUDE_LIMITS.fontSize, d.fontSize),
          lineHeight: clampInt(fClaudeLineHeight, CLAUDE_LIMITS.lineHeight, d.lineHeight),
          rowGap: clampInt(fClaudeRowGap, CLAUDE_LIMITS.rowGap, d.rowGap),
          columnMaxWidth: clampInt(fClaudeColumnMax, CLAUDE_LIMITS.columnMaxWidth, d.columnMaxWidth, true),
          fontFamily: fClaudeFontFamily.value,
          themePreset: fClaudePreset.value,
          customColors: {
            background: fClaudeBg.value,
            foreground: fClaudeFg.value,
            accent: fClaudeAccent.value,
          },
        };
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
          preventAltMenuFocus: !!fPreventAltMenuFocus.checked,
          revealInExplorer: !!fRevealInExplorer.checked,
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
          claudeUi: readClaudeForm(),
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
      fClaudePreset.addEventListener('change', toggleCustomRows);
      fClaudeBg.addEventListener('input', () => { fClaudeBgHex.textContent = fClaudeBg.value; });
      fClaudeFg.addEventListener('input', () => { fClaudeFgHex.textContent = fClaudeFg.value; });
      fClaudeAccent.addEventListener('input', () => { fClaudeAccentHex.textContent = fClaudeAccent.value; });

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
