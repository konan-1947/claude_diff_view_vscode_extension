(function () {
  'use strict';

  const vscode = window.__AI_CLI_VSCODE_API__ || (
    window.__AI_CLI_VSCODE_API__ = acquireVsCodeApi()
  );
  const editorHost = document.getElementById('file-preview-editor');
  const markdownHost = document.getElementById('file-preview-markdown');
  const imageHost = document.getElementById('file-preview-image');
  const title = document.getElementById('file-preview-path');
  const modeButton = document.getElementById('file-preview-mode');
  const hint = document.getElementById('file-preview-hint');
  let editor;
  let model;
  let activePath;
  let activeData;
  let markdownView = false;
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

  function isMarkdownPath(filePath) {
    return /\.(md|markdown|mdx)$/i.test(filePath || '');
  }

  function isImagePath(filePath) {
    return /\.(apng|avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(filePath || '');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value) {
    const url = String(value || '').trim();
    return /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(url) ? url : '#';
  }

  function renderInline(value) {
    const code = [];
    let text = escapeHtml(value)
      .replace(/`([^`]+)`/g, (_, content) => {
        code.push(`<code>${content}</code>`);
        return `\u0000${code.length - 1}\u0000`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => (
        `<img src="${escapeHtml(safeUrl(url))}" alt="${alt}">`
      ))
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => (
        `<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`
      ))
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)]);
  }

  function renderMarkdown(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let paragraph = [];
    let list;
    let codeLines;
    let codeLanguage = '';

    function flushParagraph() {
      if (paragraph.length === 0) return;
      output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
      paragraph = [];
    }
    function flushList() {
      if (!list) return;
      output.push(`<${list.type}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${list.type}>`);
      list = undefined;
    }
    function flushCode() {
      if (codeLines === undefined) return;
      output.push(`<pre><code class="language-${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines = undefined;
      codeLanguage = '';
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (codeLines !== undefined) {
        if (/^\s*```/.test(line)) flushCode();
        else codeLines.push(line);
        continue;
      }
      const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
      if (fence) {
        flushParagraph();
        flushList();
        codeLanguage = fence[1] || '';
        codeLines = [];
        continue;
      }
      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }
      const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length;
        output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        continue;
      }
      if (/^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) {
        flushParagraph();
        flushList();
        output.push('<hr>');
        continue;
      }
      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        flushList();
        output.push(`<blockquote><p>${renderInline(quote[1])}</p></blockquote>`);
        continue;
      }
      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const type = unordered ? 'ul' : 'ol';
        if (!list || list.type !== type) {
          flushList();
          list = { type, items: [] };
        }
        list.items.push((unordered || ordered)[1]);
        continue;
      }
      const next = lines[index + 1] || '';
      if (line.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(next)) {
        flushParagraph();
        flushList();
        const cells = (value) => value.replace(/^\s*\|?|\|?\s*$/g, '').split('|').map((cell) => cell.trim());
        const headers = cells(line);
        index += 1;
        const rows = [];
        while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim()) {
          index += 1;
          rows.push(cells(lines[index]));
        }
        output.push(`<table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      flushList();
      paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    flushCode();
    return output.join('');
  }

  function updateModeButton() {
    const markdown = !!activeData && isMarkdownPath(activeData.path);
    modeButton.hidden = !markdown;
    modeButton.textContent = markdownView ? 'Edit source' : 'Preview';
    hint.textContent = activeData?.kind === 'image'
      ? 'Image preview'
      : markdownView ? 'Rendered Markdown' : 'Ctrl+S to save';
  }

  function showMarkdownPreview(data) {
    markdownView = true;
    editorHost.hidden = true;
    markdownHost.hidden = false;
    imageHost.hidden = true;
    markdownHost.innerHTML = renderMarkdown(data.content);
    updateModeButton();
  }

  function showImagePreview(data) {
    markdownView = false;
    editorHost.hidden = true;
    markdownHost.hidden = true;
    imageHost.hidden = false;
    imageHost.innerHTML = '';
    const image = document.createElement('img');
    image.src = data.data;
    image.alt = data.label || 'Image preview';
    image.draggable = false;
    imageHost.appendChild(image);
    updateModeButton();
  }

  function showSourceEditor(data) {
    markdownView = false;
    editorHost.hidden = false;
    markdownHost.hidden = true;
    imageHost.hidden = true;
    updateModeButton();
    loadMonaco().then((monaco) => {
      if (!activeData || data.path !== activePath) return;
      applying = true;
      if (model) model.dispose();
      model = monaco.editor.createModel(data.content, data.language || 'plaintext');
      if (!editor) {
        editor = monaco.editor.create(editorHost, {
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
          activeData.content = model.getValue();
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

  function open(path) {
    activePath = path;
    title.textContent = 'Loading…';
    modeButton.hidden = true;
    imageHost.hidden = true;
    vscode.postMessage({ type: 'requestFilePreview', path });
  }

  function close() {
    clearTimeout(saveTimer);
    activePath = undefined;
    activeData = undefined;
    markdownHost.innerHTML = '';
    imageHost.innerHTML = '';
    vscode.postMessage({ type: 'closeFilePreview' });
  }

  modeButton.addEventListener('click', () => {
    if (!activeData) return;
    if (markdownView) showSourceEditor(activeData);
    else showMarkdownPreview(activeData);
  });

  window.aiCliFilePreview = { open, close };
  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'filePreviewData' && msg.path === activePath) {
      activeData = msg;
      title.textContent = msg.label;
      if (msg.kind === 'image' || isImagePath(msg.path)) showImagePreview(msg);
      else if (isMarkdownPath(msg.path)) showMarkdownPreview(msg);
      else showSourceEditor(msg);
    }
    if (msg.type === 'filePreviewError') title.textContent = msg.message || 'Could not open file';
  });
}());
