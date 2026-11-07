(function () {
  'use strict';

  const MIN_SCALE = 0.05;
  const MAX_SCALE = 40;
  let current;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, title, onClick) {
    const b = el('button', 'zoom-btn', label);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  // Intrinsic size of a cloned mermaid <svg>: its width is usually "100%", so read the viewBox.
  function prepareSvg(svg) {
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let width = vb.length === 4 ? vb[2] : parseFloat(svg.getAttribute('width'));
    let height = vb.length === 4 ? vb[3] : parseFloat(svg.getAttribute('height'));
    if (!(width > 0) || !(height > 0)) {
      const box = svg.getBoundingClientRect();
      width = box.width || 800;
      height = box.height || 600;
    }
    svg.removeAttribute('style');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.display = 'block';
    return { width, height };
  }

  function close() {
    if (!current) return;
    document.removeEventListener('keydown', current.onKey, true);
    window.removeEventListener('resize', current.onResize);
    current.root.remove();
    current = undefined;
  }

  // options: { title, src } for a raster/svg image URL, or { title, svg } for an <svg> element to clone.
  function open(options) {
    close();
    const root = el('div', 'zoom-viewer');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Image viewer');
    const bar = el('div', 'zoom-bar');
    const title = el('strong', 'zoom-title', options.title || 'Image');
    const percent = el('span', 'zoom-percent', '100%');
    const hint = el('span', 'zoom-hint', 'Scroll to zoom · drag to pan · double-click to fit / 100%');
    const stage = el('div', 'zoom-stage');
    const content = el('div', 'zoom-content');
    stage.appendChild(content);

    let natural;
    let scale = 1;
    let tx = 0;
    let ty = 0;

    function apply() {
      content.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      percent.textContent = Math.round(scale * 100) + '%';
    }

    function fit() {
      if (!natural) return;
      const area = stage.getBoundingClientRect();
      const pad = 24;
      scale = Math.min((area.width - pad) / natural.width, (area.height - pad) / natural.height);
      scale = Math.max(MIN_SCALE, Math.min(scale, options.svg ? MAX_SCALE : 1));
      tx = (area.width - natural.width * scale) / 2;
      ty = (area.height - natural.height * scale) / 2;
      apply();
    }

    // Keeps the point under (cx, cy) fixed while the scale changes.
    function zoomAt(factor, cx, cy) {
      if (!natural) return;
      const next = Math.max(MIN_SCALE, Math.min(scale * factor, MAX_SCALE));
      const ratio = next / scale;
      tx = cx - (cx - tx) * ratio;
      ty = cy - (cy - ty) * ratio;
      scale = next;
      apply();
    }

    function zoomCenter(factor) {
      const area = stage.getBoundingClientRect();
      zoomAt(factor, area.width / 2, area.height / 2);
    }

    function actual() {
      if (!natural) return;
      const area = stage.getBoundingClientRect();
      zoomAt(1 / scale, area.width / 2, area.height / 2);
    }

    bar.append(
      title,
      hint,
      button('−', 'Zoom out (-)', () => zoomCenter(1 / 1.25)),
      percent,
      button('+', 'Zoom in (+)', () => zoomCenter(1.25)),
      button('Fit', 'Fit to window (0)', fit),
      button('100%', 'Actual size (1)', actual),
      button('✕', 'Close (Esc)', close),
    );
    root.append(bar, stage);
    // Mount inside the file preview card so the viewer behaves like a tab of that file;
    // outside it (e.g. standalone) fall back to the whole webview.
    const mount = (options.anchor && options.anchor.closest('.file-preview-card')) || document.body;
    mount.appendChild(root);
    // Keep pointer events from reaching the host's click-outside / close handlers.
    ['mousedown', 'click'].forEach((type) => root.addEventListener(type, (e) => e.stopPropagation()));

    if (options.svg) {
      const clone = options.svg.cloneNode(true);
      natural = prepareSvg(clone);
      content.appendChild(clone);
      fit();
    } else {
      const img = el('img');
      img.alt = options.title || '';
      img.draggable = false;
      img.addEventListener('load', () => {
        natural = { width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
        img.width = natural.width;
        img.height = natural.height;
        fit();
      });
      img.addEventListener('error', () => {
        content.textContent = 'Could not display this image';
      });
      img.src = options.src;
      content.appendChild(img);
    }

    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    let drag;
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, tx, ty };
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', (event) => {
      if (!drag) return;
      tx = drag.tx + event.clientX - drag.x;
      ty = drag.ty + event.clientY - drag.y;
      apply();
    });
    const endDrag = () => { drag = undefined; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('dblclick', () => {
      if (Math.abs(scale - 1) < 0.01) fit(); else actual();
    });

    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); close(); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomCenter(1.25); }
      else if (event.key === '-') { event.preventDefault(); zoomCenter(1 / 1.25); }
      else if (event.key === '0') { event.preventDefault(); fit(); }
      else if (event.key === '1') { event.preventDefault(); actual(); }
    };
    const onResize = () => fit();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    current = { root, onKey, onResize };
  }

  // Click an <img> or a rendered mermaid diagram inside `root` to open it in the viewer.
  function attach(root, baseTitle) {
    root.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('a[href]')) return;
      const img = event.target.closest('img');
      if (img && img.src) {
        event.preventDefault();
        open({ src: img.currentSrc || img.src, title: img.alt || baseTitle, anchor: root });
        return;
      }
      const diagram = event.target.closest('.mermaid-diagram');
      const svg = diagram && diagram.querySelector('svg');
      if (svg) open({ svg, title: 'Mermaid diagram', anchor: root });
    });
  }

  window.aiCliZoomViewer = { open, close, attach };
}());
