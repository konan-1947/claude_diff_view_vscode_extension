(function () {
  'use strict';

  let appliedTheme;
  let counter = 0;

  function mermaidTheme() {
    const classes = document.body.classList;
    return classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light') ? 'default' : 'dark';
  }

  // Draws `source` into `container`. Rejects with the mermaid syntax error.
  function draw(container, source) {
    return window.aiCliPreviewLibs.mermaid().then((mermaid) => {
      // Re-initialise when the VS Code theme changed since the last diagram.
      const theme = mermaidTheme();
      if (theme !== appliedTheme) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme,
        });
        appliedTheme = theme;
      }
      const id = 'ai-cli-mermaid-' + (counter += 1);
      return mermaid.render(id, source).then((result) => {
        container.innerHTML = result.svg;
      }).finally(() => {
        // A failed render leaves its scratch element behind in <body>.
        const leftover = document.getElementById('d' + id);
        if (leftover) leftover.remove();
      });
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
    return draw(container, data.content).catch((error) => showError(container, error));
  }

  window.aiCliPreviewMermaid = { draw, showError };
  (window.aiCliPreviewRenderers = window.aiCliPreviewRenderers || {}).mermaid = {
    render,
    dispose() {},
  };
}());
