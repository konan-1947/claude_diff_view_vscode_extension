(function () {
  'use strict';

  const MAX_ROWS = 1000;

  // Counts candidate delimiters on the first line, ignoring quoted text.
  function detectDelimiter(text, path) {
    if (/\.tsv$/i.test(path || '')) return '\t';
    const firstLine = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
    const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ',';
  }

  // RFC 4180 style: quoted cells may contain delimiters, newlines and "" escapes.
  function parse(text, delimiter, maxRows) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    let truncated = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === delimiter) {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        if (rows.length >= maxRows + 1) { truncated = i < text.length - 1; break; }
      } else cell += ch;
    }
    if (!truncated && (cell !== '' || row.length > 0)) {
      row.push(cell);
      rows.push(row);
    }
    return { rows, truncated };
  }

  function render(host, data) {
    const text = (data.content || '').replace(/^﻿/, '');
    if (!text.trim()) {
      host.textContent = 'Empty file';
      return;
    }
    const { rows, truncated } = parse(text, detectDelimiter(text, data.path), MAX_ROWS);
    const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);

    const wrap = document.createElement('div');
    wrap.className = 'csv-preview';
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const body = document.createElement('tbody');
    rows.forEach((cells, index) => {
      const tr = document.createElement('tr');
      const num = document.createElement('th');
      num.className = 'csv-rownum';
      num.textContent = index === 0 ? '' : String(index);
      tr.appendChild(num);
      for (let c = 0; c < columns; c += 1) {
        const td = document.createElement(index === 0 ? 'th' : 'td');
        td.textContent = cells[c] === undefined ? '' : cells[c];
        tr.appendChild(td);
      }
      (index === 0 ? head : body).appendChild(tr);
    });
    table.append(head, body);
    wrap.appendChild(table);
    if (truncated) {
      const note = document.createElement('div');
      note.className = 'csv-note';
      note.textContent = 'Showing the first ' + MAX_ROWS + ' rows. Switch to Source to see the rest.';
      wrap.appendChild(note);
    }
    host.appendChild(wrap);
  }

  (window.aiCliPreviewRenderers = window.aiCliPreviewRenderers || {}).csv = {
    render,
    dispose() {},
  };
  window.aiCliPreviewCsvParse = parse;
}());
