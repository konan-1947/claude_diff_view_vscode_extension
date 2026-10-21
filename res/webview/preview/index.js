(function () {
  'use strict';

  const vscode = window.__AI_CLI_VSCODE_API__ || (
    window.__AI_CLI_VSCODE_API__ = acquireVsCodeApi()
  );
  const title = document.getElementById('file-preview-path');
  const editorHost = document.getElementById('file-preview-editor');
  const renderHost = document.getElementById('file-preview-render');
  const modeBar = document.getElementById('file-preview-modes');
  const saveHint = document.getElementById('file-preview-hint');
  const besideButton = document.getElementById('file-preview-beside');
  const modeButtons = modeBar.querySelectorAll('button[data-mode]');

  let activePath;
  let data;
  let mode = 'source';
  let activeRenderer;
  let token = 0;

  function renderers() {
    return window.aiCliPreviewRenderers || {};
  }

  function hasSource(file) {
    return file.kind === 'code' || typeof file.content === 'string';
  }

  function hasPreview(file) {
    return file.kind !== 'code';
  }

  function setMode(next) {
    mode = next;
    modeButtons.forEach((button) => {
      const on = button.dataset.mode === next;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
    });
    editorHost.hidden = next !== 'source';
    renderHost.hidden = next !== 'preview';
    saveHint.hidden = next !== 'source';
  }

  function disposeRenderer() {
    if (activeRenderer) activeRenderer.dispose();
    activeRenderer = undefined;
    renderHost.textContent = '';
  }

  function showSource(file, focus) {
    setMode('source');
    return window.aiCliPreviewCode.show(file, { focus }).catch((error) => {
      title.textContent = error.message;
    });
  }

  function showPreview(file) {
    setMode('preview');
    disposeRenderer();
    const renderer = renderers()[file.kind];
    if (!renderer) {
      renderHost.textContent = 'No preview available for this file';
      return Promise.resolve();
    }
    activeRenderer = renderer;
    const current = token;
    renderHost.scrollTop = 0;
    return Promise.resolve(renderer.render(renderHost, file)).catch((error) => {
      if (current !== token) return;
      renderHost.textContent = '';
      const box = document.createElement('div');
      box.className = 'preview-error';
      box.textContent = error && error.message ? error.message : String(error);
      renderHost.appendChild(box);
    });
  }

  function open(path) {
    token += 1;
    activePath = path;
    data = undefined;
    title.textContent = 'Loading…';
    vscode.postMessage({ type: 'requestFilePreview', path });
  }

  function close() {
    token += 1;
    activePath = undefined;
    data = undefined;
    disposeRenderer();
    window.aiCliPreviewCode.clear();
    vscode.postMessage({ type: 'closeFilePreview' });
  }

  function setFile(file) {
    if (!file || file.path !== activePath) return;
    token += 1;
    data = file;
    title.textContent = file.label;
    modeBar.hidden = !(hasSource(file) && hasPreview(file));
    // Kinds rendered here by a basic viewer: the user's own editor extension may do better.
    besideButton.hidden = !hasPreview(file);
    if (hasPreview(file)) {
      showPreview(file);
    } else {
      showSource(file, true);
    }
  }

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!data || button.dataset.mode === mode) return;
      token += 1;
      if (button.dataset.mode === 'source') {
        disposeRenderer();
        showSource(data, true);
      } else {
        // Edits made in Source must show up in the rendered view.
        const edited = window.aiCliPreviewCode.getValue();
        if (typeof edited === 'string') data = Object.assign({}, data, { content: edited });
        showPreview(data);
      }
    });
  });

  besideButton.addEventListener('click', () => {
    if (!activePath) return;
    vscode.postMessage({ type: 'filePreviewOpenBeside', path: activePath });
    // Close the overlay so the terminal is visible next to the new editor.
    document.dispatchEvent(new CustomEvent('ai-cli-preview-close-request'));
  });

  // VS Code swaps the body's theme class on a theme change; redraw an open
  // rendered preview so diagrams pick up the new colours.
  const themeClass = () => Array.from(document.body.classList).filter((c) => c.startsWith('vscode-')).sort().join(' ');
  let lastThemeClass = themeClass();
  new MutationObserver(() => {
    const next = themeClass();
    if (next === lastThemeClass) return;
    lastThemeClass = next;
    if (!data || mode !== 'preview' || !hasPreview(data)) return;
    token += 1;
    showPreview(data);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.aiCliFilePreview = { open, close };
  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'filePreviewData') setFile(msg);
    if (msg.type === 'filePreviewError') {
      modeBar.hidden = true;
      besideButton.hidden = true;
      disposeRenderer();
      title.textContent = msg.message || 'Could not open file';
    }
  });
}());
