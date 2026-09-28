/* global acquireVsCodeApi */
(function () {
  'use strict';

  const vscode = window.__AI_CLI_VSCODE_API__ || (
    window.__AI_CLI_VSCODE_API__ = acquireVsCodeApi()
  );
  const overlay = document.getElementById('diff-preview-overlay');
  const fileList = document.getElementById('diff-preview-file-list');
  const content = document.getElementById('diff-preview-content');
  const status = document.getElementById('diff-preview-status');
  const summary = document.getElementById('diff-preview-summary');
  const collapseAll = document.getElementById('btn-diff-collapse-all');
  const expandAll = document.getElementById('btn-diff-expand-all');

  const files = new Map();
  let observer = null;
  let monacoPromise = null;
  let pendingTargetPath = null;
  let activePath = null;

  function setStatus(text, error) {
    if (!status) { return; }
    status.textContent = text;
    status.classList.toggle('aggregate-file-error', !!error);
    status.hidden = !text;
  }

  function open(targetPath) {
    ensureObserver();
    pendingTargetPath = targetPath || null;
    setStatus('Loading pending changes…', false);
    vscode.postMessage({ type: 'requestDiffPreview' });
  }

  function close() {
    vscode.postMessage({ type: 'closeDiffPreview' });
    activePath = null;
    disposeAll();
  }

  window.aiCliDiffPreview = { open, close };

  function ensureMonaco() {
    if (window.monaco) { return Promise.resolve(window.monaco); }
    if (monacoPromise) { return monacoPromise; }

    monacoPromise = new Promise((resolve, reject) => {
      const monacoBase = window.__AI_CLI_MONACO_BASE__;
      if (!monacoBase) {
        reject(new Error('Monaco base URI is missing'));
        return;
      }

      const finish = () => {
        try {
          window.require.config({ paths: { vs: monacoBase } });
          window.MonacoEnvironment = {
            getWorkerUrl: function () {
              const blob = new Blob(['self.onmessage=function(){};'], { type: 'text/javascript' });
              return URL.createObjectURL(blob);
            },
          };
          window.require(['vs/editor/editor.main'], () => resolve(window.monaco));
        } catch (err) {
          reject(err);
        }
      };

      if (window.require && window.require.config) {
        finish();
        return;
      }
      const loader = document.createElement('script');
      loader.src = monacoBase + '/loader.js';
      loader.onload = finish;
      loader.onerror = () => reject(new Error('Monaco loader failed to load'));
      document.head.appendChild(loader);
    });
    return monacoPromise;
  }

  function renderFileList(metadata) {
    const incoming = new Set(metadata.map((item) => item.path));
    for (const [filePath, state] of files) {
      if (!incoming.has(filePath)) {
        disposeState(state);
        files.delete(filePath);
      }
    }

    fileList.replaceChildren();
    for (const item of metadata) {
      let state = files.get(item.path);
      if (!state) {
        state = createState(item);
        files.set(item.path, state);
        content.appendChild(state.section);
        observer.observe(state.section);
      } else {
        state.meta = item;
      }
      fileList.appendChild(createFileLink(state));
    }

    updateSummary();
    if (metadata.length === 0) {
      setStatus('No pending changes.', false);
      return;
    }
    setStatus('', false);
    // Warm the first two sections so the preview is useful immediately while
    // the observer handles the remaining files lazily.
    metadata.slice(0, 2).forEach((item) => requestFile(item.path));
    // A hunk/file action can change the data without changing the file list.
    // Refresh only sections that were already loaded; untouched distant files
    // remain lazy.
    metadata.forEach((item) => {
      const state = files.get(item.path);
      if (state?.data) { requestFile(item.path); }
    });
    if (pendingTargetPath) {
      const target = files.get(pendingTargetPath);
      if (target) {
        target.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(target);
        requestFile(pendingTargetPath);
      }
      pendingTargetPath = null;
    }
  }

  function createState(meta) {
    const section = document.createElement('section');
    section.className = 'aggregate-file-section';
    section.dataset.path = meta.path;

    const head = document.createElement('div');
    head.className = 'aggregate-file-head';

    const toggle = document.createElement('button');
    toggle.className = 'aggregate-file-toggle';
    toggle.type = 'button';
    toggle.title = 'Collapse file';
    toggle.textContent = '⌄';
    toggle.addEventListener('click', () => toggleCollapsed(files.get(meta.path)));

    const pathEl = document.createElement('span');
    pathEl.className = 'aggregate-file-path';
    pathEl.textContent = meta.label;

    const stats = document.createElement('span');
    stats.className = 'aggregate-file-stats';

    const actions = document.createElement('span');
    actions.className = 'aggregate-file-actions';
    actions.appendChild(actionButton('Accept file', 'accept', () => {
      const state = files.get(meta.path);
      if (!state || state.busy) { return; }
      state.busy = true;
      vscode.postMessage({ type: 'previewAcceptFile', path: meta.path });
    }));
    actions.appendChild(actionButton('Reject file', 'reject', () => {
      const state = files.get(meta.path);
      if (!state || state.busy) { return; }
      state.busy = true;
      vscode.postMessage({ type: 'previewRejectFile', path: meta.path });
    }));

    head.append(toggle, pathEl, stats, actions);

    const body = document.createElement('div');
    body.className = 'aggregate-file-body';
    const hunkActions = document.createElement('div');
    hunkActions.className = 'aggregate-hunk-actions';
    const editorHost = document.createElement('div');
    editorHost.className = 'aggregate-editor';
    const loading = document.createElement('div');
    loading.className = 'aggregate-file-loading';
    loading.textContent = 'Loading diff…';
    body.append(hunkActions, loading, editorHost);

    section.append(head, body);
    return {
      meta,
      section,
      toggle,
      stats,
      hunkActions,
      editorHost,
      loading,
      editor: null,
      originalModel: null,
      modifiedModel: null,
      modifiedListener: null,
      data: null,
      groups: [],
      collapsed: false,
      requested: false,
      busy: false,
      suppressEdit: false,
      editTimer: null,
      nearViewport: false,
      lastUsed: 0,
      mounting: false,
    };
  }

  function createFileLink(state) {
    const link = document.createElement('button');
    link.className = 'diff-preview-file-link';
    link.type = 'button';
    link.dataset.path = state.meta.path;
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = state.meta.label;
    const stats = document.createElement('span');
    stats.className = 'file-stats';
    stats.innerHTML = statsText(state);
    link.append(name, stats);
    link.addEventListener('click', () => {
      state.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      requestFile(state.meta.path);
      setActive(state);
    });
    return link;
  }

  function actionButton(text, kind, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = kind;
    button.textContent = text;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      handler();
    });
    return button;
  }

  function statsText(state) {
    if (!state.data) { return '…'; }
    const added = state.data.hunks.reduce((n, h) => n + h.addedLines.length, 0);
    const removed = state.data.hunks.reduce((n, h) => n + h.removedLines.length, 0);
    return '<span class="diff-add">+' + added + '</span> <span class="diff-delete">-' + removed + '</span>';
  }

  function updateSummary() {
    let loaded = 0;
    let added = 0;
    let removed = 0;
    for (const state of files.values()) {
      if (!state.data) { continue; }
      loaded++;
      for (const hunk of state.data.hunks) {
        added += hunk.addedLines.length;
        removed += hunk.removedLines.length;
      }
    }
    const suffix = loaded < files.size ? ' · loading ' + (files.size - loaded) : '';
    summary.textContent = files.size + ' files · +' + added + ' -' + removed + suffix;
  }

  function requestFile(filePath) {
    const state = files.get(filePath);
    if (!state || state.requested) { return; }
    state.requested = true;
    vscode.postMessage({ type: 'requestDiffPreviewFile', path: filePath });
  }

  function applyFileData(filePath, data, theme) {
    const state = files.get(filePath);
    if (!state) { return; }
    state.requested = false;
    if (!data) {
      state.busy = false;
      state.loading.hidden = false;
      state.loading.className = 'aggregate-file-error';
      state.loading.textContent = 'No pending changes for this file.';
      state.hunkActions.replaceChildren();
      return;
    }
    state.data = data;
    state.busy = false;
    state.loading.hidden = true;
    state.groups = buildGroups(data.hunks);
    state.stats.innerHTML = statsText(state);
    const link = fileList.querySelector('[data-path="' + cssEscape(filePath) + '"] .file-stats');
    if (link) { link.innerHTML = statsText(state); }
    updateSummary();
    renderHunkActions(state);
    ensureMonaco().then((monaco) => {
      if (!files.has(filePath)) { return; }
      if (theme) { monaco.editor.setTheme(theme); }
      mountEditor(monaco, state);
    }).catch((err) => {
      state.loading.hidden = false;
      state.loading.className = 'aggregate-file-error';
      state.loading.textContent = 'Could not load Monaco diff: ' + err.message;
    });
  }

  function mountEditor(monaco, state) {
    if (state.mounting) { return; }
    state.mounting = true;
    const data = state.data;
    state.lastUsed = Date.now();
    state.suppressEdit = true;
    try {
      if (!state.editor) {
        state.originalModel = monaco.editor.createModel(
          data.originalContent,
          data.language,
          monaco.Uri.parse('inmemory://ai-cli-diff/original/' + encodeURIComponent(data.filePath))
        );
        state.modifiedModel = monaco.editor.createModel(
          data.currentContent,
          data.language,
          monaco.Uri.parse('inmemory://ai-cli-diff/modified/' + encodeURIComponent(data.filePath))
        );
        state.editor = monaco.editor.createDiffEditor(state.editorHost, {
          automaticLayout: false,
          readOnly: false,
          originalEditable: false,
          renderSideBySide: false,
          scrollBeyondLastLine: false,
          renderOverviewRuler: true,
          minimap: { enabled: false },
          hideUnchangedRegions: {
            enabled: true,
            contextLineCount: 3,
            minimumLineCount: 7,
            revealLineCount: 3,
          },
        });
        state.editor.setModel({ original: state.originalModel, modified: state.modifiedModel });
        state.modifiedListener = state.modifiedModel.onDidChangeContent(() => {
          if (state.suppressEdit || !state.data) { return; }
          state.data.currentContent = state.modifiedModel.getValue();
          if (state.editTimer) { clearTimeout(state.editTimer); }
          state.editTimer = setTimeout(() => {
            state.editTimer = null;
            vscode.postMessage({
              type: 'previewEditModified',
              path: state.data.filePath,
              newCurrent: state.data.currentContent,
            });
          }, 200);
        });
        state.editor.getModifiedEditor().addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => vscode.postMessage({ type: 'previewSaveFile', path: data.filePath })
        );
      } else {
        if (state.originalModel.getValue() !== data.originalContent) {
          state.originalModel.setValue(data.originalContent);
        }
        if (state.modifiedModel.getValue() !== data.currentContent) {
          state.modifiedModel.setValue(data.currentContent);
        }
      }
    } finally {
      state.suppressEdit = false;
      state.mounting = false;
    }
    requestAnimationFrame(() => {
      try { state.editor.layout(); } catch (_) { /* section may be closing */ }
    });
  }

  function renderHunkActions(state) {
    state.hunkActions.replaceChildren();
    if (!state.groups.length) {
      state.hunkActions.hidden = true;
      return;
    }
    state.hunkActions.hidden = false;
    const label = document.createElement('span');
    label.className = 'aggregate-hunk-label';
    label.textContent = 'Hunks';
    state.hunkActions.appendChild(label);
    state.groups.forEach((group, index) => {
      state.hunkActions.appendChild(actionButton('Accept ' + (index + 1), 'accept', () => {
        if (state.busy || !state.data) { return; }
        state.selectedGroup = group;
        const patch = applyAccept(state);
        state.busy = true;
        vscode.postMessage({ type: 'previewAcceptHunk', path: state.data.filePath, ...patch });
      }));
      state.hunkActions.appendChild(actionButton('Reject ' + (index + 1), 'reject', () => {
        if (state.busy || !state.data) { return; }
        state.selectedGroup = group;
        const patch = applyReject(state);
        state.busy = true;
        vscode.postMessage({ type: 'previewRejectHunk', path: state.data.filePath, ...patch });
      }));
    });
  }

  function buildGroups(hunks) {
    const groups = [];
    let current = null;
    for (const hunk of hunks) {
      const sameBlock = current
        && current.groupId === hunk.groupId
        && !(hunk.removedLines.length > 0 && current.addedTexts.length > 0);
      if (!sameBlock) {
        current = {
          groupId: hunk.groupId,
          originalStart: hunk.originalStart,
          modifiedStart: hunk.modifiedStart,
          removedTexts: hunk.removedLines.map((line) => line.text),
          addedTexts: hunk.addedLines.map((line) => line.text),
        };
        groups.push(current);
      } else {
        for (const line of hunk.removedLines) { current.removedTexts.push(line.text); }
        for (const line of hunk.addedLines) { current.addedTexts.push(line.text); }
      }
    }
    for (const group of groups) {
      group.removedCount = group.removedTexts.length;
      group.addedCount = group.addedTexts.length;
    }
    return groups;
  }

  function applyAccept(state) {
    const originalLines = state.data.originalContent.split('\n');
    const group = state.groups[0];
    // The aggregate UI sends one group at a time; the active group is selected
    // by the button handler below through a temporary field.
    const selected = state.selectedGroup || group;
    return {
      newOriginal: originalLines
        .slice(0, selected.originalStart)
        .concat(selected.addedTexts, originalLines.slice(selected.originalStart + selected.removedCount))
        .join('\n'),
      newCurrent: state.data.currentContent,
    };
  }

  function applyReject(state) {
    const currentLines = state.data.currentContent.split('\n');
    const group = state.selectedGroup || state.groups[0];
    return {
      newOriginal: state.data.originalContent,
      newCurrent: currentLines
        .slice(0, group.modifiedStart)
        .concat(group.removedTexts, currentLines.slice(group.modifiedStart + group.addedCount))
        .join('\n'),
    };
  }

  function toggleCollapsed(state) {
    if (!state) { return; }
    state.collapsed = !state.collapsed;
    state.section.classList.toggle('is-collapsed', state.collapsed);
    state.toggle.textContent = state.collapsed ? '›' : '⌄';
    state.toggle.title = state.collapsed ? 'Expand file' : 'Collapse file';
    requestAnimationFrame(() => {
      try { state.editor?.layout(); } catch (_) { /* ignore */ }
    });
  }

  function setCollapsed(state, collapsed) {
    if (!state || state.collapsed === collapsed) { return; }
    toggleCollapsed(state);
  }

  function setActive(state) {
    if (activePath !== state.meta.path) {
      activePath = state.meta.path;
      vscode.postMessage({ type: 'previewActiveFile', path: activePath });
    }
    for (const candidate of files.values()) {
      candidate.section.classList.toggle('is-active', candidate === state);
    }
  }

  function disposeState(state) {
    if (state.editTimer) { clearTimeout(state.editTimer); }
    disposeEditor(state);
    state.section.remove();
  }

  function disposeEditor(state) {
    state.modifiedListener?.dispose();
    state.modifiedListener = null;
    state.editor?.dispose();
    state.editor = null;
    state.originalModel?.dispose();
    state.originalModel = null;
    state.modifiedModel?.dispose();
    state.modifiedModel = null;
    state.editorHost.replaceChildren();
  }

  function disposeAll() {
    observer?.disconnect();
    observer = null;
    for (const state of files.values()) { disposeState(state); }
    files.clear();
    fileList.replaceChildren();
    content.replaceChildren(status);
    setStatus('', false);
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) { return CSS.escape(value); }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function ensureObserver() {
    if (observer) { return; }
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const state = files.get(entry.target.dataset.path);
        if (!state) { continue; }
        state.nearViewport = entry.isIntersecting;
        if (entry.isIntersecting) {
          requestFile(entry.target.dataset.path);
          setActive(state);
          if (state.data && !state.editor) {
            ensureMonaco().then((monaco) => mountEditor(monaco, state));
          }
        }
      }
      const live = Array.from(files.values()).filter((state) => state.editor);
      if (live.length > 4) {
        live
          .filter((state) => !state.nearViewport)
          .sort((a, b) => a.lastUsed - b.lastUsed)
          .slice(0, live.length - 4)
          .forEach(disposeEditor);
      }
    }, { root: content, rootMargin: '800px 0px' });
  }

  ensureObserver();

  collapseAll?.addEventListener('click', () => {
    for (const state of files.values()) { setCollapsed(state, true); }
  });
  expandAll?.addEventListener('click', () => {
    for (const state of files.values()) { setCollapsed(state, false); }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) { return; }
    if (msg.type === 'diffPreviewFiles') {
      renderFileList(msg.files || []);
    } else if (msg.type === 'diffPreviewFile') {
      applyFileData(msg.path, msg.file, msg.theme);
    } else if (msg.type === 'diffPreviewTheme') {
      if (window.monaco) { window.monaco.editor.setTheme(msg.theme); }
    } else if (msg.type === 'diffPreviewError') {
      const state = files.get(msg.path);
      if (state) {
        state.loading.hidden = false;
        state.loading.className = 'aggregate-file-error';
        state.loading.textContent = msg.message || 'Diff operation failed.';
        state.busy = false;
      }
    }
  });
})();
