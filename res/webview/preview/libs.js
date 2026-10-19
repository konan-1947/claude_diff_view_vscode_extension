(function () {
  'use strict';

  // marked, DOMPurify and mermaid are loaded on first use: mermaid alone is ~5 MB
  // and most terminal sessions never open a preview that needs it.
  const cache = {};

  function loadScript(key, check) {
    if (check()) return Promise.resolve(check());
    if (cache[key]) return cache[key];
    cache[key] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = (window.__AI_CLI_PREVIEW_LIBS__ || {})[key];
      // Monaco's AMD loader defines window.define.amd. UMD bundles (marked, DOMPurify)
      // then register as AMD modules instead of setting their global, so hide the flag
      // while the script runs. Monaco's own modules call define() directly and are unaffected.
      const amd = window.define && window.define.amd;
      if (amd) window.define.amd = undefined;
      const restore = () => { if (amd) window.define.amd = amd; };
      script.onload = () => {
        restore();
        if (check()) resolve(check());
        else {
          delete cache[key];
          reject(new Error('Could not initialise ' + key));
        }
      };
      script.onerror = () => {
        restore();
        delete cache[key];
        reject(new Error('Could not load ' + key));
      };
      document.head.appendChild(script);
    });
    return cache[key];
  }

  window.aiCliPreviewLibs = {
    marked: () => loadScript('marked', () => window.marked),
    purify: () => loadScript('dompurify', () => window.DOMPurify),
    mermaid: () => loadScript('mermaid', () => window.mermaid),
  };
}());
