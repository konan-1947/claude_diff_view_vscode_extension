(function () {
  'use strict';

  const vscode = window.__AI_CLI_VSCODE_API__ || (
    window.__AI_CLI_VSCODE_API__ = acquireVsCodeApi()
  );
  const host = document.getElementById('file-preview-editor');
  let editor;
  let model;
  let activePath;
  let applying = false;
  let saveTimer;

  function loadMonaco() {
    if (window.monaco && window.monaco.editor) return Promise.resolve(window.monaco);
    if (window.__aiCliFileMonaco) return window.__aiCliFileMonaco;
    window.__aiCliFileMonaco = new Promise((resolve, reject) => {
      const base = window.__AI_CLI_MONACO_BASE__;
      const script = document.createElement('script');
      script.src = base + '/loader.js';
      script.onload = () => {
        window.require.config({ paths: { vs: base } });
        window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
      };
      script.onerror = () => reject(new Error('Could not load Monaco editor'));
      document.head.appendChild(script);
    });
    return window.__aiCliFileMonaco;
  }

  // Resolves once the file is in the editor; rejects if Monaco cannot load.
  function show(data, options) {
    activePath = data.path;
    return loadMonaco().then((monaco) => {
      if (data.path !== activePath) return;
      applying = true;
      if (model) model.dispose();
      model = monaco.editor.createModel(data.content, data.language || 'plaintext');
      if (!editor) {
        editor = monaco.editor.create(host, {
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
        });
        editor.addAction({
          id: 'ai-cli-file-preview-save',
          label: 'Save file',
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
          run: () => vscode.postMessage({ type: 'filePreviewSave', path: activePath }),
        });
        editor.onDidChangeModelContent(() => {
          if (applying || !activePath) return;
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            vscode.postMessage({ type: 'filePreviewEdit', path: activePath, content: model.getValue() });
          }, 180);
        });
      }
      editor.setModel(model);
      applying = false;
      if (!options || options.focus !== false) editor.focus();
    });
  }

  function getValue() {
    return model ? model.getValue() : undefined;
  }

  function focus() {
    if (editor) editor.focus();
  }

  function clear() {
    clearTimeout(saveTimer);
    activePath = undefined;
  }

  window.aiCliPreviewCode = { show, getValue, focus, clear };
}());
