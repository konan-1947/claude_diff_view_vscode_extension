/* global acquireVsCodeApi */
// Ctrl/Cmd+Click links in the integrated terminal: URLs open in the browser, file paths
// (src/foo.ts:42:7, C:\a\b.ts, /abs/x.py) open in VS Code. The webview cannot open either
// itself, so activation posts 'openLink' / 'openTerminalFile' to the extension.
(function () {
  'use strict';

  const vscode = window.__AI_CLI_VSCODE_API__ || (
    window.__AI_CLI_VSCODE_API__ = acquireVsCodeApi()
  );

  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const HINT = (IS_MAC ? 'Cmd' : 'Ctrl') + '+Click to open';
  // A wrapped logical line longer than this many rows is not scanned as a whole.
  const MAX_WRAPPED_ROWS = 20;

  const URL_RE = /\bhttps?:\/\/[^\s"'<>`]+/g;
  // Optional root (drive, UNC-less slash, ~, ./ ../), folder segments, then a file name that
  // ends in a letter-led extension, then an optional :line:col or (line,col) suffix.
  const PATH_RE = /(?<![\p{L}\p{N}_.@+\-\/\\:])((?:[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|[\\/])?(?:[\p{L}\p{N}_.@+\-]+[\\/])*[\p{L}\p{N}_@+\-][\p{L}\p{N}_.@+\-]*\.\p{L}[\p{L}\p{N}]{0,9})(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))?/gu;

  function isActivation(ev) {
    return !!ev && (ev.ctrlKey || ev.metaKey);
  }

  let tooltip = null;
  function showHint(ev) {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.style.cssText = [
        'position:fixed', 'z-index:10000', 'pointer-events:none', 'padding:2px 6px',
        'font-size:11px', 'border-radius:3px', 'white-space:nowrap',
        'background:var(--vscode-editorHoverWidget-background, #252526)',
        'color:var(--vscode-editorHoverWidget-foreground, #cccccc)',
        'border:1px solid var(--vscode-editorHoverWidget-border, #454545)',
      ].join(';');
      tooltip.textContent = HINT;
      document.body.appendChild(tooltip);
    }
    tooltip.style.display = 'block';
    const x = Math.min(ev.clientX + 8, window.innerWidth - tooltip.offsetWidth - 4);
    tooltip.style.left = Math.max(0, x) + 'px';
    tooltip.style.top = Math.max(0, ev.clientY - 26) + 'px';
  }
  function hideHint() {
    if (tooltip) tooltip.style.display = 'none';
  }

  /**
   * Reads the logical line (row + its wrapped continuations) around a 0-based buffer row.
   * pos[i] is the cell of text[i], so wide chars and wrapping map back to buffer coordinates.
   */
  function readLogicalLine(term, row) {
    const buf = term.buffer.active;
    let start = row;
    while (start > 0 && row - start < MAX_WRAPPED_ROWS) {
      const l = buf.getLine(start);
      if (!l || !l.isWrapped) break;
      start--;
    }
    let end = row;
    while (end - start < MAX_WRAPPED_ROWS) {
      const next = buf.getLine(end + 1);
      if (!next || !next.isWrapped) break;
      end++;
    }
    let text = '';
    const pos = [];
    const cell = buf.getNullCell();
    for (let y = start; y <= end; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      for (let x = 0; x < line.length; x++) {
        line.getCell(x, cell);
        const w = cell.getWidth();
        if (w === 0) continue; // second half of a wide char
        const ch = cell.getChars() || ' ';
        for (let i = 0; i < ch.length; i++) pos.push({ x, y, w });
        text += ch;
      }
    }
    return { text, pos };
  }

  function toRange(pos, from, to) {
    const a = pos[from];
    const b = pos[to - 1];
    // xterm ranges are 1-based and the end cell is inclusive.
    return { start: { x: a.x + 1, y: a.y + 1 }, end: { x: b.x + b.w, y: b.y + 1 } };
  }

  function trimUrl(url) {
    let u = url.replace(/[.,;:!?'"]+$/, '');
    // Drop unbalanced closing brackets, e.g. "(see https://x.y/z)".
    const pairs = { ')': '(', ']': '[', '}': '{' };
    while (u.length && pairs[u[u.length - 1]]) {
      const close = u[u.length - 1];
      const open = pairs[close];
      if (u.split(open).length >= u.split(close).length) break;
      u = u.slice(0, -1).replace(/[.,;:!?'"]+$/, '');
    }
    return u;
  }

  function makeLink(range, text, onActivate) {
    return {
      range,
      text,
      decorations: { pointerCursor: true, underline: true },
      activate: (ev) => { if (isActivation(ev)) onActivate(); },
      hover: (ev) => showHint(ev),
      leave: () => hideHint(),
    };
  }

  function findLinks(term, bufferLineNumber) {
    const { text, pos } = readLogicalLine(term, bufferLineNumber - 1);
    if (!text.trim()) return [];
    const links = [];
    const urlSpans = [];

    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(text))) {
      const url = trimUrl(m[0]);
      if (!url) continue;
      const from = m.index;
      const to = from + url.length;
      urlSpans.push([from, to]);
      links.push(makeLink(toRange(pos, from, to), url, () => {
        vscode.postMessage({ type: 'openLink', url });
      }));
    }

    PATH_RE.lastIndex = 0;
    while ((m = PATH_RE.exec(text))) {
      const from = m.index;
      const to = from + m[0].length;
      if (urlSpans.some(([a, b]) => from < b && to > a)) continue;
      const filePath = m[1];
      const lineStr = m[2] || m[4];
      const colStr = m[3] || m[5];
      // A bare "name.ext" is too often prose ("e.g", "Node.js"); require a folder or a line number.
      if (!/[\\/]/.test(filePath) && !lineStr) continue;
      const line = lineStr ? parseInt(lineStr, 10) : undefined;
      const col = colStr ? parseInt(colStr, 10) : undefined;
      links.push(makeLink(toRange(pos, from, to), m[0], () => {
        vscode.postMessage({ type: 'openTerminalFile', path: filePath, line, col });
      }));
    }

    // Only links that touch the hovered row.
    return links.filter((l) => l.range.start.y <= bufferLineNumber && l.range.end.y >= bufferLineNumber);
  }

  function register(term) {
    return term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        let links = [];
        try { links = findLinks(term, bufferLineNumber); } catch (_) { links = []; }
        callback(links.length ? links : undefined);
      },
    });
  }

  // OSC 8 hyperlinks: xterm's default handler uses confirm()/window.open, which a webview blocks.
  const linkHandler = {
    allowNonHttpProtocols: true,
    activate: (ev, uri) => {
      if (isActivation(ev)) vscode.postMessage({ type: 'openLink', url: uri });
    },
    hover: (ev) => showHint(ev),
    leave: () => hideHint(),
  };

  window.__AI_CLI_TERMINAL_LINKS__ = { register, linkHandler };
})();
