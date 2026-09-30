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
  const toggleAll = document.getElementById('btn-diff-toggle-all');

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

    if (fileList) { fileList.replaceChildren(); }
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
      if (fileList) { fileList.appendChild(createFileLink(state)); }
    }

    updateSummary();
    updateToggleAllLabel();
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
    setToggleIcon(toggle, false);
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
      decorationIds: [],
      viewZoneIds: [],
      groupWidgets: [],
      hoveredGroupIdx: -1,
      editorDisposables: [],
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
    const link = fileList?.querySelector('[data-path="' + cssEscape(filePath) + '"] .file-stats');
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
    const isNewEditor = !state.editor;
    const data = state.data;
    state.lastUsed = Date.now();
    state.suppressEdit = true;
    try {
      if (!state.editor) {
        state.modifiedModel = monaco.editor.createModel(
          data.currentContent,
          data.language,
          monaco.Uri.parse('inmemory://ai-cli-diff/modified/' + encodeURIComponent(data.filePath))
        );
        // Use the same line decorations and removal view zones as the main
        // custom diff. Monaco's DiffEditor worker is unreliable in VS Code
        // webviews, while the extension has already computed these hunks.
        state.editor = monaco.editor.create(state.editorHost, {
          automaticLayout: true,
          readOnly: false,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          wordWrap: 'off',
        });
        state.editor.setModel(state.modifiedModel);
        // Monaco owns wheel events inside each file card. Hand off only the
        // overscroll at its top/bottom to the aggregate preview so a long
        // review can continue naturally into the next file.
        const wheelHandoff = (event) => {
          if (!content || !event.deltaY) { return; }
          const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? content.clientHeight
              : 1;
          const delta = event.deltaY * unit;
          const scrollTop = state.editor.getScrollTop();
          const maxScrollTop = Math.max(0, state.editor.getScrollHeight() - state.editor.getLayoutInfo().height);
          const atTop = scrollTop <= 1;
          const atBottom = scrollTop >= maxScrollTop - 1;
          if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
            event.preventDefault();
            event.stopPropagation();
            content.scrollBy({ top: delta, behavior: 'auto' });
          }
        };
        state.editorHost.addEventListener('wheel', wheelHandoff, { capture: true, passive: false });
        state.editorDisposables.push({
          dispose: () => state.editorHost.removeEventListener('wheel', wheelHandoff, { capture: true }),
        });
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
        state.editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => vscode.postMessage({ type: 'previewSaveFile', path: data.filePath })
        );
        state.editorDisposables.push(
          state.editor.onMouseMove((event) => {
            // Moving from a line into an overlay widget has no Monaco line
            // position. Treating that as "no hunk" hides the bar before its
            // Accept/Reject buttons can be clicked.
            if (!event.target.position) { return; }
            setHoveredGroup(state, findGroupAtLine(state, event.target.position.lineNumber));
          }),
          state.editor.onDidChangeCursorPosition((event) => {
            setHoveredGroup(state, findGroupAtLine(state, event.position.lineNumber));
          }),
          state.editor.onDidScrollChange(() => repositionHoveredGroup(state)),
          state.editor.onDidLayoutChange(() => repositionHoveredGroup(state))
        );
      } else {
        if (state.modifiedModel.getValue() !== data.currentContent) {
          state.modifiedModel.setValue(data.currentContent);
        }
      }
      renderDiffDecorations(monaco, state);
      renderGroupWidgets(state);
    } finally {
      state.suppressEdit = false;
      state.mounting = false;
    }
    requestAnimationFrame(() => {
      try {
        state.editor.layout();
        if (isNewEditor && data.hunks.length) {
          state.editor.revealLineInCenter(data.hunks[0].modifiedStart + 1);
        }
      } catch (_) { /* section may be closing */ }
    });
  }

  function renderDiffDecorations(monaco, state) {
    const decorations = [];
    for (const hunk of state.data.hunks) {
      for (const added of hunk.addedLines) {
        const line = added.modifiedLineIndex + 1;
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'aggregate-diff-added-line',
            linesDecorationsClassName: 'aggregate-diff-added-gutter',
          },
        });
      }
    }
    state.decorationIds = state.editor.deltaDecorations(state.decorationIds, decorations);
    state.editor.changeViewZones((accessor) => {
      for (const id of state.viewZoneIds) { accessor.removeZone(id); }
      state.viewZoneIds = [];
      const fontInfo = state.editor.getOption(monaco.editor.EditorOption.fontInfo);
      for (const hunk of state.data.hunks) {
        if (!hunk.removedLines.length) { continue; }
        const dom = document.createElement('div');
        dom.className = 'aggregate-diff-removed-zone';
        dom.style.lineHeight = fontInfo.lineHeight + 'px';
        dom.style.fontSize = fontInfo.fontSize + 'px';
        dom.style.fontFamily = fontInfo.fontFamily;
        for (const removed of hunk.removedLines) {
          const line = document.createElement('div');
          line.className = 'aggregate-diff-removed-line';
          line.textContent = removed.text;
          dom.appendChild(line);
        }
        state.viewZoneIds.push(accessor.addZone({
          afterLineNumber: Math.max(0, hunk.modifiedStart),
          heightInLines: hunk.removedLines.length,
          domNode: dom,
        }));
      }
    });
  }

  function renderHunkActions(state) {
    state.hunkActions.replaceChildren();
    state.hunkActions.hidden = true;
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
      group.startLine = Math.max(1, group.modifiedStart + 1);
      group.endLine = group.addedCount > 0
        ? group.modifiedStart + group.addedCount
        : group.startLine;
    }
    return groups;
  }

  function findGroupAtLine(state, line) {
    if (!line) { return -1; }
    return state.groups.findIndex((group) => line >= group.startLine && line <= group.endLine);
  }

  function renderGroupWidgets(state) {
    for (const widget of state.groupWidgets) { state.editor.removeOverlayWidget(widget); }
    state.groupWidgets = [];
    state.hoveredGroupIdx = -1;
    state.groups.forEach((group, index) => {
      const dom = document.createElement('div');
      dom.className = 'aggregate-hunk-bar';
      const accept = document.createElement('button');
      accept.className = 'accept';
      accept.textContent = 'Accept';
      accept.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.busy || !state.data) { return; }
        state.selectedGroup = group;
        state.busy = true;
        vscode.postMessage({ type: 'previewAcceptHunk', path: state.data.filePath, ...applyAccept(state) });
      });
      const reject = document.createElement('button');
      reject.className = 'reject';
      reject.textContent = 'Reject';
      reject.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.busy || !state.data) { return; }
        state.selectedGroup = group;
        state.busy = true;
        vscode.postMessage({ type: 'previewRejectHunk', path: state.data.filePath, ...applyReject(state) });
      });
      dom.append(accept, reject);
      const widget = {
        group,
        dom,
        getId: () => 'ai-cli-diff.aggregateHunkBar.' + index,
        getDomNode: () => dom,
        getPosition: () => null,
      };
      state.editor.addOverlayWidget(widget);
      state.groupWidgets.push(widget);
    });
  }

  function setHoveredGroup(state, index) {
    if (index === state.hoveredGroupIdx) { return; }
    const previous = state.groupWidgets[state.hoveredGroupIdx];
    previous?.dom.classList.remove('visible');
    state.hoveredGroupIdx = index;
    const next = state.groupWidgets[index];
    if (!next) { return; }
    next.dom.classList.add('visible');
    repositionHoveredGroup(state);
  }

  function repositionHoveredGroup(state) {
    const widget = state.groupWidgets[state.hoveredGroupIdx];
    if (!widget || !state.editor) { return; }
    const layout = state.editor.getLayoutInfo();
    widget.dom.style.top = (state.editor.getBottomForLineNumber(widget.group.endLine) - state.editor.getScrollTop()) + 'px';
    widget.dom.style.right = ((layout.verticalScrollbarWidth || 0) + 8) + 'px';
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
    setToggleIcon(state.toggle, state.collapsed);
    state.toggle.title = state.collapsed ? 'Expand file' : 'Collapse file';
    updateToggleAllLabel();
    requestAnimationFrame(() => {
      try { state.editor?.layout(); } catch (_) { /* ignore */ }
    });
  }

  function setToggleIcon(button, collapsed) {
    const path = collapsed ? 'M8 4l6 6-6 6' : 'M4 7l6 6 6-6';
    button.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"></path></svg>';
  }

  function setCollapsed(state, collapsed) {
    if (!state || state.collapsed === collapsed) { return; }
    toggleCollapsed(state);
  }

  function updateToggleAllLabel() {
    if (!toggleAll) { return; }
    const allCollapsed = files.size > 0 && Array.from(files.values()).every((state) => state.collapsed);
    toggleAll.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
    toggleAll.title = toggleAll.textContent;
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
    for (const disposable of state.editorDisposables) { disposable.dispose(); }
    state.editorDisposables = [];
    for (const widget of state.groupWidgets) { state.editor?.removeOverlayWidget(widget); }
    state.groupWidgets = [];
    state.editor?.dispose();
    state.editor = null;
    state.originalModel?.dispose();
    state.originalModel = null;
    state.modifiedModel?.dispose();
    state.modifiedModel = null;
    state.decorationIds = [];
    state.viewZoneIds = [];
    state.editorHost.replaceChildren();
  }

  function disposeAll() {
    observer?.disconnect();
    observer = null;
    for (const state of files.values()) { disposeState(state); }
    files.clear();
    if (fileList) { fileList.replaceChildren(); }
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

  toggleAll?.addEventListener('click', () => {
    const allCollapsed = files.size > 0 && Array.from(files.values()).every((state) => state.collapsed);
    for (const state of files.values()) { setCollapsed(state, !allCollapsed); }
    updateToggleAllLabel();
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
