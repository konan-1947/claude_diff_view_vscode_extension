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
      // `hunks` chỉ phục vụ decoration + view zone (một hunk = một cặp dòng đã
      // căn nhau). Mọi thứ liên quan tới thao tác — hit-test, nút, phím tắt —
      // đi qua `groups`, tức khối thay đổi liền kề trước khi bị tách để hiển thị.
      hunks: [],
      groups: [],
      groupWidgets: [],
      decorationIds: [],
      viewZoneIds: [],
      hoveredGroupIdx: -1,
      toolbarHovered: false,
      didAutoReveal: false,
      currentTheme: null,
      inFlight: false,
    };

    function getTopLine() {
      const ranges = state.editor && state.editor.getVisibleRanges();
      return ranges && ranges[0] ? ranges[0].startLineNumber : undefined;
    }

    function flushCursor() {
      const pos = state.editor && state.editor.getPosition();
      if (!pos) { return; }
      vscodeApi.postMessage({
        type: 'cursor',
        line: pos.lineNumber,
        column: pos.column,
        topLine: getTopLine(),
      });
    }

    function setInFlight(value) {
      state.inFlight = value;
      document.querySelectorAll('.hunk-btn').forEach((b) => { b.disabled = value; });
      const acceptBtn = document.getElementById('btn-accept-file');
      const rejectBtn = document.getElementById('btn-reject-file');
      if (acceptBtn) { acceptBtn.disabled = value; }
      if (rejectBtn) { rejectBtn.disabled = value; }
    }

    function currentGroupIdx() {
      if (state.hoveredGroupIdx >= 0 && state.hoveredGroupIdx < state.groups.length) {
        return state.hoveredGroupIdx;
      }
      const pos = state.editor && state.editor.getPosition();
      if (pos) {
        const idx = findGroupIdxAtLine(pos.lineNumber);
        if (idx !== -1) { return idx; }
      }
      return state.groups.length > 0 ? 0 : -1;
    }

    // Pill đếm KHỐI thay đổi, không đếm hunk con: nó phải khớp với thứ mà F7 /
    // Shift+F7 nhảy qua và thứ mà một cặp nút điều khiển.
    function updateHunkCounter() {
      const el = document.getElementById('hunk-counter');
      if (!el) { return; }
      const total = state.groups.length;
      if (total === 0) {
        el.textContent = '0 / 0';
      } else {
        const idx = currentGroupIdx();
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
          topLine: getTopLine(),
        });
      }, 150);
    });

    state.editor.onDidScrollChange(() => repositionVisibleBar());
    state.editor.onDidLayoutChange(() => repositionVisibleBar());
    state.editor.onMouseMove((e) => {
      const line = e.target && e.target.position && e.target.position.lineNumber;
      if (!line) { return; }
      const idx = findGroupIdxAtLine(line);
      if (idx !== -1) { setHoveredGroup(idx); }
    });
    state.editor.onMouseLeave(() => { updateHoveredGroupFromCursor(); });
    state.editor.onDidChangeCursorPosition(() => { updateHoveredGroupFromCursor(); });

    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
      toolbar.addEventListener('pointerenter', () => {
        state.toolbarHovered = true;
        setHoveredGroup(-1);
      });
      toolbar.addEventListener('pointerleave', () => {
        state.toolbarHovered = false;
      });
      toolbar.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    }

    registerActions();

    document.getElementById('btn-accept-file').addEventListener('click', () => {
      if (state.inFlight) { return; }
      setInFlight(true);
      flushCursor();
      vscodeApi.postMessage({ type: 'acceptAll' });
    });
    document.getElementById('btn-reject-file').addEventListener('click', () => {
      if (state.inFlight) { return; }
      setInFlight(true);
      flushCursor();
      vscodeApi.postMessage({ type: 'rejectAll' });
    });
    document.getElementById('btn-prev-hunk').addEventListener('click', () => {
      gotoHunk(-1);
    });
    document.getElementById('btn-next-hunk').addEventListener('click', () => {
      gotoHunk(+1);
    });
    document.getElementById('btn-next-file').addEventListener('click', () => {
      setHoveredGroup(-1);
      vscodeApi.postMessage({ type: 'nextFile' });
    });
    document.getElementById('btn-prev-file').addEventListener('click', () => {
      setHoveredGroup(-1);
      vscodeApi.postMessage({ type: 'prevFile' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) { return; }
      switch (msg.type) {
        case 'set': applySet(msg); return;
        case 'theme-change': applyTheme(msg.theme); return;
        case 'config-change':
          applyConfig(msg.editorConfig);
          // Đổi font/cỡ chữ là đổi lineHeight, mà chiều cao view zone bám theo
          // số đo đó — phải dựng lại, không thì mảng đỏ lệch chiều cao trở lại.
          if (state.hunks.length > 0) { renderDiffDecorations(); }
          return;
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
      // Gán ngay cạnh `hunks` chứ không đợi tới lúc render: `maybeAutoReveal()`
      // và `updateHunkCounter()` bên dưới cũng đọc `groups`, nên để hai thứ luôn
      // được thay cùng lúc thì không thể có cửa sổ đọc phải group cũ.
      state.groups = buildGroups(state.hunks);

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
      renderGroupWidgets();
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
        // View zone cao đúng heightInLines * lineHeight của Monaco. Nếu các dòng
        // bên trong dùng line-height mặc định của trình duyệt (~1.2x cỡ chữ,
        // thấp hơn Monaco) thì nội dung ngắn hơn ô đã chừa, để lại một mảng đỏ
        // trống ở dưới — càng nhiều dòng bị xoá càng lộ. Lấy thẳng số đo thật của
        // editor thay vì đoán qua biến CSS.
        const fontInfo = state.editor.getOption(monaco.editor.EditorOption.fontInfo);
        const model = state.editor.getModel();
        const tabSize = model ? model.getOptions().tabSize : 4;

        for (const hunk of state.hunks) {
          if (hunk.removedLines.length === 0) { continue; }
          const dom = document.createElement('div');
          dom.className = 'diff-removed-zone';
          if (fontInfo) {
            dom.style.lineHeight = fontInfo.lineHeight + 'px';
            dom.style.fontSize = fontInfo.fontSize + 'px';
            dom.style.fontFamily = fontInfo.fontFamily;
          }
          dom.style.tabSize = String(tabSize);
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

    /**
     * Gom các hunk liên tiếp cùng `groupId` thành khối thay đổi liền kề ban đầu.
     *
     * Phía extension tách khối ra theo từng cặp dòng để dòng cũ render đúng ngay
     * trên dòng mới (Pass 3 trong hunkCalculator.ts). Ở đây gom lại thành đơn vị
     * thao tác — mỗi khối một cặp nút Accept/Reject — theo hai điều kiện cắt:
     *
     *   1. `groupId` đổi  -> đã có DÒNG TRẮNG (dòng không đổi) xen giữa.
     *   2. hunk con này có DÒNG ĐỎ trong khi khối đang gom đã có DÒNG XANH
     *      -> tức mọi chuyển tiếp xanh -> đỏ đều mở khối mới.
     *
     * Hệ quả của (2): mỗi dòng bị thay thế có nút riêng, còn dòng xanh thêm mới
     * không có dòng đỏ đối ứng thì dính vào cặp ngay phía trên nó. Vài hình dạng
     * đáng nhớ: `R G R G` -> 2 khối; `R G G` -> 1 khối; `R R G` -> 1 khối (lúc
     * gặp đỏ thứ hai khối chưa có xanh nào); xoá thuần / thêm thuần -> 1 khối.
     *
     * Điều kiện (2) là PHÂN KỲ CÓ CHỦ ĐÍCH khỏi quy ước git: `git add -p` từ chối
     * tách khi giữa hai thay đổi không có dòng context. Ở đây cố ý mịn hơn.
     *
     * Gom theo run liên tiếp chứ không gom bằng Map: thứ tự trên-xuống vốn đã
     * được đảm bảo, và làm thế biến nó thành ràng buộc cấu trúc thay vì tình cờ.
     * Vì mỗi khối vẫn là một dải con LIÊN TIẾP của cùng một groupId, nó vẫn liền
     * kề trong cả hai không gian chỉ số — bất biến mà applyAccept/applyReject
     * dựa vào để gộp cả khối bằng một slice().concat().
     *
     * Mọi thứ đường nóng cần đều được tính sẵn ở đây, để hover và cuộn chỉ còn
     * là đọc field.
     */
    function buildGroups(hunks) {
      const groups = [];
      let cur = null;
      for (const h of hunks) {
        const sameBlock = cur
          && cur.groupId === h.groupId
          && !(h.removedLines.length > 0 && cur.addedTexts.length > 0);
        if (!sameBlock) {
          cur = {
            // Không còn 1-1 với groupId: một groupId có thể sinh nhiều khối, do
            // điều kiện cắt (2). Giữ lại để so ranh giới dòng trắng.
            groupId: h.groupId,
            hunks: [h],
            // Của hunk con ĐẦU TIÊN, không phải min/max: hunk con chỉ-thêm và cặp
            // ngay sau nó có thể trùng originalStart, nên max() không phải điểm cuối.
            originalStart: h.originalStart,
            modifiedStart: h.modifiedStart,
            removedTexts: h.removedLines.map(r => r.text),
            addedTexts: h.addedLines.map(a => a.text),
          };
          groups.push(cur);
        } else {
          cur.hunks.push(h);
          for (const r of h.removedLines) { cur.removedTexts.push(r.text); }
          for (const a of h.addedLines) { cur.addedTexts.push(a.text); }
        }
      }
      for (const g of groups) {
        g.removedCount = g.removedTexts.length;
        g.addedCount = g.addedTexts.length;
        g.anchorLine = Math.max(1, g.modifiedStart + 1);
        if (g.addedCount > 0) {
          // Các dòng thêm của một group luôn liền nhau kể từ modifiedStart, kể cả
          // khi giữa group có hunk con chỉ-xoá (nó không sinh dòng phía modified).
          g.startLine = g.modifiedStart + 1;
          g.endLine = g.modifiedStart + g.addedCount;
        } else {
          g.startLine = g.modifiedStart;
          g.endLine = Math.max(1, g.modifiedStart + 1);
        }
      }
      return groups;
    }

    function renderGroupWidgets() {
      for (const w of state.groupWidgets) {
        state.editor.removeOverlayWidget(w);
      }
      state.groupWidgets = [];
      state.hoveredGroupIdx = -1;

      state.groups.forEach((group, idx) => {
        const dom = makeGroupBar(group, idx);
        const widget = {
          _idx: idx,
          _group: group,
          _dom: dom,
          getId: () => 'ai-cli-diff.hunkBar.' + idx,
          getDomNode: () => dom,
          getPosition: () => null,
        };
        state.editor.addOverlayWidget(widget);
        state.groupWidgets.push(widget);
      });
      repositionVisibleBar();
      updateHoveredGroupFromCursor();
    }

    /**
     * Chỉ định vị đúng thanh ĐANG hiện. Các thanh khác có opacity 0 nên định vị
     * chúng là công vô ích — và đây là đường nóng: nó chạy trên mỗi sự kiện cuộn
     * và mỗi lần layout đổi. Một khối thay đổi = một thanh, nhưng một file lớn
     * vẫn có thể có hàng chục khối rời rạc.
     */
    function repositionVisibleBar() {
      const w = state.groupWidgets[state.hoveredGroupIdx];
      if (!w) { return; }
      const layout = state.editor.getLayoutInfo();
      const minimapW = (layout && layout.minimap && layout.minimap.minimapWidth) || 0;
      const scrollbarW = (layout && layout.verticalScrollbarWidth) || 0;
      const top = state.editor.getBottomForLineNumber(w._group.endLine) - state.editor.getScrollTop();
      w._dom.style.top = top + 'px';
      w._dom.style.right = (minimapW + scrollbarW + 8) + 'px';

      const toolbar = document.getElementById('toolbar');
      const editorDom = state.editor.getDomNode();
      if (!toolbar || !editorDom) { return; }
      const barRect = w._dom.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const overlaps = barRect.left < toolbarRect.right
        && barRect.right > toolbarRect.left
        && barRect.top < toolbarRect.bottom
        && barRect.bottom > toolbarRect.top;
      if (!overlaps) { return; }

      // Keep the hunk action bar out of the file/hunk navigation hit area.
      const editorRect = editorDom.getBoundingClientRect();
      const topAboveToolbar = toolbarRect.top - barRect.height - 6;
      if (topAboveToolbar < editorRect.top + 4) {
        setHoveredGroup(-1);
        return;
      }
      w._dom.style.top = (topAboveToolbar - editorRect.top) + 'px';
    }

    function maybeAutoReveal() {
      if (state.didAutoReveal || state.groups.length === 0) { return; }
      state.didAutoReveal = true;
      const line = state.groups[0].anchorLine;
      state.editor.revealLineInCenter(line);
      state.editor.setPosition({ lineNumber: line, column: 1 });
    }

    /** Group index covering modified-side `line` (1-indexed). */
    function findGroupIdxAtLine(line) {
      if (!line || line < 1) { return -1; }
      for (let i = 0; i < state.groups.length; i++) {
        const g = state.groups[i];
        if (line >= g.startLine && line <= g.endLine) { return i; }
      }
      return -1;
    }

    function setHoveredGroup(idx) {
      if (state.toolbarHovered && idx !== -1) { return; }
      if (idx === state.hoveredGroupIdx) { return; }
      // Chỉ đụng vào thanh cũ và thanh mới, không quét cả danh sách: hàm này chạy
      // từ onMouseMove, tức mỗi lần di chuột, nên chi phí phải là hằng số bất kể
      // file có bao nhiêu khối thay đổi.
      const prev = state.groupWidgets[state.hoveredGroupIdx];
      if (prev) { prev.getDomNode().classList.remove('visible'); }
      state.hoveredGroupIdx = idx;
      const next = state.groupWidgets[idx];
      if (next) {
        next.getDomNode().classList.add('visible');
        // Định vị ngay lúc hiện: repositionVisibleBar() chỉ xử lý thanh đang hiện,
        // nên thanh vừa bật lên sẽ chưa có toạ độ nếu không gọi ở đây.
        repositionVisibleBar();
      }
      updateHunkCounter();
    }

    function updateHoveredGroupFromCursor() {
      const pos = state.editor.getPosition();
      setHoveredGroup(pos ? findGroupIdxAtLine(pos.lineNumber) : -1);
    }

    function makeGroupBar(group, idx) {
      const node = document.createElement('div');
      node.className = 'hunk-bar';
      node.dataset.groupIdx = String(idx);
      node.addEventListener('mouseenter', () => setHoveredGroup(idx));

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'hunk-btn accept';
      acceptBtn.textContent = 'Accept';
      acceptBtn.title = 'Accept this change block (Ctrl+Y)';
      acceptBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      acceptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        acceptGroup(group);
      });

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'hunk-btn reject';
      rejectBtn.textContent = 'Reject';
      rejectBtn.title = 'Reject this change block (Ctrl+N)';
      rejectBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      rejectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rejectGroup(group);
      });

      node.appendChild(acceptBtn);
      node.appendChild(rejectBtn);
      return node;
    }

    function acceptGroup(group) {
      if (state.inFlight) { return; }
      const { newOriginal, newCurrent } = applyAccept(group);
      setInFlight(true);
      vscodeApi.postMessage({ type: 'acceptHunk', newOriginal, newCurrent });
    }

    function rejectGroup(group) {
      if (state.inFlight) { return; }
      const { newOriginal, newCurrent } = applyReject(group);
      setInFlight(true);
      vscodeApi.postMessage({ type: 'rejectHunk', newOriginal, newCurrent });
    }

    function registerActions() {
      state.editor.addAction({
        id: 'ai-cli-diff.acceptCurrentHunk',
        label: 'AI CLI Diff: Accept Current Hunk',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY],
        run: () => {
          const g = findGroupAtCursor();
          if (g) { acceptGroup(g); }
        },
      });
      state.editor.addAction({
        id: 'ai-cli-diff.rejectCurrentHunk',
        label: 'AI CLI Diff: Reject Current Hunk',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN],
        run: () => {
          const g = findGroupAtCursor();
          if (g) { rejectGroup(g); }
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
          flushCursor();
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

    function findGroupAtCursor() {
      const pos = state.editor.getPosition();
      if (!pos) { return null; }
      const idx = findGroupIdxAtLine(pos.lineNumber);
      if (idx !== -1) { return state.groups[idx]; }
      // Nearest group fallback.
      let best = null;
      let bestDist = Infinity;
      for (const g of state.groups) {
        const d = Math.abs(pos.lineNumber - g.anchorLine);
        if (d < bestDist) { best = g; bestDist = d; }
      }
      return best;
    }

    function gotoHunk(direction) {
      if (state.groups.length === 0) { return; }
      const pos = state.editor.getPosition();
      const line = pos ? pos.lineNumber : 1;
      const sorted = state.groups.slice().sort((a, b) => a.anchorLine - b.anchorLine);
      let target = null;
      if (direction > 0) {
        target = sorted.find(g => g.anchorLine > line) || sorted[0];
      } else {
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].anchorLine < line) { target = sorted[i]; break; }
        }
        target = target || sorted[sorted.length - 1];
      }
      if (target) {
        state.editor.revealLineInCenter(target.anchorLine);
        state.editor.setPosition({ lineNumber: target.anchorLine, column: 1 });
      }
    }

    /**
     * Accept cả khối: gộp phần modified VÀO baseline bên trái.
     * newOriginal: thay `removedCount` dòng kể từ `originalStart` bằng `addedTexts`.
     * newCurrent: không đổi.
     *
     * Một splice cho cả khối tương đương từng byte với splice của hunk cha trước
     * khi Pass 3 tách — xem bất biến I2/C1/C2 trong hunkCalculator.ts. Không được
     * lặp từng hunk con: splice đầu tiên sẽ dịch mọi chỉ số phía sau.
     *
     * Dùng slice().concat() chứ không phải splice(...spread): một khối có thể lớn
     * bằng cả file, và spread hàng chục nghìn phần tử làm nổ giới hạn số đối số.
     */
    function applyAccept(group) {
      const origLines = state.originalContent.split('\n');
      const newOriginal = origLines
        .slice(0, group.originalStart)
        .concat(group.addedTexts, origLines.slice(group.originalStart + group.removedCount))
        .join('\n');
      return { newOriginal, newCurrent: state.currentContent };
    }

    /**
     * Reject cả khối: trả phần modified về đúng nguyên bản.
     * newCurrent: thay `addedCount` dòng kể từ `modifiedStart` bằng `removedTexts`.
     * newOriginal: không đổi.
     */
    function applyReject(group) {
      const modLines = state.currentContent.split('\n');
      const newCurrent = modLines
        .slice(0, group.modifiedStart)
        .concat(group.removedTexts, modLines.slice(group.modifiedStart + group.addedCount))
        .join('\n');
      return { newOriginal: state.originalContent, newCurrent };
    }
  });
})();
