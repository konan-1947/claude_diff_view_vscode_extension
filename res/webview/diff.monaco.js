/* global require, acquireVsCodeApi, monaco */
(function () {
  'use strict';

  const T0 = performance.now();
  const tlog = (label) => {
    const ms = (performance.now() - T0).toFixed(0);
    console.log('[ai-cli-diff TIMING] +' + ms + 'ms ' + label);
  };
  tlog('script start');

  const vscodeApi = acquireVsCodeApi();
  const monacoBase = window.__MONACO_BASE__;

  require.config({ paths: { vs: monacoBase } });

  // No diff worker needed: we use a regular editor and apply decorations from
  // hunks computed by the extension. Provide a no-op worker URL so Monaco's
  // tokenizer worker requests don't error out loudly.
  window.MonacoEnvironment = {
    getWorkerUrl: function () {
      const blob = new Blob(['self.onmessage=function(){};'], { type: 'text/javascript' });
      return URL.createObjectURL(blob);
    },
  };

  tlog('require(editor.main) called');
  require(['vs/editor/editor.main'], function () {
    tlog('editor.main loaded');

    if (monaco.languages.typescript) {
      const diagOff = {
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: true,
      };
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagOff);
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagOff);
    }
    if (monaco.languages.css) {
      const cssOff = { validate: false };
      monaco.languages.css.cssDefaults.setOptions(cssOff);
      monaco.languages.css.scssDefaults.setOptions(cssOff);
      monaco.languages.css.lessDefaults.setOptions(cssOff);
    }
    if (monaco.languages.json) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false });
    }

    const state = {
      editor: null,
      model: null,
      filePath: null,
      originalContent: '',
      currentContent: '',
      hunks: [],
      hunkWidgets: [],
      decorationIds: [],
      viewZoneIds: [],
      hoveredHunkIdx: -1,
      didAutoReveal: false,
      currentTheme: 'vs-dark',
      inFlight: false,
    };

    function setInFlight(value) {
      state.inFlight = value;
      document.querySelectorAll('.hunk-btn').forEach((b) => { b.disabled = value; });
      const acceptBtn = document.getElementById('btn-accept-file');
      const rejectBtn = document.getElementById('btn-reject-file');
      if (acceptBtn) { acceptBtn.disabled = value; }
      if (rejectBtn) { rejectBtn.disabled = value; }
    }

    function currentHunkIdx() {
      if (state.hoveredHunkIdx >= 0 && state.hoveredHunkIdx < state.hunks.length) {
        return state.hoveredHunkIdx;
      }
      const pos = state.editor && state.editor.getPosition();
      if (pos) {
        const idx = findHunkIdxAtLine(pos.lineNumber);
        if (idx !== -1) { return idx; }
      }
      return state.hunks.length > 0 ? 0 : -1;
    }

    function updateHunkCounter() {
      const el = document.getElementById('hunk-counter');
      if (!el) { return; }
      const total = state.hunks.length;
      if (total === 0) {
        el.textContent = '0 / 0';
      } else {
        const idx = currentHunkIdx();
        el.textContent = ((idx >= 0 ? idx + 1 : 1) + ' / ' + total);
      }
      const prev = document.getElementById('btn-prev-hunk');
      const next = document.getElementById('btn-next-hunk');
      const acc = document.getElementById('btn-accept-file');
      const rej = document.getElementById('btn-reject-file');
      const has = total > 0;
      if (prev) { prev.disabled = !has || total < 2; }
      if (next) { next.disabled = !has || total < 2; }
      if (acc) { acc.disabled = !has || state.inFlight; }
      if (rej) { rej.disabled = !has || state.inFlight; }
    }

    const container = document.getElementById('container');
    tlog('before createEditor');
    state.editor = monaco.editor.create(container, {
      readOnly: false,
      automaticLayout: true,
      glyphMargin: false,
      scrollBeyondLastLine: false,
      renderOverviewRuler: true,
      minimap: { enabled: true },
    });
    tlog('createEditor done');

    let suppressEditEvent = false;
    let editDebounce = null;
    state.editor.onDidChangeModelContent(() => {
      if (suppressEditEvent) { return; }
      const value = state.model ? state.model.getValue() : '';
      state.currentContent = value;
      if (editDebounce) { clearTimeout(editDebounce); }
      editDebounce = setTimeout(() => {
        editDebounce = null;
        vscodeApi.postMessage({ type: 'editModified', newCurrent: value });
      }, 200);
    });

    let cursorDebounce = null;
    state.editor.onDidChangeCursorPosition((e) => {
      if (cursorDebounce) { clearTimeout(cursorDebounce); }
      cursorDebounce = setTimeout(() => {
        cursorDebounce = null;
        vscodeApi.postMessage({
          type: 'cursor',
          line: e.position.lineNumber,
          column: e.position.column,
        });
      }, 150);
    });

    state.editor.onDidScrollChange(() => repositionAllBars());
    state.editor.onDidLayoutChange(() => repositionAllBars());
    state.editor.onMouseMove((e) => {
      const line = e.target && e.target.position && e.target.position.lineNumber;
      if (!line) { return; }
      const idx = findHunkIdxAtLine(line);
      if (idx !== -1) { setHoveredHunk(idx); }
    });
    state.editor.onMouseLeave(() => { updateHoveredHunkFromCursor(); });
    state.editor.onDidChangeCursorPosition(() => { updateHoveredHunkFromCursor(); });

    registerActions();

    document.getElementById('btn-accept-file').addEventListener('click', () => {
      if (state.inFlight) { return; }
      setInFlight(true);
      vscodeApi.postMessage({ type: 'acceptAll' });
    });
    document.getElementById('btn-reject-file').addEventListener('click', () => {
      if (state.inFlight) { return; }
      setInFlight(true);
      vscodeApi.postMessage({ type: 'rejectAll' });
    });
    document.getElementById('btn-prev-hunk').addEventListener('click', () => {
      gotoHunk(-1);
    });
    document.getElementById('btn-next-hunk').addEventListener('click', () => {
      gotoHunk(+1);
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

    tlog('post ready to extension');
    vscodeApi.postMessage({ type: 'ready' });

    function applySet(msg) {
      tlog('applySet received hunks=' + (msg.hunks ? msg.hunks.length : 0));
      const isSameFile = state.filePath === msg.filePath;
      state.filePath = msg.filePath;
      state.originalContent = msg.originalContent || '';
      state.currentContent = msg.currentContent || '';
      state.hunks = msg.hunks || [];

      document.getElementById('toolbar-file').textContent = msg.filePath;
      applyNav(msg.nav);

      if (msg.theme && msg.theme !== state.currentTheme) {
        applyTheme(msg.theme);
      }
      if (msg.editorConfig) {
        applyConfig(msg.editorConfig);
      }

      suppressEditEvent = true;
      try {
        if (!state.model || (!isSameFile)) {
          if (state.model) { state.model.dispose(); }
          state.model = monaco.editor.createModel(state.currentContent, msg.language);
          state.editor.setModel(state.model);
          state.didAutoReveal = false;
        } else if (state.model.getValue() !== state.currentContent) {
          state.model.setValue(state.currentContent);
        }
      } finally {
        suppressEditEvent = false;
      }

      renderDiffDecorations();
      renderHunkWidgets();
      maybeAutoReveal();
      updateHunkCounter();
      tlog('applySet render done');
      setInFlight(false);
    }

    function applyNav(nav) {
      if (!nav) { return; }
      const counter = document.getElementById('file-counter');
      const prev = document.getElementById('btn-prev-file');
      const next = document.getElementById('btn-next-file');
      counter.textContent = nav.currentIdx + ' / ' + nav.total;
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
      state.editor.updateOptions({
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        lineHeight: cfg.lineHeight || undefined,
        tabSize: cfg.tabSize,
        insertSpaces: cfg.insertSpaces,
        wordWrap: cfg.wordWrap,
        renderWhitespace: cfg.renderWhitespace,
        minimap: { enabled: cfg.minimapEnabled },
      });
    }

    /**
     * Apply green-line decorations on lines that were added (modifiedLineIndex).
     * Insert view zones above the hunk anchor for removed lines (red).
     */
    function renderDiffDecorations() {
      const decorations = [];
      for (const hunk of state.hunks) {
        for (const added of hunk.addedLines) {
          const line = added.modifiedLineIndex + 1;
          decorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: 'diff-added-line',
              linesDecorationsClassName: 'diff-added-gutter',
              overviewRuler: {
                color: 'rgba(46, 160, 67, 0.7)',
                position: monaco.editor.OverviewRulerLane.Center,
              },
            },
          });
        }
      }
      state.decorationIds = state.editor.deltaDecorations(state.decorationIds, decorations);

      state.editor.changeViewZones((accessor) => {
        for (const id of state.viewZoneIds) { accessor.removeZone(id); }
        state.viewZoneIds = [];
        for (const hunk of state.hunks) {
          if (hunk.removedLines.length === 0) { continue; }
          const dom = document.createElement('div');
          dom.className = 'diff-removed-zone';
          for (const removed of hunk.removedLines) {
            const lineEl = document.createElement('div');
            lineEl.className = 'diff-removed-line';
            lineEl.textContent = removed.text;
            dom.appendChild(lineEl);
          }
          // afterLineNumber 0 = above line 1; N = below line N. We want zone
          // to appear immediately before the first added line (or at modifiedStart
          // for pure deletions).
          const after = Math.max(0, hunk.modifiedStart);
          const id = accessor.addZone({
            afterLineNumber: after,
            heightInLines: hunk.removedLines.length,
            domNode: dom,
          });
          state.viewZoneIds.push(id);
        }
      });
    }

    function renderHunkWidgets() {
      for (const w of state.hunkWidgets) {
        state.editor.removeOverlayWidget(w);
      }
      state.hunkWidgets = [];
      state.hoveredHunkIdx = -1;

      state.hunks.forEach((hunk, idx) => {
        const dom = makeHunkBar(hunk, idx);
        const widget = {
          _idx: idx,
          _hunk: hunk,
          _dom: dom,
          getId: () => 'ai-cli-diff.hunkBar.' + idx,
          getDomNode: () => dom,
          getPosition: () => null,
        };
        state.editor.addOverlayWidget(widget);
        state.hunkWidgets.push(widget);
      });
      repositionAllBars();
      updateHoveredHunkFromCursor();
    }

    function repositionAllBars() {
      const scrollTop = state.editor.getScrollTop();
      const layout = state.editor.getLayoutInfo();
      const minimapW = (layout && layout.minimap && layout.minimap.minimapWidth) || 0;
      const scrollbarW = (layout && layout.verticalScrollbarWidth) || 0;
      const rightPx = minimapW + scrollbarW + 8;
      for (const w of state.hunkWidgets) {
        const lastLine = hunkLastLine(w._hunk);
        const top = state.editor.getBottomForLineNumber(lastLine) - scrollTop;
        w._dom.style.top = top + 'px';
        w._dom.style.right = rightPx + 'px';
      }
    }

    /** 1-indexed Monaco line that the hunk widget anchors UNDER (its bottom edge). */
    function hunkLastLine(hunk) {
      if (hunk.addedLines.length > 0) {
        return hunk.modifiedStart + hunk.addedLines.length;
      }
      return Math.max(1, hunk.modifiedStart + 1);
    }

    function maybeAutoReveal() {
      if (state.didAutoReveal || state.hunks.length === 0) { return; }
      state.didAutoReveal = true;
      const line = hunkAnchorLine(state.hunks[0]);
      state.editor.revealLineInCenter(line);
      state.editor.setPosition({ lineNumber: line, column: 1 });
    }

    /** 1-indexed Monaco line that the hunk widget anchors to. */
    function hunkAnchorLine(hunk) {
      return Math.max(1, hunk.modifiedStart + 1);
    }

    /** Hunk index covering modified-side `line` (1-indexed). */
    function findHunkIdxAtLine(line) {
      if (!line || line < 1) { return -1; }
      for (let i = 0; i < state.hunks.length; i++) {
        const h = state.hunks[i];
        if (h.addedLines.length > 0) {
          const start = h.modifiedStart + 1;
          const end = h.modifiedStart + h.addedLines.length;
          if (line >= start && line <= end) { return i; }
        } else {
          // Pure deletion: anchor on the single line at modifiedStart+1.
          if (line === h.modifiedStart + 1 || line === h.modifiedStart) { return i; }
        }
      }
      return -1;
    }

    function setHoveredHunk(idx) {
      if (idx === state.hoveredHunkIdx) { return; }
      state.hoveredHunkIdx = idx;
      state.hunkWidgets.forEach((w, i) => {
        const dom = w.getDomNode();
        if (i === idx) { dom.classList.add('visible'); }
        else { dom.classList.remove('visible'); }
      });
      updateHunkCounter();
    }

    function updateHoveredHunkFromCursor() {
      const pos = state.editor.getPosition();
      setHoveredHunk(pos ? findHunkIdxAtLine(pos.lineNumber) : -1);
    }

    function makeHunkBar(hunk, idx) {
      const node = document.createElement('div');
      node.className = 'hunk-bar';
      node.dataset.hunkIdx = String(idx);
      node.addEventListener('mouseenter', () => setHoveredHunk(idx));

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'hunk-btn accept';
      acceptBtn.textContent = 'Accept';
      acceptBtn.title = 'Accept this hunk (Ctrl+Y)';
      acceptBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      acceptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        acceptHunk(hunk);
      });

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'hunk-btn reject';
      rejectBtn.textContent = 'Reject';
      rejectBtn.title = 'Reject this hunk (Ctrl+N)';
      rejectBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      rejectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rejectHunk(hunk);
      });

      node.appendChild(acceptBtn);
      node.appendChild(rejectBtn);
      return node;
    }

    function acceptHunk(hunk) {
      if (state.inFlight) { return; }
      const { newOriginal, newCurrent } = applyAccept(hunk);
      setInFlight(true);
      vscodeApi.postMessage({ type: 'acceptHunk', newOriginal, newCurrent });
    }

    function rejectHunk(hunk) {
      if (state.inFlight) { return; }
      const { newOriginal, newCurrent } = applyReject(hunk);
      setInFlight(true);
      vscodeApi.postMessage({ type: 'rejectHunk', newOriginal, newCurrent });
    }

    function registerActions() {
      state.editor.addAction({
        id: 'ai-cli-diff.acceptCurrentHunk',
        label: 'AI CLI Diff: Accept Current Hunk',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY],
        run: () => {
          const h = findHunkAtCursor();
          if (h) { acceptHunk(h); }
        },
      });
      state.editor.addAction({
        id: 'ai-cli-diff.rejectCurrentHunk',
        label: 'AI CLI Diff: Reject Current Hunk',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN],
        run: () => {
          const h = findHunkAtCursor();
          if (h) { rejectHunk(h); }
        },
      });
      state.editor.addAction({
        id: 'ai-cli-diff.nextHunk',
        label: 'AI CLI Diff: Next Hunk',
        keybindings: [monaco.KeyCode.F7],
        run: () => gotoHunk(+1),
      });
      state.editor.addAction({
        id: 'ai-cli-diff.prevHunk',
        label: 'AI CLI Diff: Previous Hunk',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F7],
        run: () => gotoHunk(-1),
      });
      state.editor.addAction({
        id: 'ai-cli-diff.nextFile',
        label: 'AI CLI Diff: Next File',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyL],
        run: () => vscodeApi.postMessage({ type: 'nextFile' }),
      });
      state.editor.addAction({
        id: 'ai-cli-diff.prevFile',
        label: 'AI CLI Diff: Previous File',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyH],
        run: () => vscodeApi.postMessage({ type: 'prevFile' }),
      });
      state.editor.addAction({
        id: 'ai-cli-diff.acceptAll',
        label: 'AI CLI Diff: Accept All Hunks',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyY],
        run: () => {
          if (state.inFlight) { return; }
          setInFlight(true);
          vscodeApi.postMessage({ type: 'acceptAll' });
        },
      });
      state.editor.addAction({
        id: 'ai-cli-diff.save',
        label: 'AI CLI Diff: Save',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => vscodeApi.postMessage({ type: 'save' }),
      });
      state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
        vscodeApi.postMessage({ type: 'undo' });
      });
      state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => {
        vscodeApi.postMessage({ type: 'redo' });
      });
    }

    function findHunkAtCursor() {
      const pos = state.editor.getPosition();
      if (!pos) { return null; }
      const idx = findHunkIdxAtLine(pos.lineNumber);
      if (idx !== -1) { return state.hunks[idx]; }
      // Nearest hunk fallback.
      let best = null;
      let bestDist = Infinity;
      for (const h of state.hunks) {
        const anchor = hunkAnchorLine(h);
        const d = Math.abs(pos.lineNumber - anchor);
        if (d < bestDist) { best = h; bestDist = d; }
      }
      return best;
    }

    function gotoHunk(direction) {
      if (state.hunks.length === 0) { return; }
      const pos = state.editor.getPosition();
      const line = pos ? pos.lineNumber : 1;
      const sorted = state.hunks.slice().sort(
        (a, b) => hunkAnchorLine(a) - hunkAnchorLine(b)
      );
      let target = null;
      if (direction > 0) {
        target = sorted.find(h => hunkAnchorLine(h) > line) || sorted[0];
      } else {
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (hunkAnchorLine(sorted[i]) < line) { target = sorted[i]; break; }
        }
        target = target || sorted[sorted.length - 1];
      }
      if (target) {
        const targetLine = hunkAnchorLine(target);
        state.editor.revealLineInCenter(targetLine);
        state.editor.setPosition({ lineNumber: targetLine, column: 1 });
      }
    }

    /**
     * Accept hunk: bake modified slice INTO the original baseline.
     * newOriginal: splice removedLines.length entries at originalStart, replace with addedLines text.
     * newCurrent: unchanged.
     */
    function applyAccept(hunk) {
      const origLines = state.originalContent.split('\n');
      const insertText = hunk.addedLines.map(a => a.text);
      origLines.splice(hunk.originalStart, hunk.removedLines.length, ...insertText);
      return { newOriginal: origLines.join('\n'), newCurrent: state.currentContent };
    }

    /**
     * Reject hunk: rollback modified slice back to original.
     * newCurrent: splice addedLines.length entries at modifiedStart, replace with removedLines text.
     * newOriginal: unchanged.
     */
    function applyReject(hunk) {
      const modLines = state.currentContent.split('\n');
      const insertText = hunk.removedLines.map(r => r.text);
      modLines.splice(hunk.modifiedStart, hunk.addedLines.length, ...insertText);
      return { newOriginal: state.originalContent, newCurrent: modLines.join('\n') };
    }
  });
})();
