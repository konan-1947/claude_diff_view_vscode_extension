/*
 * Claude UI tab host: one <iframe> per Claude UI tab, running the uic (Claudix)
 * Vue app built into dist/claude-ui.
 *
 * Why an iframe: the app ships global CSS (Tailwind preflight, html/body/:root
 * rules) that would restyle the terminal webview around it.
 *
 * How it loads: main.js and style.css are fetched once and inlined into the
 * iframe document, so the iframe never has to resolve a URL of its own. The
 * document is first tried as `srcdoc`; if the app does not report in, it is
 * retried as a blob: URL (the CSP allows `child-src blob:`).
 *
 * What the parent must do for the iframe, because VS Code only does it for the
 * top-level webview document:
 * - copy the theme (`--vscode-*` variables, `vscode-*` body classes, default
 *   styles) and keep it in sync on theme changes;
 * - forward VS Code shortcuts typed inside the iframe, so the workbench still
 *   sees them (VS Code listens for keydown on the webview window only).
 *
 * Messages: the app posts `{ __claudeUi: tabId, message }` to its parent;
 * `create().post(payload)` delivers `{ type: 'from-extension', ... }` back.
 *
 * Appearance (Settings → Claude UI appearance), set by the parent with
 * `ClaudeFrame.setAppearance(a)`:
 * - font size = CSS zoom on the <iframe> element (14 = 100%). The app sizes
 *   most text and spacing in px, so only zoom scales all of it; zooming the
 *   iframe (not the document inside) works like page zoom, so viewport sizes
 *   and element rects inside stay consistent for dropdown placement.
 * - font, colours and layout = a <style> in the iframe overriding `--vscode-*`
 *   and `--cs-*` variables (!important beats the inline theme copy on <html>).
 *
 * Public entry point:
 *   const frame = window.ClaudeFrame.create({ id, resume, onMessage });
 *   host.appendChild(frame.el); frame.post(payload); frame.focus(); frame.dispose();
 *   window.ClaudeFrame.setAppearance(appearance);
 */
(function () {
  'use strict';

  var config = window.__AI_CLI_CLAUDE_UI__ || {};
  var ALIVE_TIMEOUT_MS = 5000;
  var frames = new Set();
  var assets = null;

  function loadAssets() {
    if (!assets) {
      assets = Promise.all([fetchText(config.js), fetchText(config.css)]).catch(function (error) {
        assets = null;
        throw error;
      });
    }
    return assets;
  }

  function fetchText(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.text();
    });
  }

  /** `</script` / `</style` inside inlined code would end the element early. */
  function escapeEnd(text, tag) {
    return text.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);
  }

  function buildDocument(js, css, bootstrap) {
    var nonce = config.nonce || '';
    var boot = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<style>' + escapeEnd(css, 'style') + '</style>' +
      '<script nonce="' + nonce + '">window.UIC_BOOTSTRAP=' + boot + ';</' + 'script>' +
      '</head><body><div id="app"></div>' +
      '<script type="module" nonce="' + nonce + '">' + escapeEnd(js, 'script') + '</' + 'script>' +
      '</body></html>';
  }

  // ---- theme ------------------------------------------------------------

  var THEME_BODY_ATTRS = ['data-vscode-theme-kind', 'data-vscode-theme-name', 'data-vscode-theme-id'];

  function syncTheme(doc) {
    if (!doc || !doc.documentElement || !doc.body) return;
    try {
      // VS Code writes every --vscode-* variable as an inline style on <html>.
      var vars = document.documentElement.getAttribute('style') || '';
      doc.documentElement.setAttribute('style', vars);
      var themeClasses = Array.prototype.filter.call(document.body.classList, function (c) {
        return c.indexOf('vscode-') === 0;
      });
      Array.prototype.slice.call(doc.body.classList).forEach(function (c) {
        if (c.indexOf('vscode-') === 0 && themeClasses.indexOf(c) < 0) doc.body.classList.remove(c);
      });
      themeClasses.forEach(function (c) { doc.body.classList.add(c); });
      THEME_BODY_ATTRS.forEach(function (name) {
        var value = document.body.getAttribute(name);
        if (value === null) doc.body.removeAttribute(name);
        else doc.body.setAttribute(name, value);
      });
      var defaults = document.getElementById('_defaultStyles');
      if (defaults) {
        var copy = doc.getElementById('_defaultStyles');
        if (!copy) {
          copy = doc.createElement('style');
          copy.id = '_defaultStyles';
          doc.head.insertBefore(copy, doc.head.firstChild);
        }
        copy.textContent = defaults.textContent;
      }
    } catch (_) { /* frame navigating */ }
  }

  // ---- appearance -------------------------------------------------------

  /**
   * { zoom, fontFamily (chat text), codeFontFamily (commands, code), lineHeight, rowGap, columnMaxWidth,
   *   colors: null | { kind: 'dark'|'light', background, foreground, accent,
   *                    green, red, yellow, blue, purple, orange } }
   */
  var appearance = null;
  var THEME_KIND_CLASSES = ['vscode-dark', 'vscode-light', 'vscode-high-contrast', 'vscode-high-contrast-light'];

  function mix(a, b, pct) {
    return 'color-mix(in srgb, ' + a + ' ' + pct + '%, ' + b + ')';
  }

  function appearanceCss(a) {
    var vars = {};
    if (a.fontFamily) vars['--vscode-font-family'] = a.fontFamily;
    if (a.codeFontFamily) vars['--vscode-editor-font-family'] = a.codeFontFamily;
    vars['--cs-line-height'] = a.lineHeight + 'px';
    vars['--cs-row-gap'] = a.rowGap + 'px';
    vars['--cs-column-max'] = a.columnMaxWidth > 0 ? a.columnMaxWidth + 'px' : '100000px';
    var c = a.colors;
    if (c) {
      var bg = c.background, fg = c.foreground, accent = c.accent;
      var raised = mix(bg, fg, 92), border = mix(fg, 'transparent', 18);
      [
        '--vscode-editor-background', '--vscode-sideBar-background', '--vscode-panel-background',
        '--vscode-editorGroupHeader-tabsBackground',
      ].forEach(function (n) { vars[n] = bg; });
      [
        '--vscode-editor-foreground', '--vscode-foreground', '--vscode-input-foreground',
        '--vscode-dropdown-foreground', '--vscode-menu-foreground', '--vscode-list-hoverForeground',
        '--vscode-panelTitle-activeForeground',
      ].forEach(function (n) { vars[n] = fg; });
      vars['--vscode-descriptionForeground'] = mix(fg, 'transparent', 70);
      vars['--vscode-input-placeholderForeground'] = mix(fg, 'transparent', 50);
      [
        '--vscode-input-background', '--vscode-dropdown-background', '--vscode-menu-background',
        '--vscode-editorWidget-background', '--vscode-quickInput-background',
      ].forEach(function (n) { vars[n] = raised; });
      vars['--vscode-textCodeBlock-background'] = mix(bg, fg, 88);
      [
        '--vscode-panel-border', '--vscode-widget-border', '--vscode-input-border',
        '--vscode-dropdown-border', '--vscode-menu-border', '--vscode-commandCenter-inactiveBorder',
        '--vscode-inlineChatInput-border',
      ].forEach(function (n) { vars[n] = border; });
      vars['--vscode-list-hoverBackground'] = mix(fg, 'transparent', 8);
      vars['--vscode-list-activeSelectionBackground'] = mix(accent, 'transparent', 30);
      vars['--vscode-list-activeSelectionForeground'] = fg;
      vars['--vscode-menu-selectionBackground'] = mix(accent, 'transparent', 30);
      vars['--vscode-scrollbarSlider-background'] = mix(fg, 'transparent', 15);
      vars['--vscode-scrollbarSlider-hoverBackground'] = mix(fg, 'transparent', 25);
      vars['--vscode-scrollbarSlider-activeBackground'] = mix(fg, 'transparent', 35);
      vars['--vscode-focusBorder'] = accent;
      vars['--vscode-textLink-foreground'] = accent;
      vars['--vscode-textLink-activeForeground'] = accent;
      vars['--vscode-button-background'] = accent;
      vars['--vscode-button-hoverBackground'] = mix(accent, fg, 85);
      vars['--vscode-button-foreground'] = c.kind === 'light' ? '#ffffff' : bg;
      vars['--vscode-badge-background'] = accent;
      vars['--vscode-progressBar-background'] = accent;
      if (c.green) {
        vars['--vscode-charts-green'] = c.green;
        vars['--vscode-gitDecoration-addedResourceForeground'] = c.green;
        vars['--vscode-testing-iconPassed'] = c.green;
      }
      if (c.red) {
        vars['--vscode-charts-red'] = c.red;
        vars['--vscode-errorForeground'] = c.red;
        vars['--vscode-gitDecoration-deletedResourceForeground'] = c.red;
        vars['--vscode-testing-iconFailed'] = c.red;
      }
      if (c.yellow) {
        vars['--vscode-charts-yellow'] = c.yellow;
        vars['--vscode-editorWarning-foreground'] = c.yellow;
      }
      if (c.blue) vars['--vscode-charts-blue'] = c.blue;
      if (c.purple) vars['--vscode-charts-purple'] = c.purple;
      if (c.orange) vars['--vscode-charts-orange'] = c.orange;
    }
    var body = Object.keys(vars).map(function (n) { return '  ' + n + ': ' + vars[n] + ' !important;'; }).join('\n');
    return ':root {\n' + body + '\n}' + (c ? '\nhtml, body { background: ' + c.background + ' !important; }' : '');
  }

  function applyAppearance(frame) {
    var iframe = frame.iframe;
    var a = appearance;
    iframe.style.zoom = a && a.zoom && a.zoom !== 1 ? String(a.zoom) : '';
    var doc = frame.doc();
    if (!doc || !doc.head || !doc.body) return;
    try {
      var style = doc.getElementById('ai-cli-claude-appearance');
      if (!a) {
        if (style) style.remove();
        return;
      }
      if (!style) {
        style = doc.createElement('style');
        style.id = 'ai-cli-claude-appearance';
      }
      // Last in <head>, after the app's own stylesheet
      doc.head.appendChild(style);
      style.textContent = appearanceCss(a);
      // A light preset under a dark VS Code theme (or the reverse): the app's
      // `.vscode-light` rules must follow the preset. syncTheme ran just
      // before, so with no preset the copied VS Code classes stay.
      if (a.colors) {
        THEME_KIND_CLASSES.forEach(function (k) { doc.body.classList.remove(k); });
        doc.body.classList.add('vscode-' + a.colors.kind);
        doc.body.setAttribute('data-vscode-theme-kind', 'vscode-' + a.colors.kind);
      }
    } catch (_) { /* frame navigating */ }
  }

  function setAppearance(a) {
    appearance = a || null;
    frames.forEach(function (f) {
      syncTheme(f.doc());
      applyAppearance(f);
    });
  }

  var themeObserver = new MutationObserver(function () {
    frames.forEach(function (f) {
      syncTheme(f.doc());
      applyAppearance(f);
    });
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  if (document.body) {
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'].concat(THEME_BODY_ATTRS) });
  }

  // ---- keyboard ---------------------------------------------------------

  /** Editing keys stay inside the chat; everything else with a modifier is a workbench shortcut. */
  function isWorkbenchShortcut(e) {
    if (e.key === 'F1' || /^F\d+$/.test(e.key)) return true;
    if (!e.ctrlKey && !e.metaKey && !e.altKey) return false;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey &&
        /^(a|c|v|x|z|y|Backspace|Delete|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|Enter)$/i.test(e.key)) {
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && /^(z|ArrowLeft|ArrowRight|Home|End)$/i.test(e.key)) return false;
    return true;
  }

  function forwardKeys(win) {
    win.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || !isWorkbenchShortcut(e)) return;
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
        bubbles: true,
        cancelable: true,
      }));
    });
  }

  // ---- frames -----------------------------------------------------------

  function create(options) {
    var id = options.id;
    var el = document.createElement('div');
    el.className = 'claude-frame-host';
    var iframe = document.createElement('iframe');
    iframe.className = 'claude-frame';
    iframe.title = 'Claude UI';
    el.appendChild(iframe);

    var loaded = false;
    var alive = false;
    var disposed = false;
    var queue = [];
    var blobUrl = null;
    var html = null;
    var aliveTimer = 0;

    var frame = {
      id: id,
      el: el,
      iframe: iframe,
      doc: function () {
        try { return iframe.contentDocument; } catch (_) { return null; }
      },
      /** Called by the parent's message listener when this iframe reports in. */
      receive: function (message) {
        if (!alive) {
          alive = true;
          clearTimeout(aliveTimer);
          hideNotice();
        }
        options.onMessage(message);
      },
      owns: function (source) {
        return !!source && source === iframe.contentWindow;
      },
      post: function (payload) {
        if (disposed) return;
        if (!loaded) { queue.push(payload); return; }
        try { iframe.contentWindow.postMessage(payload, '*'); } catch (_) { /* navigating */ }
      },
      focus: function () {
        try { iframe.focus(); iframe.contentWindow.focus(); } catch (_) {}
      },
      dispose: function () {
        disposed = true;
        clearTimeout(aliveTimer);
        frames.delete(frame);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        el.remove();
      },
    };

    iframe.addEventListener('load', function () {
      if (disposed || html === null) return;
      loaded = true;
      var doc = frame.doc();
      syncTheme(doc);
      applyAppearance(frame);
      try { forwardKeys(iframe.contentWindow); } catch (_) {}
      var pending = queue.splice(0);
      pending.forEach(function (p) { frame.post(p); });
    });

    function showNotice(text) {
      var notice = el.querySelector('.claude-frame-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'claude-frame-notice';
        el.appendChild(notice);
      }
      notice.textContent = text;
    }

    function hideNotice() {
      var notice = el.querySelector('.claude-frame-notice');
      if (notice) notice.remove();
    }

    function useBlob() {
      loaded = false;
      blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      iframe.removeAttribute('srcdoc');
      iframe.src = blobUrl;
      aliveTimer = setTimeout(function () {
        if (!alive && !disposed) {
          showNotice('Claude UI did not start. Open Help → Toggle Developer Tools for details.');
        }
      }, ALIVE_TIMEOUT_MS);
    }

    frames.add(frame);
    applyAppearance(frame);
    loadAssets().then(function (parts) {
      if (disposed) return;
      html = buildDocument(parts[0], parts[1], {
        host: 'panel',
        page: 'chat',
        id: id,
        resume: options.resume || undefined,
        // /fork: open a copy of `resume`, and send `prompt` as its first message
        fork: options.fork || undefined,
        prompt: options.prompt || undefined,
        backend: options.backend || 'claude',
      });
      iframe.srcdoc = html;
      aliveTimer = setTimeout(function () {
        if (!alive && !disposed) useBlob();
      }, ALIVE_TIMEOUT_MS);
    }, function (error) {
      showNotice('Could not load Claude UI (' + (error && error.message ? error.message : error) +
        '). Run "npm run compile" to build dist/claude-ui.');
    });

    return frame;
  }

  window.ClaudeFrame = { create: create, setAppearance: setAppearance };
})();
