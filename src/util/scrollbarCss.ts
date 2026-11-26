/** Shared by every webview the extension builds; uic (webview-ui/claude/src/styles/claude-theme.css) and diff.monaco.css keep their own copy. */
export const SCROLLBAR_CSS = `
/* Thin rounded scrollbars in place of the 10px square default (webview) or the
   native one (iframe): the thumb is inset 2px in an 8px track and widens on hover. */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-button { display: none; }
::-webkit-scrollbar-thumb {
  background-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
  background-clip: padding-box;
  border: 2px solid transparent;
  border-radius: 8px;
}
::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7));
  border-width: 1px;
}
::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground, rgba(191, 191, 191, 0.4));
  border-width: 1px;
}
/* Monaco's own scrollbars (size set to 8 in the editor options): same rounded, inset thumb */
.monaco-scrollable-element > .scrollbar > .slider {
  box-sizing: border-box;
  border: 2px solid transparent;
  border-radius: 8px;
  background-clip: padding-box !important;
}
.monaco-scrollable-element > .scrollbar > .slider:hover,
.monaco-scrollable-element > .scrollbar > .slider.active { border-width: 1px; }
`;
