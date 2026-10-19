(function () {
  'use strict';

  function formatSize(bytes) {
    if (typeof bytes !== 'number') return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function render(host, data) {
    const wrap = document.createElement('div');
    wrap.className = 'image-preview';
    const info = document.createElement('div');
    info.className = 'image-info';
    const stage = document.createElement('div');
    stage.className = 'image-stage';
    // <img>, never inline markup: an svg file may carry scripts, which an <img> will not run.
    const img = document.createElement('img');
    img.alt = data.label || '';
    img.title = 'Click to toggle fit / actual size';
    img.addEventListener('load', () => {
      const dimensions = img.naturalWidth && img.naturalHeight
        ? img.naturalWidth + ' × ' + img.naturalHeight : '';
      info.textContent = [dimensions, formatSize(data.size)].filter(Boolean).join('  ·  ');
    });
    img.addEventListener('error', () => {
      stage.textContent = '';
      const box = document.createElement('div');
      box.className = 'preview-error';
      box.textContent = 'Could not display this image';
      stage.appendChild(box);
    });
    img.addEventListener('click', () => stage.classList.toggle('actual-size'));
    img.src = data.src;
    stage.appendChild(img);
    wrap.append(info, stage);
    host.appendChild(wrap);
  }

  (window.aiCliPreviewRenderers = window.aiCliPreviewRenderers || {}).image = {
    render,
    dispose() {},
  };
}());
