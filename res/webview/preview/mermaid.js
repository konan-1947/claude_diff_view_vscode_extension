(function () {
  'use strict';

  let appliedTheme;
  let counter = 0;

  function mermaidTheme() {
    const classes = document.body.classList;
    return classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light') ? 'default' : 'dark';
  }

  // Renders `source` to an SVG string. Rejects with the mermaid syntax error.
  // `theme` overrides the VS Code one: a Claude UI tab (an iframe of this
  // webview, see claudeFrame.js) can have its own colour preset.
  function renderSvg(source, theme) {
    return window.aiCliPreviewLibs.mermaid().then((mermaid) => {
      // Re-initialise when the theme changed since the last diagram.
      const wanted = theme || mermaidTheme();
      if (wanted !== appliedTheme) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: wanted,
        });
        appliedTheme = wanted;
      }
      const id = 'ai-cli-mermaid-' + (counter += 1);
      // Without a host element mermaid draws its temp node in <body>, visible
      // below the content; give it an off-screen one instead.
      const scratch = document.createElement('div');
      scratch.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;';
      document.body.appendChild(scratch);
      return mermaid.render(id, source, scratch).then((result) => result.svg).finally(() => {
        // A failed render leaves its temp element behind.
        const leftover = document.getElementById('d' + id);
        if (leftover) leftover.remove();
        scratch.remove();
      });
    });
  }

  // Draws `source` into `container`. Rejects with the mermaid syntax error.
  function draw(container, source) {
    // Skeleton placeholder: reserves height while the ~5 MB lib loads and the SVG renders.
    container.classList.add('is-loading');
    return renderSvg(source).then((svg) => {
      container.innerHTML = svg;
    }).finally(() => {
      container.classList.remove('is-loading');
    });
  }

  function showError(container, error) {
    container.textContent = '';
    const box = document.createElement('div');
    box.className = 'preview-error';
    box.textContent = 'Mermaid: ' + (error && error.message ? error.message : String(error));
    container.appendChild(box);
  }

  function render(host, data) {
    const container = document.createElement('div');
    container.className = 'mermaid-diagram';
    host.appendChild(container);
    window.aiCliZoomViewer.attach(container);
    return draw(container, data.content).catch((error) => showError(container, error));
  }

  window.aiCliPreviewMermaid = { draw, showError, renderSvg };
  (window.aiCliPreviewRenderers = window.aiCliPreviewRenderers || {}).mermaid = {
    render,
    dispose() {},
  };
}());
