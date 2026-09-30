(function () {
  'use strict';

  const vscode = window.__AI_CLI_VSCODE_API__ || (
    window.__AI_CLI_VSCODE_API__ = acquireVsCodeApi()
  );
  const host = document.getElementById('file-preview-editor');
  const title = document.getElementById('file-preview-path');
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

  function open(path) {
    activePath = path;
    title.textContent = 'Loading…';
    vscode.postMessage({ type: 'requestFilePreview', path });
  }

  function close() {
    clearTimeout(saveTimer);
    activePath = undefined;
    vscode.postMessage({ type: 'closeFilePreview' });
  }

  function setFile(data) {
    if (!data || data.path !== activePath) return;
    title.textContent = data.label;
    loadMonaco().then((monaco) => {
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
      editor.focus();
    }).catch((error) => { title.textContent = error.message; });
  }

  window.aiCliFilePreview = { open, close };
  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'filePreviewData') setFile(msg);
    if (msg.type === 'filePreviewError') title.textContent = msg.message || 'Could not open file';
  });
}());
