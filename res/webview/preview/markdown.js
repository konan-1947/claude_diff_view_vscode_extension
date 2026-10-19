(function () {
  'use strict';

  // Anything with a scheme (http:, data:, vscode-resource…), a protocol-relative
  // prefix or a leading slash is already absolute and must be left alone.
  function isRelative(url) {
    return !!url && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);
  }

  function resolveRelative(url, baseUri) {
    try {
      return new URL(url, baseUri).toString();
    } catch (e) {
      return url;
    }
  }

  function fixLinks(root, baseUri) {
    root.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      if (baseUri && isRelative(src)) img.setAttribute('src', resolveRelative(src, baseUri));
    });
    root.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#')) {
        // In-page anchor: scroll inside the preview, never navigate the webview.
        event.preventDefault();
        const target = root.querySelector('[id="' + CSS.escape(decodeURIComponent(href.slice(1))) + '"]');
        if (target) target.scrollIntoView();
      } else if (!/^https?:/i.test(href)) {
        // Relative links to other files cannot be followed from here.
        event.preventDefault();
      }
    });
  }

  function renderMermaidBlocks(root) {
    const blocks = root.querySelectorAll('pre > code.language-mermaid');
    return Promise.all(Array.from(blocks).map((code) => {
      const pre = code.parentElement;
      const container = document.createElement('div');
      container.className = 'mermaid-diagram';
      pre.replaceWith(container);
      return window.aiCliPreviewMermaid.draw(container, code.textContent || '')
        .catch((error) => window.aiCliPreviewMermaid.showError(container, error));
    }));
  }

  function render(host, data) {
    return Promise.all([window.aiCliPreviewLibs.marked(), window.aiCliPreviewLibs.purify()]).then(([marked, purify]) => {
      const root = document.createElement('article');
      root.className = 'markdown-body';
      const html = marked.parse(data.content || '', { gfm: true, async: false });
      // DOMPurify drops <script>, on* handlers and javascript: URLs; the file may be untrusted.
      root.innerHTML = purify.sanitize(html);
      fixLinks(root, data.baseUri);
      host.appendChild(root);
      return renderMermaidBlocks(root);
    }).catch((error) => {
      host.textContent = '';
      const box = document.createElement('div');
      box.className = 'preview-error';
      box.textContent = 'Markdown: ' + (error && error.message ? error.message : String(error));
      host.appendChild(box);
    });
  }

  (window.aiCliPreviewRenderers = window.aiCliPreviewRenderers || {}).markdown = {
    render,
    dispose() {},
  };
}());
