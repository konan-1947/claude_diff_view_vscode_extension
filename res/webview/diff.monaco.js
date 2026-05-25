/* global require, acquireVsCodeApi, monaco */
(function () {
  'use strict';

  const vscodeApi = acquireVsCodeApi();
  const monacoBase = window.__MONACO_BASE__;

  require.config({ paths: { vs: monacoBase } });
  // VS Code webview CSP requires monaco workers via a blob shim.
  window.MonacoEnvironment = {
    getWorkerUrl: function () {
      const workerScript = `
        self.MonacoEnvironment = { baseUrl: '${monacoBase}' };
        importScripts('${monacoBase}/base/worker/workerMain.js');
      `;
      const blob = new Blob([workerScript], { type: 'text/javascript' });
      return URL.createObjectURL(blob);
    },
  };

  require(['vs/editor/editor.main'], function () {
    const state = {
      diffEditor: null,
      filePath: null,
      originalModel: null,
      modifiedModel: null,
      originalContent: '',
      currentContent: '',
      lineChanges: [],
      viewZoneIds: [],
      didAutoReveal: false,
      currentTheme: 'vs-dark',
      inFlight: false,
    };

    function setInFlight(value) {
      state.inFlight = value;
      document.querySelectorAll('.hunk-btn').forEach((b) => { b.disabled = value; });
      const acceptAllBtn = document.getElementById('btn-accept-all');
      const rejectAllBtn = document.getElementById('btn-reject-all');
      if (acceptAllBtn) { acceptAllBtn.disabled = value; }
      if (rejectAllBtn) { rejectAllBtn.disabled = value; }
    }

    const container = document.getElementById('container');
    state.diffEditor = monaco.editor.createDiffEditor(container, {
      renderSideBySide: false,
      readOnly: false,
      originalEditable: false,
      automaticLayout: true,
      ignoreTrimWhitespace: false,
      renderOverviewRuler: true,
      glyphMargin: false,
      scrollBeyondLastLine: false,
      renderMarginRevertIcon: false,
      diffAlgorithm: 'advanced',
    });

    const modifiedEditor = state.diffEditor.getModifiedEditor();

    state.diffEditor.onDidUpdateDiff(() => refreshHunks());

    let suppressEditEvent = false;
    let editDebounce = null;
    modifiedEditor.onDidChangeModelContent(() => {
      if (suppressEditEvent) { return; }
      const value = state.modifiedModel ? state.modifiedModel.getValue() : '';
      state.currentContent = value;
      if (editDebounce) { clearTimeout(editDebounce); }
      editDebounce = setTimeout(() => {
        editDebounce = null;
        vscodeApi.postMessage({ type: 'editModified', newCurrent: value });
      }, 200);
    });

    registerActions();

    document.getElementById('btn-accept-all').addEventListener('click', () => {
      if (state.inFlight) { return; }
      setInFlight(true);
      vscodeApi.postMessage({ type: 'acceptAll' });
    });
    document.getElementById('btn-reject-all').addEventListener('click', () => {
      if (state.inFlight) { return; }
      setInFlight(true);
      vscodeApi.postMessage({ type: 'rejectAll' });
    });
    document.getElementById('btn-next-file').addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'nextFile' });
    });
    document.getElementById('btn-prev-file').addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'prevFile' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) { return; }
      switch (msg.type) {
        case 'set': applySet(msg); return;
        case 'theme-change': applyTheme(msg.theme); return;
        case 'config-change': applyConfig(msg.editorConfig); return;
      }
    });

    vscodeApi.postMessage({ type: 'ready' });

    function applySet(msg) {
      const isSameFile = state.filePath === msg.filePath;
      state.filePath = msg.filePath;
      state.originalContent = msg.originalContent;
      state.currentContent = msg.currentContent;

      document.getElementById('toolbar-file').textContent = msg.filePath;
      applyNav(msg.nav);

      if (msg.theme && msg.theme !== state.currentTheme) {
        applyTheme(msg.theme);
      }
      if (msg.editorConfig) {
        applyConfig(msg.editorConfig);
      }

      // Reuse models when content matches (cheap path for diff refresh after hunk accept).
      const newOriginal = msg.originalContent;
      const newCurrent = msg.currentContent;

      if (
        isSameFile &&
        state.originalModel &&
        state.modifiedModel &&
        state.originalModel.getValue() === newOriginal &&
        state.modifiedModel.getValue() === newCurrent
      ) {
        // No content change; nothing to do.
        return;
      }

      suppressEditEvent = true;
      try {
        if (isSameFile && state.originalModel && state.modifiedModel) {
          // In-place update: preserves cursor + scroll.
          if (state.originalModel.getValue() !== newOriginal) {
            state.originalModel.setValue(newOriginal);
          }
          if (state.modifiedModel.getValue() !== newCurrent) {
            state.modifiedModel.setValue(newCurrent);
          }
        } else {
          // Switching file or first load: dispose + recreate models.
          if (state.originalModel) { state.originalModel.dispose(); }
          if (state.modifiedModel) { state.modifiedModel.dispose(); }
          state.originalModel = monaco.editor.createModel(newOriginal, msg.language);
          state.modifiedModel = monaco.editor.createModel(newCurrent, msg.language);
          state.diffEditor.setModel({
            original: state.originalModel,
            modified: state.modifiedModel,
          });
          state.didAutoReveal = false;
        }
      } finally {
        suppressEditEvent = false;
      }

      setInFlight(false);
    }

    function applyNav(nav) {
      if (!nav) { return; }
      const counter = document.getElementById('file-counter');
      const prev = document.getElementById('btn-prev-file');
      const next = document.getElementById('btn-next-file');
      counter.textContent = `${nav.currentIdx} / ${nav.total}`;
      const multi = nav.total > 1;
      prev.disabled = !multi;
      next.disabled = !multi;
    }

    function applyTheme(theme) {
      state.currentTheme = theme;
      monaco.editor.setTheme(theme);
    }

    function applyConfig(cfg) {
      if (!cfg) { return; }
      const options = {
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        lineHeight: cfg.lineHeight || undefined,
        tabSize: cfg.tabSize,
        insertSpaces: cfg.insertSpaces,
        wordWrap: cfg.wordWrap,
        renderWhitespace: cfg.renderWhitespace,
        minimap: { enabled: cfg.minimapEnabled },
      };
      state.diffEditor.updateOptions(options);
      modifiedEditor.updateOptions(options);
      state.diffEditor.getOriginalEditor().updateOptions(options);
    }

    function refreshHunks() {
      // getLineChanges() có thể trả null khi diff chưa tính xong.
      let attempts = 0;
      const tryGet = () => {
        const changes = state.diffEditor.getLineChanges();
        if (changes === null && attempts < 10) {
          attempts++;
          setTimeout(tryGet, 50);
          return;
        }
        state.lineChanges = changes || [];
        renderViewZones();
        maybeAutoReveal();
      };
      tryGet();
    }

    function renderViewZones() {
      modifiedEditor.changeViewZones((accessor) => {
        for (const id of state.viewZoneIds) {
          accessor.removeZone(id);
        }
        state.viewZoneIds = [];

        state.lineChanges.forEach((change, idx) => {
          const dom = makeHunkBar(change, idx);
          const afterLineNumber = hunkAfterLineNumber(change);
          const id = accessor.addZone({
            afterLineNumber,
            heightInLines: 1.4,
            domNode: dom,
            suppressMouseDown: true,
          });
          state.viewZoneIds.push(id);
        });
      });
    }

    function maybeAutoReveal() {
      if (state.didAutoReveal || state.lineChanges.length === 0) { return; }
      state.didAutoReveal = true;
      const first = state.lineChanges[0];
      const line = first.modifiedStartLineNumber || 1;
      modifiedEditor.revealLineInCenter(line);
      modifiedEditor.setPosition({ lineNumber: line, column: 1 });
    }

    /**
     * Anchor line for ViewZone (1-indexed afterLineNumber means zone appears
     * AFTER that line). For pure deletions (modifiedEnd===0), anchor on the
     * insertion point line. For additions/modifications, anchor on the LAST
     * line of the modified hunk so the bar sits right under the change.
     */
    function hunkAfterLineNumber(change) {
      if (change.modifiedEndLineNumber === 0 || change.modifiedEndLineNumber < change.modifiedStartLineNumber) {
        return Math.max(0, change.modifiedStartLineNumber - 1);
      }
      return change.modifiedEndLineNumber;
    }

    function makeHunkBar(change, idx) {
      const node = document.createElement('div');
      node.className = 'hunk-bar';
      node.style.pointerEvents = 'auto';

      const label = document.createElement('span');
      label.className = 'hunk-label';
      label.textContent = `Hunk ${idx + 1}`;
      node.appendChild(label);

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'hunk-btn accept';
      acceptBtn.textContent = 'Accept';
      acceptBtn.title = 'Accept this hunk (Ctrl+Y)';
      acceptBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      acceptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        acceptHunk(change);
      });

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'hunk-btn reject';
      rejectBtn.textContent = 'Reject';
      rejectBtn.title = 'Reject this hunk (Ctrl+N)';
      rejectBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      rejectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rejectHunk(change);
      });

      node.appendChild(acceptBtn);
      node.appendChild(rejectBtn);
      return node;
    }

    function acceptHunk(change) {
      if (state.inFlight) { return; }
      const { newOriginal, newCurrent } = applyAccept(change);
      setInFlight(true);
      vscodeApi.postMessage({ type: 'acceptHunk', newOriginal, newCurrent });
    }

    function rejectHunk(change) {
      if (state.inFlight) { return; }
      const { newOriginal, newCurrent } = applyReject(change);
      setInFlight(true);
      vscodeApi.postMessage({ type: 'rejectHunk', newOriginal, newCurrent });
    }

    function registerActions() {
      modifiedEditor.addAction({
        id: 'ai-cli-diff.acceptCurrentHunk',
        label: 'AI CLI Diff: Accept Current Hunk',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY],
        run: () => {
          const h = findHunkAtCursor();
          if (h) { acceptHunk(h); }
        },
      });
      modifiedEditor.addAction({
        id: 'ai-cli-diff.rejectCurrentHunk',
        label: 'AI CLI Diff: Reject Current Hunk',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN],
        run: () => {
          const h = findHunkAtCursor();
          if (h) { rejectHunk(h); }
        },
      });
      modifiedEditor.addAction({
        id: 'ai-cli-diff.nextHunk',
        label: 'AI CLI Diff: Next Hunk',
        keybindings: [monaco.KeyCode.F7],
        run: () => gotoHunk(+1),
      });
      modifiedEditor.addAction({
        id: 'ai-cli-diff.prevHunk',
        label: 'AI CLI Diff: Previous Hunk',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F7],
        run: () => gotoHunk(-1),
      });
      modifiedEditor.addAction({
        id: 'ai-cli-diff.nextFile',
        label: 'AI CLI Diff: Next File',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyL],
        run: () => vscodeApi.postMessage({ type: 'nextFile' }),
      });
      modifiedEditor.addAction({
        id: 'ai-cli-diff.prevFile',
        label: 'AI CLI Diff: Previous File',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyH],
        run: () => vscodeApi.postMessage({ type: 'prevFile' }),
      });
    }

    function findHunkAtCursor() {
      const pos = modifiedEditor.getPosition();
      if (!pos) { return null; }
      const line = pos.lineNumber;
      // Prefer hunk that contains cursor; else nearest.
      let contained = null;
      let nearest = null;
      let nearestDist = Infinity;
      for (const c of state.lineChanges) {
        const start = c.modifiedStartLineNumber;
        const end = c.modifiedEndLineNumber === 0 ? start : c.modifiedEndLineNumber;
        if (line >= start && line <= end) {
          contained = c;
          break;
        }
        const dist = Math.min(Math.abs(line - start), Math.abs(line - end));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = c;
        }
      }
      return contained || nearest;
    }

    function gotoHunk(direction) {
      if (state.lineChanges.length === 0) { return; }
      const pos = modifiedEditor.getPosition();
      const line = pos ? pos.lineNumber : 1;
      const sorted = state.lineChanges.slice().sort(
        (a, b) => a.modifiedStartLineNumber - b.modifiedStartLineNumber
      );
      let target = null;
      if (direction > 0) {
        target = sorted.find(c => c.modifiedStartLineNumber > line) || sorted[0];
      } else {
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].modifiedStartLineNumber < line) {
            target = sorted[i];
            break;
          }
        }
        target = target || sorted[sorted.length - 1];
      }
      if (target) {
        const targetLine = target.modifiedStartLineNumber || 1;
        modifiedEditor.revealLineInCenter(targetLine);
        modifiedEditor.setPosition({ lineNumber: targetLine, column: 1 });
      }
    }

    /**
     * Accept hunk: bake modified slice INTO the original.
     */
    function applyAccept(change) {
      const modifiedSlice = extractSlice(
        state.currentContent,
        change.modifiedStartLineNumber,
        change.modifiedEndLineNumber
      );
      const newOriginal = replaceSlice(
        state.originalContent,
        change.originalStartLineNumber,
        change.originalEndLineNumber,
        modifiedSlice
      );
      return { newOriginal, newCurrent: state.currentContent };
    }

    /**
     * Reject hunk: roll modified slice back to original slice.
     */
    function applyReject(change) {
      const originalSlice = extractSlice(
        state.originalContent,
        change.originalStartLineNumber,
        change.originalEndLineNumber
      );
      const newCurrent = replaceSlice(
        state.currentContent,
        change.modifiedStartLineNumber,
        change.modifiedEndLineNumber,
        originalSlice
      );
      return { newOriginal: state.originalContent, newCurrent };
    }

    function extractSlice(text, startLine, endLine) {
      if (endLine === 0 || endLine < startLine) { return []; }
      const lines = text.split('\n');
      return lines.slice(startLine - 1, endLine);
    }

    function replaceSlice(text, startLine, endLine, newLines) {
      const lines = text.split('\n');
      if (endLine === 0 || endLine < startLine) {
        lines.splice(startLine, 0, ...newLines);
      } else {
        lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
      }
      return lines.join('\n');
    }
  });
})();
