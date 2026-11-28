(function () {
  'use strict';

  // OMP2 (experimental): draws omp's TUI from the Tern Surface Protocol document the
  // host keeps (src/omp2/tspEngine.ts). The program owns all state: keys go to its PTY
  // as bytes, pointer actions go back as TSP events, and every change arrives as ops.
  // Regions: main (the transcript, scrolls), dock (composer and HUD, pinned at the
  // bottom) and layer (overlays, pickers, the settings sheet).

  const GAP = { none: '0', xs: '2px', sm: '4px', md: '8px', lg: '14px', xl: '20px' };
  const ICONS = {
    check: '✓', success: '✓', done: '✓', error: '✕', close: '✕', x: '✕', warning: '⚠', info: 'ℹ',
    chev: '⌄', 'chev-down': '⌄', 'chev-right': '›', copy: '⧉', rewind: '↶', model: '◆', cpu: '◆', skill: '✦',
    history: '⟲', settings: '⚙', gear: '⚙', keyboard: '⌨', download: '↓', lightbulb: '✧', eraser: '⌫',
    plan: '☰', tokens: '#', context: '◔', 'git-branch': '⑂', folder: '▸', 'scratch-folder': '▸', file: '▤',
    search: '⌕', trash: '🗑', tools: '⚒', signIn: '→', signOut: '←', compress: '⇲', list: '≡', sparkles: '✦',
    plugins: '⧉', appearance: '◐', interaction: '⌘', memory: '◎', files: '▤', shell: '❯', tasks: '☰', providers: '☁',
  };
  const STATUS_GLYPH = { pending: '○', active: '◐', in_progress: '◐', running: '◐', done: '✓', completed: '✓', success: '✓', error: '✕', failed: '✕', abandoned: '⊘', blocked: '⚠', aborted: '⊘' };

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  // Spans: a string, or [{ t, s?, href? }]; s holds space-separated style tokens.
  function spans(value, cls) {
    const out = h('span', cls || '');
    if (value == null) return out;
    if (typeof value === 'string' || typeof value === 'number') { out.textContent = String(value); return out; }
    if (!Array.isArray(value)) return out;
    for (const sp of value) {
      if (sp == null) continue;
      if (typeof sp === 'string') { out.appendChild(document.createTextNode(sp)); continue; }
      const tokens = String(sp.s || '').split(/\s+/).filter(Boolean);
      // Nerd-font glyphs (s: icon) need a font this webview does not have.
      if (tokens.includes('icon')) continue;
      const el = h(sp.href ? 'a' : 'span', tokens.map((t) => 'ts-' + t).join(' '), String(sp.t ?? ''));
      if (tokens.includes('key')) el.className += ' tsp-kbd';
      if (sp.href) el.title = sp.href;
      out.appendChild(el);
    }
    return out;
  }

  function plainText(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map((sp) => (typeof sp === 'string' ? sp : sp && sp.t != null ? String(sp.t) : '')).join('');
    return '';
  }

  function icon(name) {
    const el = h('span', 'tsp-icon');
    const s = String(name || '');
    el.textContent = ICONS[s] || ICONS[s.split('.')[0]] || '•';
    el.dataset.name = s;
    return el;
  }

  function stripAnsi(text) {
    return String(text || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b[@-_]/g, '');
  }

  // Markdown through the preview module's lazily loaded marked + DOMPurify (preview/libs.js).
  let mdLib = null;
  let mdLoading = null;
  function renderMarkdown(el, text, onReady) {
    if (mdLib) {
      el.innerHTML = mdLib.purify.sanitize(mdLib.marked.parse(String(text || ''), { gfm: true, breaks: false }));
      return;
    }
    el.textContent = String(text || '');
    el.classList.add('tsp-pre');
    const libs = window.aiCliPreviewLibs;
    if (!libs) return;
    if (!mdLoading) {
      mdLoading = Promise.all([libs.marked(), libs.purify()]).then(([marked, purify]) => { mdLib = { marked, purify }; });
    }
    mdLoading.then(onReady, () => {});
  }

  function create(opts) {
    const id = opts.id;
    const root = h('div', 'tsp-root');
    const mainEl = h('div', 'tsp-main');
    const dockEl = h('div', 'tsp-dock');
    const layerEl = h('div', 'tsp-layer');
    const notice = h('div', 'tsp-notice');
    notice.hidden = true;
    // The keys reach omp through this field; it also takes IME composition and paste.
    const keys = document.createElement('textarea');
    keys.className = 'tsp-keys';
    keys.setAttribute('aria-label', 'omp input');
    keys.spellcheck = false;
    root.append(mainEl, dockEl, layerEl, notice, keys);

    let sf = null;
    let nodes = new Map(); // id -> { id, k, p, c: [], parent, el, box }
    let focusId = null;
    const blobs = new Map();
    let exited = false;
    let stick = true;

    const send = (data) => { if (!exited) opts.onInput(data); };
    const event = (ev) => { if (!exited) opts.onEvent(ev); };

    // ---- document -------------------------------------------------------------

    function regionEl(name) {
      return name === 'main' ? mainEl : name === 'dock' ? dockEl : name === 'layer' ? layerEl : null;
    }

    function addTree(raw, parent) {
      const n = { id: raw.id, k: raw.k, p: Object.assign({}, raw.p || {}), c: (raw.c || []).map((c) => c.id), parent, el: null, box: null };
      nodes.set(n.id, n);
      (raw.c || []).forEach((c) => addTree(c, n.id));
      return n;
    }

    function containerOf(parentId) {
      const region = regionEl(parentId);
      if (region) return region;
      const p = nodes.get(parentId);
      return p ? p.box : null;
    }

    function ensureEl(n) {
      if (!n.el) build(n);
      return n.el;
    }

    // Builds n.el; children keep their elements and move into the new box.
    function build(n) {
      const old = n.el;
      const r = render(n);
      n.el = r.el;
      n.box = r.box || null;
      n.el.dataset.id = n.id;
      if (n.p.role) n.el.dataset.role = n.p.role;
      if (n.p.hidden) n.el.style.display = 'none';
      if (n.p.title && !n.el.title && typeof n.p.title === 'string') n.el.title = n.p.title;
      if (n.p.grow) n.el.style.flexGrow = String(n.p.grow);
      if (n.p.tone) n.el.classList.add('tone-' + n.p.tone);
      if (n.id === focusId) n.el.classList.add('tsp-focus');
      bindActions(n);
      if (n.box) {
        for (const cid of n.c) {
          const child = nodes.get(cid);
          if (!child) continue;
          // Items draw their selection from the list's props: redraw them with it.
          if (n.k === 'list') build(child);
          n.box.appendChild(ensureEl(child));
        }
      }
      if (old && old.parentNode) old.parentNode.replaceChild(n.el, old);
    }

    function rebuild(id) {
      const n = nodes.get(id);
      if (n && n.el) build(n);
    }

    function place(n) {
      const box = containerOf(n.parent);
      if (!box) return;
      const el = ensureEl(n);
      const siblings = n.parent && nodes.get(n.parent) ? nodes.get(n.parent).c : (regionChildren[n.parent] || []);
      const idx = siblings.indexOf(n.id);
      let before = null;
      for (let i = idx + 1; i < siblings.length; i++) {
        const s = nodes.get(siblings[i]);
        if (s && s.el && s.el.parentNode === box) { before = s.el; break; }
      }
      box.insertBefore(el, before);
    }

    // main / dock / layer are children of the surface; their own nodes are plain cols.
    const regionChildren = {};

    function removeTree(id) {
      const n = nodes.get(id);
      if (!n) return;
      n.c.forEach(removeTree);
      nodes.delete(id);
    }

    function applyOp(op) {
      const verb = op[0];
      const id = op[1];
      switch (verb) {
        case 'add': {
          const parent = op[2];
          const before = op[3];
          const raw = op[4];
          if (!raw) return;
          if (nodes.has(raw.id)) del(raw.id);
          if (raw.id === 'main' || raw.id === 'dock' || raw.id === 'layer') {
            // A region root: its children draw straight into the region element.
            const n = addTree(raw, parent);
            n.el = regionEl(raw.id);
            n.box = n.el;
            n.c.forEach((cid) => { const child = nodes.get(cid); if (child) n.box.appendChild(ensureEl(child)); });
            return;
          }
          const n = addTree(raw, parent);
          const p = nodes.get(parent);
          if (p) {
            const at = before == null ? -1 : p.c.indexOf(before);
            if (at < 0) p.c.push(n.id); else p.c.splice(at, 0, n.id);
            if (p.box) place(n);
            else if (p.el) rebuild(p.id);
          }
          return;
        }
        case 'set': {
          const n = nodes.get(id);
          if (!n) return;
          const props = op[2] || {};
          for (const key of Object.keys(props)) {
            if (props[key] === null) delete n.p[key];
            else n.p[key] = props[key];
          }
          if (n.el && regionEl(id) !== n.el) rebuild(id);
          return;
        }
        case 'del':
          del(id);
          return;
        case 'text': {
          const n = nodes.get(id);
          if (!n) return;
          n.p.text = op[2] === 'append' ? String(n.p.text ?? '') + String(op[3] ?? '') : String(op[3] ?? '');
          rebuild(id);
          return;
        }
        case 'splice': {
          const n = nodes.get(id);
          if (!n) return;
          const s = String(n.p.text ?? '');
          n.p.text = s.slice(0, op[2]) + String(op[4] ?? '') + s.slice(op[2] + op[3]);
          rebuild(id);
          return;
        }
        case 'move': {
          const n = nodes.get(id);
          const p = nodes.get(op[2]);
          if (!n || !p) return;
          const old = nodes.get(n.parent);
          if (old) old.c = old.c.filter((c) => c !== id);
          n.parent = op[2];
          const at = op[3] == null ? -1 : p.c.indexOf(op[3]);
          if (at < 0) p.c.push(id); else p.c.splice(at, 0, id);
          if (p.box) place(n);
          return;
        }
        case 'focus': {
          const prev = focusId && nodes.get(focusId);
          focusId = id || null;
          if (prev && prev.el) rebuild(prev.id);
          if (focusId) rebuild(focusId);
          return;
        }
        case 'reveal': {
          const n = nodes.get(id);
          if (n && n.el && !mainEl.contains(n.el)) {
            try { n.el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
          }
          return;
        }
        default:
          return; // settle, scroll
      }
    }

    function del(id) {
      const n = nodes.get(id);
      if (!n) return;
      const p = nodes.get(n.parent);
      if (p) p.c = p.c.filter((c) => c !== id);
      if (n.el && !regionEl(id)) n.el.remove();
      removeTree(id);
    }

    // ---- rendering -------------------------------------------------------------

    function bindActions(n) {
      const actions = n.p.actions;
      if (!actions || typeof actions !== 'object' || n.k === 'item' || n.k === 'picker' || n.k === 'prefs') return;
      if (actions.click) {
        n.el.classList.add('tsp-act');
        n.el.addEventListener('click', (e) => { e.stopPropagation(); runAction(n, actions.click, e); });
      }
      if (actions.dblclick) {
        n.el.addEventListener('dblclick', (e) => { e.stopPropagation(); runAction(n, actions.dblclick, e); });
      }
    }

    function mods(e) {
      const m = [];
      if (e && e.shiftKey) m.push('shift');
      if (e && e.ctrlKey) m.push('ctrl');
      if (e && e.altKey) m.push('alt');
      if (e && e.metaKey) m.push('meta');
      return m.length ? m : undefined;
    }

    function runAction(n, act, e) {
      if (act === 'toggle') { toggle(n); return; }
      if (act === 'copy') { navigator.clipboard.writeText(n.el.innerText || '').catch(() => {}); return; }
      if (act === 'open' || act === 'zoom') return;
      if (act === 'select' || act === 'activate') { event({ ev: act, id: n.id, item: n.id }); return; }
      const eq = String(act).indexOf('=');
      const ev = { ev: 'action', id: n.id, act: eq >= 0 ? act.slice(0, eq) : act };
      if (eq >= 0) ev.value = act.slice(eq + 1);
      const m = mods(e);
      if (m) ev.mods = m;
      event(ev);
    }

    function toggle(n) {
      n.p.collapsed = !n.p.collapsed;
      rebuild(n.id);
      const ev = { ev: 'toggle', id: n.id, collapsed: !!n.p.collapsed };
      if (n.p.key) ev.key = n.p.key;
      event(ev);
    }

    function flex(el, p, dir) {
      el.style.display = 'flex';
      el.style.flexDirection = dir;
      el.style.gap = GAP[p.gap] ?? (dir === 'row' ? '6px' : '4px');
      if (p.align) el.style.alignItems = p.align === 'start' ? 'flex-start' : p.align === 'end' ? 'flex-end' : p.align;
      if (p.justify) el.style.justifyContent = p.justify === 'start' ? 'flex-start' : p.justify === 'end' ? 'flex-end' : p.justify === 'between' ? 'space-between' : p.justify;
      if (dir === 'row' && p.wrap !== false) el.style.flexWrap = 'wrap';
    }

    function textBlock(cls, text, p) {
      const el = h('pre', cls);
      el.textContent = text;
      if (p && p.preview && p.preview.lines) {
        el.style.maxHeight = (p.preview.lines * 1.45 + 0.6) + 'em';
        el.classList.add('tsp-clip');
        el.title = 'Click to show all';
        el.addEventListener('click', () => el.classList.toggle('tsp-clip-open'));
      }
      return el;
    }

    function statusGlyph(status) {
      const s = String(status || '');
      if (s === 'running' || s === 'pending') return h('span', 'tsp-spin');
      return h('span', 'tsp-st st-' + s, STATUS_GLYPH[s] || '');
    }

    function render(n) {
      const p = n.p;
      switch (n.k) {
        case 'col': case 'block': case 'scroll': {
          const el = h('div', 'tsp-col');
          flex(el, p, 'column');
          return { el, box: el };
        }
        case 'row': {
          const el = h('div', 'tsp-row');
          flex(el, p, 'row');
          return { el, box: el };
        }
        case 'spacer': {
          const el = h('div', 'tsp-spacer');
          if (!p.grow) el.style.height = p.size === 'lg' ? '14px' : p.size === 'md' ? '8px' : '4px';
          return { el };
        }
        case 'rule': {
          const el = h('div', 'tsp-rule');
          if (p.text || p.label) el.appendChild(spans(p.text || p.label));
          return { el };
        }
        case 'card': case 'section': case 'message': {
          const el = h('div', 'tsp-' + (n.k === 'section' ? 'section' : 'card'));
          if (p.head) {
            const head = h('div', 'tsp-card-head');
            if (p.icon) head.appendChild(icon(p.icon));
            head.appendChild(spans(p.head));
            if (p.status) head.appendChild(statusGlyph(p.status));
            if (p.collapsible || n.k === 'section') {
              head.classList.add('tsp-act');
              head.addEventListener('click', () => toggle(n));
            }
            el.appendChild(head);
          }
          const box = h('div', 'tsp-card-body');
          flex(box, p, 'column');
          if (p.collapsed) box.style.display = 'none';
          el.appendChild(box);
          return { el, box };
        }
        case 'overlay': {
          const el = h('div', 'tsp-overlay');
          const anchor = p.anchor;
          el.classList.add(anchor && typeof anchor === 'object' ? 'anchored' : 'centered');
          if (p.modal) el.classList.add('modal');
          if (p.size) el.classList.add('sz-' + p.size);
          const panel = h('div', 'tsp-overlay-panel');
          if (p.head) panel.appendChild(spans(p.head, 'tsp-overlay-head'));
          const box = h('div', 'tsp-overlay-body');
          flex(box, p, 'column');
          panel.appendChild(box);
          el.appendChild(panel);
          return { el, box };
        }
        case 'text': case 'shimmer': {
          const el = h('span', 'tsp-text' + (n.k === 'shimmer' ? ' tsp-shimmer' : ''));
          if (p.spans) el.appendChild(spans(p.spans));
          else el.textContent = String(p.text ?? '');
          if (p.wrap === 'none' || p.truncate) el.classList.add('tsp-nowrap');
          return { el };
        }
        case 'md': {
          const el = h('div', 'tsp-md');
          renderMarkdown(el, p.text, () => rebuild(n.id));
          return { el };
        }
        case 'code': {
          const el = h('div', 'tsp-code');
          if (p.path) el.appendChild(h('div', 'tsp-code-path', p.path));
          el.appendChild(textBlock('tsp-pre', String(p.text ?? ''), p));
          return { el };
        }
        case 'ansi':
          return { el: textBlock('tsp-pre tsp-ansi', stripAnsi(p.text), p) };
        case 'rows':
          return { el: textBlock('tsp-pre tsp-ansi', stripAnsi(Array.isArray(p.rows) ? p.rows.join('\n') : p.text), p) };
        case 'diff': {
          const el = h('div', 'tsp-diff');
          if (p.path) el.appendChild(h('div', 'tsp-code-path', p.path));
          const pre = h('pre', 'tsp-pre');
          const lines = [];
          if (Array.isArray(p.hunks)) {
            for (const hunk of p.hunks) {
              lines.push('@@ -' + (hunk.oldStart ?? '') + ' +' + (hunk.newStart ?? '') + ' @@');
              (hunk.lines || []).forEach((l) => lines.push(l));
            }
          } else if (p.text) lines.push(...String(p.text).split('\n'));
          for (const l of lines) {
            const row = h('div', l.startsWith('+') ? 'd-add' : l.startsWith('-') ? 'd-del' : l.startsWith('@@') ? 'd-hunk' : 'd-ctx', l || ' ');
            pre.appendChild(row);
          }
          el.appendChild(pre);
          return { el };
        }
        case 'icon':
          return { el: icon(p.name) };
        case 'image': {
          if (p.blob && blobs.has(p.blob)) {
            const b = blobs.get(p.blob);
            const img = document.createElement('img');
            img.className = 'tsp-img';
            img.src = 'data:' + (b.mime || 'image/png') + ';base64,' + b.data;
            if (p.w) img.style.maxWidth = p.w + 'px';
            return { el: img };
          }
          const el = h('span', 'tsp-logo' + (p.builtin ? ' builtin' : ''), p.builtin === 'omp' ? 'π' : (p.alt || 'image'));
          if (p.w && p.w > 40) el.classList.add('big');
          return { el };
        }
        case 'kbd': {
          const el = h('span', 'tsp-kbds');
          (p.keys || []).forEach((k) => el.appendChild(h('kbd', 'tsp-kbd', String(k))));
          if (p.label) el.appendChild(spans(p.label));
          return { el };
        }
        case 'badge':
          return { el: h('span', 'tsp-badge', plainText(p.text || p.label)) };
        case 'kv': {
          const el = h('div', 'tsp-kv');
          for (const it of p.items || []) {
            el.appendChild(spans(it.k, 'k'));
            el.appendChild(spans(it.v, 'v'));
          }
          return { el };
        }
        case 'stats': {
          const el = h('div', 'tsp-row');
          flex(el, { gap: 'lg' }, 'row');
          for (const tile of p.items || p.tiles || []) {
            const t = h('div', 'tsp-stat');
            t.appendChild(spans(tile.label, 'l'));
            t.appendChild(spans(tile.value, 'v'));
            if (tile.sub) t.appendChild(spans(tile.sub, 's'));
            el.appendChild(t);
          }
          return { el };
        }
        case 'table': {
          const el = h('table', 'tsp-table');
          const cols = p.cols || [];
          if (cols.some((c) => c.head)) {
            const tr = h('tr');
            cols.forEach((c) => tr.appendChild(h('th', '', plainText(c.head))));
            el.appendChild(tr);
          }
          for (const row of p.rows || []) {
            const tr = h('tr');
            cols.forEach((c) => { const td = h('td'); td.appendChild(spans(row.cells ? row.cells[c.id] : '')); tr.appendChild(td); });
            if (p.selectable) {
              tr.classList.add('tsp-act');
              if (p.selected === row.id) tr.classList.add('sel');
              tr.addEventListener('click', () => event({ ev: 'select', id: n.id, item: row.id }));
              tr.addEventListener('dblclick', () => event({ ev: 'activate', id: n.id, item: row.id }));
            }
            el.appendChild(tr);
          }
          return { el };
        }
        case 'tabs': {
          const el = h('div', 'tsp-tabs');
          for (const it of p.items || []) {
            const b = h('button', 'tsp-tab' + (it.id === p.active ? ' on' : ''), plainText(it.label));
            b.type = 'button';
            b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'select', id: n.id, item: it.id }); });
            el.appendChild(b);
          }
          return { el };
        }
        case 'list': {
          const el = h('div', 'tsp-list');
          if (p.max && p.max.lines) el.style.maxHeight = (p.max.lines * 26) + 'px';
          if (!n.c.length && p.empty) el.appendChild(spans(p.empty, 'tsp-empty'));
          return { el, box: el };
        }
        case 'item': {
          const list = nodes.get(n.parent);
          const el = h('div', 'tsp-item');
          if (list && list.p.selected === n.id) el.classList.add('sel');
          if (p.icon) el.appendChild(icon(p.icon));
          el.appendChild(spans(p.label, 'lbl'));
          if (p.detail) el.appendChild(spans(p.detail, 'det'));
          if (p.value) el.appendChild(spans(p.value, 'val'));
          if (p.disabled) el.classList.add('off');
          const listId = list ? list.id : n.id;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (p.actions && p.actions.click) { runAction(n, p.actions.click, e); return; }
            event({ ev: 'select', id: listId, item: n.id });
          });
          el.addEventListener('dblclick', (e) => { e.stopPropagation(); event({ ev: 'activate', id: listId, item: n.id }); });
          return { el };
        }
        case 'editor': case 'input': {
          const el = h('div', 'tsp-editor');
          const text = String(p.text ?? '');
          if (!text && p.placeholder) el.appendChild(spans(p.placeholder, 'ph'));
          const focused = focusId === n.id;
          const cur = Math.max(0, Math.min(text.length, p.cursor ?? text.length));
          el.appendChild(document.createTextNode(text.slice(0, focused ? cur : text.length)));
          if (focused) el.appendChild(h('span', 'tsp-caret'));
          if (focused) el.appendChild(document.createTextNode(text.slice(cur)));
          el.addEventListener('click', () => event({ ev: 'focus', id: n.id }));
          return { el };
        }
        case 'button': {
          const el = h('button', 'tsp-btn' + (p.variant ? ' v-' + p.variant : ''));
          el.type = 'button';
          if (p.icon) el.appendChild(icon(p.icon));
          el.appendChild(spans(p.text ?? p.label ?? ''));
          if (p.disabled) el.disabled = true;
          if (!(p.actions && p.actions.click)) {
            el.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: 'click' }); });
          }
          return { el };
        }
        case 'status': {
          const el = h('div', 'tsp-status' + (p.transparent ? ' transparent' : ''));
          return { el, box: el };
        }
        case 'seg': {
          const el = h('span', 'tsp-seg' + (p.side === 'right' ? ' right' : ''));
          if (p.icon) el.appendChild(icon(p.icon));
          el.appendChild(spans(p.spans || p.text));
          return { el };
        }
        case 'meter': case 'progress': {
          const el = h('span', 'tsp-meter');
          const bar = h('span', 'bar');
          const fill = h('span', 'fill');
          const v = Math.max(0, Math.min(1, Number(p.value) || 0));
          fill.style.width = (v * 100) + '%';
          const th = p.thresholds || {};
          if (th.bad != null && v >= th.bad) fill.classList.add('bad');
          else if (th.warn != null && v >= th.warn) fill.classList.add('warn');
          bar.appendChild(fill);
          el.appendChild(bar);
          if (p.label) el.appendChild(spans(p.label, 'lbl'));
          return { el };
        }
        case 'effort': {
          // A glyph only: omp prints the level's name next to it.
          const levels = { off: 0, minimal: 1, low: 1, medium: 2, high: 3, xhigh: 4, max: 4, auto: -1 };
          const lv = levels[p.level] ?? -1;
          const el = h('span', 'tsp-effort', lv < 0 ? '◌' : '▮'.repeat(lv) + '▯'.repeat(4 - lv));
          el.title = 'Effort: ' + String(p.level || '');
          return { el };
        }
        case 'spinner': {
          const el = h('span', 'tsp-spinner');
          el.appendChild(h('span', 'tsp-spin'));
          if (p.label) el.appendChild(spans(p.label));
          return { el };
        }
        case 'elapsed': {
          const el = h('span', 'tsp-elapsed');
          el.dataset.start = String(Date.now() - (Number(p.age) || 0));
          el.textContent = fmtElapsed(Number(p.age) || 0);
          return { el };
        }
        case 'rate':
          return { el: h('span', 'tsp-rate', (p.value != null ? p.value : '') + ' ' + (p.unit || '')) };
        case 'chart': {
          const el = h('span', 'tsp-chart');
          const series = (p.series || []).map((s) => Number(s.value ?? s) || 0);
          const max = Math.max(1e-9, ...series);
          series.slice(-40).forEach((v) => { const b = h('i'); b.style.height = Math.max(1, (v / max) * 18) + 'px'; el.appendChild(b); });
          return { el };
        }
        case 'checklist':
          return { el: renderChecklist(p) };
        case 'tool':
          return renderTool(n);
        case 'agent': {
          const el = h('div', 'tsp-agent');
          const head = h('div', 'tsp-agent-head');
          head.appendChild(statusGlyph(p.status));
          head.appendChild(h('span', 'name', String(p.name || '')));
          if (p.agent) head.appendChild(h('span', 'tsp-badge', String(p.agent)));
          if (p.model) head.appendChild(spans(p.model, 'ts-dim'));
          el.appendChild(head);
          if (p.task) el.appendChild(h('div', 'tsp-agent-task', String(p.task)));
          const box = h('div', 'tsp-col');
          el.appendChild(box);
          return { el, box };
        }
        case 'picker':
          return renderPicker(n);
        case 'prefs':
          return renderPrefs(n);
        case 'questions': case 'suggestions': case 'trace': case 'stacktrace':
        default: {
          // Unknown kind: its text, then its children.
          const el = h('div', 'tsp-unknown');
          el.dataset.kind = n.k;
          const txt = plainText(p.text || p.label || p.head || p.spans);
          if (txt) el.appendChild(h('span', '', txt));
          const box = h('div', 'tsp-col');
          el.appendChild(box);
          return { el, box };
        }
      }
    }

    function renderChecklist(p) {
      const el = h('div', 'tsp-checklist mode-' + (p.mode || 'full'));
      const phases = p.phases || [];
      if (p.mode === 'hud') {
        const items = phases.flatMap((ph) => ph.items || []);
        const done = items.filter((it) => it.status === 'completed' || it.status === 'done').length;
        const active = items.find((it) => it.status === 'active' || it.status === 'in_progress');
        el.appendChild(h('span', 'tsp-badge', 'Todos ' + done + '/' + items.length));
        if (active) el.appendChild(h('span', 'ts-muted', active.text));
        return el;
      }
      if (p.note) el.appendChild(h('div', 'ts-dim', String(p.note)));
      for (const ph of phases) {
        if (ph.title) el.appendChild(h('div', 'ph', ph.title));
        for (const it of ph.items || []) {
          const row = h('div', 'it st-' + (it.status || 'pending'));
          row.appendChild(h('span', 'g', STATUS_GLYPH[it.status] || '○'));
          row.appendChild(h('span', '', String(it.text || '')));
          el.appendChild(row);
        }
      }
      return el;
    }

    function renderTool(n) {
      const p = n.p;
      const el = h('div', 'tsp-tool frame-' + (p.frame || 'card') + ' st-' + (p.status || ''));
      const head = h('div', 'tsp-tool-head');
      head.appendChild(statusGlyph(p.status));
      head.appendChild(h('span', 'title', String(p.title || p.name || 'Tool')));
      const target = p.command && p.command !== '…' ? p.command : p.target;
      if (target && target !== '…') head.appendChild(h('span', 'target', plainText(target)));
      if (p.intent && p.intent !== target) head.appendChild(h('span', 'intent', String(p.intent)));
      // took is in ms
      if (p.took) head.appendChild(h('span', 'ts-dim', Number(p.took) < 1000 ? Math.round(Number(p.took)) + 'ms' : fmtElapsed(Number(p.took))));
      el.appendChild(head);
      const box = h('div', 'tsp-tool-body');
      flex(box, { gap: 'sm' }, 'column');
      if (p.collapsible) {
        head.classList.add('tsp-act');
        head.appendChild(h('span', 'chev', p.collapsed ? '›' : '⌄'));
        head.addEventListener('click', (e) => { e.stopPropagation(); toggle(n); });
        if (p.collapsed) box.style.display = 'none';
      }
      el.appendChild(box);
      return { el, box };
    }

    function renderPicker(n) {
      const p = n.p;
      const el = h('div', 'tsp-picker sz-' + (p.size || 'lg'));
      const sheet = h('div', 'pk-sheet');
      el.appendChild(sheet);
      const head = h('div', 'pk-head');
      if (p.icon) head.appendChild(icon(p.icon));
      if (p.title) head.appendChild(spans(p.title, 'pk-title'));
      if (p.query != null) {
        const q = h('div', 'pk-search');
        const query = String(p.query);
        if (!query) q.appendChild(h('span', 'ph', p.placeholder || ('Search ' + (p.noun || 'items') + '…')));
        const cur = Math.max(0, Math.min(query.length, p.cursor ?? query.length));
        q.appendChild(document.createTextNode(query.slice(0, cur)));
        if (!p.focus || p.focus === 'list') q.appendChild(h('span', 'tsp-caret'));
        q.appendChild(document.createTextNode(query.slice(cur)));
        head.appendChild(q);
      }
      const esc = h('button', 'pk-esc', 'esc');
      esc.type = 'button';
      esc.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: 'close' }); });
      head.appendChild(esc);
      sheet.appendChild(head);
      const body = h('div', 'pk-body');
      if (Array.isArray(p.scopes) && p.scopes.length) {
        const scopes = h('div', 'pk-scopes');
        let group = null;
        for (const s of p.scopes) {
          if (s.group && s.group !== group) { group = s.group; scopes.appendChild(h('div', 'pk-sgh', group)); }
          const b = h('div', 'pk-scope' + (s.id === p.scope ? ' on' : '') + (s.disabled ? ' off' : ''), plainText(s.label));
          if (s.count != null) b.appendChild(h('span', 'n', String(s.count)));
          if (s.disabled) b.title = s.disabled;
          b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: 'scope', value: s.id }); });
          scopes.appendChild(b);
        }
        body.appendChild(scopes);
      }
      const center = h('div', 'pk-center');
      if (Array.isArray(p.tabs) && p.tabs.length) {
        const tabs = h('div', 'tsp-tabs');
        for (const t of p.tabs) {
          const b = h('button', 'tsp-tab' + (t.id === p.tab ? ' on' : ''), plainText(t.label));
          b.type = 'button';
          b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: 'tab', value: t.id }); });
          tabs.appendChild(b);
        }
        center.appendChild(tabs);
      }
      const rows = h('div', 'pk-rows');
      const items = new Map();
      const list = Array.isArray(p.items) ? p.items : p.items && typeof p.items === 'object' ? Object.values(p.items) : [];
      list.forEach((it) => { if (it && it.id) items.set(it.id, it); });
      const order = Array.isArray(p.order) && p.order.length ? p.order : Array.from(items.keys());
      const current = new Set(p.current || []);
      let selEl = null;
      for (const entry of order) {
        if (entry && typeof entry === 'object') {
          const g = h('div', 'pk-grp', plainText(entry.label));
          if (entry.count != null) g.appendChild(h('span', 'n', String(entry.count)));
          rows.appendChild(g);
          continue;
        }
        const it = items.get(entry);
        if (!it) continue;
        const row = h('div', 'pk-row' + (it.id === p.selected ? ' sel' : '') + (it.disabled ? ' off' : ''));
        if (it.depth) row.style.paddingLeft = (8 + it.depth * 14) + 'px';
        if (it.mark) row.appendChild(h('span', 'pk-mark', String(it.mark.text || '').slice(0, 2)));
        else if (it.icon) row.appendChild(icon(it.icon));
        else if (it.dot) row.appendChild(h('span', 'pk-dot tone-' + it.dot));
        row.appendChild(spans(it.label, 'pk-label' + (it.mono ? ' ts-mono' : '')));
        if (it.detail) row.appendChild(spans(it.detail, 'pk-detail'));
        if (it.facts && Array.isArray(p.columns)) {
          for (const col of p.columns) {
            const v = it.facts[col.id];
            if (v != null) row.appendChild(spans(typeof v === 'number' ? compactNumber(v) : v, 'pk-fact'));
          }
        }
        if (current.has(it.id)) row.appendChild(h('span', 'pk-cur', '✓'));
        if (it.disabled && typeof it.disabled === 'string') row.title = it.disabled;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          event({ ev: it.id === p.selected ? 'activate' : 'select', id: n.id, item: it.id });
        });
        row.addEventListener('dblclick', (e) => { e.stopPropagation(); event({ ev: 'activate', id: n.id, item: it.id }); });
        if (it.id === p.selected) selEl = row;
        rows.appendChild(row);
      }
      if (!rows.childNodes.length) {
        rows.appendChild(spans(p.state === 'loading' ? 'Loading…' : p.state === 'error' ? p.message : (p.empty || ('No ' + (p.noun || 'items'))), 'tsp-empty'));
      }
      center.appendChild(rows);
      body.appendChild(center);
      const preview = h('div', 'pk-pv');
      if (p.preview === 'none') preview.hidden = true;
      body.appendChild(preview);
      sheet.appendChild(body);
      if (Array.isArray(p.actions) && p.actions.length) {
        const bar = h('div', 'pk-bar');
        for (const a of p.actions) {
          if (a.end) bar.appendChild(h('span', 'fill'));
          const b = h('button', 'tsp-btn' + (a.primary ? ' v-primary' : ''), String(a.label || a.id));
          b.type = 'button';
          if (a.keys) b.title = a.keys.join('+');
          b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: a.id }); });
          bar.appendChild(b);
        }
        sheet.appendChild(bar);
      }
      if (selEl) requestAnimationFrame(() => { try { selEl.scrollIntoView({ block: 'nearest' }); } catch (_) {} });
      return { el, box: preview };
    }

    function renderPrefs(n) {
      const p = n.p;
      const el = h('div', 'tsp-prefs');
      const nav = h('div', 'pf-nav');
      const brand = h('div', 'pf-brand');
      brand.appendChild(h('span', '', String(p.title || 'Settings')));
      const close = h('button', 'pk-esc', 'Close');
      close.type = 'button';
      close.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: 'close' }); });
      brand.appendChild(close);
      el.appendChild(brand);
      let group = null;
      for (const pg of p.pages || []) {
        if (pg.group && pg.group !== group) { group = pg.group; nav.appendChild(h('div', 'pf-group', group)); }
        const b = h('div', 'pf-page' + (pg.id === p.page ? ' on' : '') + (pg.disabled ? ' off' : ''));
        b.appendChild(icon(pg.icon || 'settings'));
        b.appendChild(h('span', '', String(pg.label || pg.id)));
        if (pg.changed) b.appendChild(h('span', 'n', String(pg.changed)));
        b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: 'page', value: pg.id }); });
        nav.appendChild(b);
      }
      const doc = h('div', 'pf-doc');
      if (p.lead) doc.appendChild(h('div', 'pf-lead', String(p.lead)));
      for (const sec of p.sections || []) {
        if (!sec.rows || !sec.rows.length) continue;
        if (sec.title) doc.appendChild(h('div', 'pf-sec', String(sec.title)));
        for (const row of sec.rows) doc.appendChild(prefsRow(n, row, p));
      }
      const box = h('div', 'tsp-col');
      doc.appendChild(box);
      const main = h('div', 'pf-main');
      main.append(nav, doc);
      el.appendChild(main);
      return { el, box };
    }

    function prefsRow(n, row, p) {
      const el = h('div', 'pf-row' + (p.focus === row.id ? ' tsp-focus' : '') + (row.disabled ? ' off' : ''));
      const lab = h('div', 'pf-lab');
      lab.appendChild(h('div', 'l', (row.changed ? '● ' : '') + String(row.label || row.id)));
      if (row.hint) lab.appendChild(h('div', 'hint', String(row.hint)));
      if (row.warning) lab.appendChild(h('div', 'warn', '⚠ ' + row.warning));
      if (row.disabled) lab.appendChild(h('div', 'hint', String(row.disabled)));
      el.appendChild(lab);
      const c = row.control || {};
      const ctl = h('div', 'pf-ctl');
      const change = (value) => event({ ev: 'change', id: n.id, item: row.id, value });
      const editing = p.editing && p.editing.row === row.id;
      if (c.k === 'switch') {
        const b = h('button', 'pf-sw' + (c.on ? ' on' : ''), c.on ? 'On' : 'Off');
        b.type = 'button';
        b.addEventListener('click', (e) => { e.stopPropagation(); change(!c.on); });
        ctl.appendChild(b);
      } else if (c.k === 'choice') {
        const opts = c.options || [];
        const segmented = c.style === 'segmented' || (c.style !== 'menu' && opts.length >= 2 && opts.length <= 4 && opts.reduce((a, o) => a + String(o.label ?? o.value).length, 0) <= 28);
        if (segmented) {
          const seg = h('div', 'tsp-tabs');
          for (const o of opts) {
            const b = h('button', 'tsp-tab' + (o.value === c.value ? ' on' : ''), String(o.label ?? o.value));
            b.type = 'button';
            b.addEventListener('click', (e) => { e.stopPropagation(); change(o.value); });
            seg.appendChild(b);
          }
          ctl.appendChild(seg);
        } else {
          const cur = opts.find((o) => o.value === c.value);
          const b = h('button', 'pf-pick', String(cur ? (cur.label ?? cur.value) : (c.value ?? '')) + ' ⌄');
          b.type = 'button';
          b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'activate', id: n.id, item: row.id }); });
          ctl.appendChild(b);
          if (editing) {
            const menu = h('div', 'pf-menu');
            for (const o of opts) {
              const it = h('div', 'pf-opt' + (o.value === (p.editing.option ?? c.value) ? ' sel' : ''), String(o.label ?? o.value));
              it.addEventListener('click', (e) => { e.stopPropagation(); change(o.value); });
              menu.appendChild(it);
            }
            ctl.appendChild(menu);
          }
        }
      } else if (c.k === 'number') {
        const minus = h('button', 'tsp-btn', '−');
        const plus = h('button', 'tsp-btn', '+');
        const step = c.step || 1;
        const val = Number(c.value) || 0;
        minus.addEventListener('click', (e) => { e.stopPropagation(); change(c.min != null ? Math.max(c.min, val - step) : val - step); });
        plus.addEventListener('click', (e) => { e.stopPropagation(); change(c.max != null ? Math.min(c.max, val + step) : val + step); });
        const label = c.labels && c.labels[String(val)] ? c.labels[String(val)] : val + (c.unit ? ' ' + c.unit : '');
        ctl.append(minus, h('span', 'pf-num', String(label)), plus);
      } else if (c.k === 'text') {
        const shown = editing ? String(p.editing.draft ?? '') : c.secret && c.value ? '••••••' : String(c.value || c.placeholder || 'Not set');
        const b = h('button', 'pf-in' + (c.value || editing ? '' : ' ph'), shown);
        b.type = 'button';
        b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'activate', id: n.id, item: row.id }); });
        ctl.appendChild(b);
      } else if (c.k === 'keys') {
        for (const chord of c.keys || []) {
          const k = h('span', 'tsp-kbds');
          (chord || []).forEach((key) => k.appendChild(h('kbd', 'tsp-kbd', String(key))));
          ctl.appendChild(k);
        }
      } else if (c.k === 'multi') {
        const on = new Set(c.values || []);
        for (const o of c.options || []) {
          const v = o.value ?? o;
          const b = h('button', 'pf-chip' + (on.has(v) ? ' on' : ''), String(o.label ?? v));
          b.type = 'button';
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const next = on.has(v) ? (c.values || []).filter((x) => x !== v) : [...(c.values || []), v];
            change(next);
          });
          ctl.appendChild(b);
        }
      } else if (c.k === 'action') {
        const b = h('button', 'tsp-btn', String(c.label || 'Edit…'));
        b.type = 'button';
        b.addEventListener('click', (e) => { e.stopPropagation(); event({ ev: 'action', id: n.id, act: c.act || 'edit', value: row.id }); });
        ctl.appendChild(b);
      }
      el.appendChild(ctl);
      el.addEventListener('click', () => event({ ev: 'select', id: n.id, item: row.id }));
      return el;
    }

    function compactNumber(v) {
      const a = Math.abs(v);
      if (a >= 1e6) return +(v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
      if (a >= 1e3) return +(v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
      return String(v);
    }

    function fmtElapsed(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      if (m < 60) return m + 'm' + String(s % 60).padStart(2, '0') + 's';
      return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'm';
    }

    const ticker = setInterval(() => {
      root.querySelectorAll('.tsp-elapsed').forEach((el) => {
        el.textContent = fmtElapsed(Date.now() - Number(el.dataset.start || Date.now()));
      });
    }, 1000);

    // ---- incoming ---------------------------------------------------------------

    function clearAll() {
      nodes = new Map();
      focusId = null;
      mainEl.textContent = '';
      dockEl.textContent = '';
      layerEl.textContent = '';
    }

    function reset(snap) {
      clearAll();
      sf = snap ? snap.sf : null;
      if (!snap) return;
      for (const [bid, b] of Object.entries(snap.blobs || {})) blobs.set(bid, b);
      for (const [nid, raw] of Object.entries(snap.nodes || {})) {
        nodes.set(nid, { id: nid, k: raw.k, p: Object.assign({}, raw.p), c: raw.c.slice(), parent: raw.parent, el: null, box: null });
      }
      focusId = snap.focus || null;
      for (const region of ['main', 'dock', 'layer']) {
        const n = nodes.get(region);
        if (!n) continue;
        n.el = regionEl(region);
        n.box = n.el;
        n.c.forEach((cid) => { const child = nodes.get(cid); if (child) n.box.appendChild(ensureEl(child)); });
      }
      stick = true;
      requestAnimationFrame(() => { mainEl.scrollTop = mainEl.scrollHeight; });
    }

    function apply(msg) {
      if (!msg) return;
      if (msg.t === 'reset') { reset(msg.snap); return; }
      if (msg.t === 'blob') { blobs.set(msg.id, { mime: msg.mime, data: msg.data }); return; }
      if (msg.t !== 'ops') return;
      const atBottom = mainEl.scrollHeight - mainEl.scrollTop - mainEl.clientHeight < 48;
      for (const op of msg.ops || []) {
        try { applyOp(op); } catch (err) { console.warn('[omp2] op failed', op && op[0], err); }
      }
      if (stick || atBottom) mainEl.scrollTop = mainEl.scrollHeight;
      root.style.setProperty('--tsp-dock-h', dockEl.offsetHeight + 'px');
      layerEl.classList.toggle('has-content', layerEl.childElementCount > 0 && Array.from(layerEl.children).some((c) => c.style.display !== 'none'));
    }

    mainEl.addEventListener('scroll', () => {
      stick = mainEl.scrollHeight - mainEl.scrollTop - mainEl.clientHeight < 48;
    });

    // ---- keys --------------------------------------------------------------------

    const CSI = '\x1b[';
    function modParam(e) {
      return 1 + (e.shiftKey ? 1 : 0) + (e.altKey ? 2 : 0) + (e.ctrlKey ? 4 : 0);
    }
    function encodeKey(e) {
      const m = modParam(e);
      const withMod = (base, final) => (m > 1 ? CSI + base + ';' + m + final : CSI + (base === '1' ? '' : base) + final);
      switch (e.key) {
        case 'Enter':
          if (e.ctrlKey || e.shiftKey) return CSI + '27;' + m + ';13~'; // modifyOtherKeys (omp enables level 2)
          return e.altKey ? '\x1b\r' : '\r';
        case 'Tab': return e.shiftKey ? CSI + 'Z' : '\t';
        case 'Backspace': return e.ctrlKey ? '\x08' : e.altKey ? '\x1b\x7f' : '\x7f';
        case 'Escape': return '\x1b';
        case 'ArrowUp': return withMod('1', 'A');
        case 'ArrowDown': return withMod('1', 'B');
        case 'ArrowRight': return withMod('1', 'C');
        case 'ArrowLeft': return withMod('1', 'D');
        case 'Home': return withMod('1', 'H');
        case 'End': return withMod('1', 'F');
        case 'Delete': return m > 1 ? CSI + '3;' + m + '~' : CSI + '3~';
        case 'Insert': return CSI + '2~';
        case 'PageUp': return m > 1 ? CSI + '5;' + m + '~' : CSI + '5~';
        case 'PageDown': return m > 1 ? CSI + '6;' + m + '~' : CSI + '6~';
        default: break;
      }
      if (e.key.length === 1) {
        if (e.ctrlKey && !e.altKey && !e.metaKey) {
          const c = e.key.toLowerCase();
          if (c >= 'a' && c <= 'z') return String.fromCharCode(c.charCodeAt(0) - 96);
          if (c === ' ' || c === '@') return '\x00';
          if (c === '[') return '\x1b';
          if (c === '\\') return '\x1c';
          if (c === ']') return '\x1d';
          return null;
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey) return '\x1b' + e.key;
      }
      return null;
    }

    keys.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      // Copy a mouse selection instead of sending ^C.
      if (ctrlOrMeta && (e.key === 'c' || e.key === 'C')) {
        const sel = String(window.getSelection() || '');
        if (sel) { navigator.clipboard.writeText(sel).catch(() => {}); e.preventDefault(); return; }
      }
      if (ctrlOrMeta && !e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) send('\x1b[200~' + text + '\x1b[201~');
          else send('\x16');
        }).catch(() => send('\x16'));
        return;
      }
      // Leave VS Code's own chords alone (Ctrl+Shift+…, Ctrl+Tab, Ctrl+PageUp/Down, Meta).
      if (e.metaKey) return;
      if (e.ctrlKey && e.shiftKey && e.key !== 'Enter' && !/^Arrow|^Home$|^End$|^Delete$/.test(e.key)) return;
      if (e.ctrlKey && (e.key === 'Tab' || e.key === 'PageUp' || e.key === 'PageDown')) return;
      // PgUp/PgDn page the transcript while no overlay takes them.
      if ((e.key === 'PageUp' || e.key === 'PageDown') && !e.ctrlKey && !e.shiftKey && !layerEl.classList.contains('has-content')) {
        mainEl.scrollBy({ top: (e.key === 'PageUp' ? -1 : 1) * (mainEl.clientHeight - 40) });
        e.preventDefault();
        return;
      }
      const seq = encodeKey(e);
      if (seq == null) return; // printable: arrives through the input event
      e.preventDefault();
      e.stopPropagation();
      send(seq);
    });
    keys.addEventListener('input', (e) => {
      if (e.isComposing) return;
      const text = keys.value;
      keys.value = '';
      if (text) send(text);
    });
    keys.addEventListener('compositionend', () => {
      const text = keys.value;
      keys.value = '';
      if (text) send(text);
    });
    keys.addEventListener('paste', (e) => { e.preventDefault(); e.stopPropagation(); });

    root.addEventListener('mouseup', () => {
      // Keep a text selection (to copy); otherwise give the keys back to omp.
      if (!String(window.getSelection() || '')) focus();
    });

    function focus() {
      try { keys.focus({ preventScroll: true }); } catch (_) {}
    }

    function setExited(code, onRestart) {
      exited = true;
      notice.hidden = false;
      notice.textContent = '';
      notice.appendChild(h('span', '', 'omp exited (' + code + ').'));
      const b = h('button', 'tsp-btn v-primary', 'Restart');
      b.type = 'button';
      b.addEventListener('click', () => { exited = false; notice.hidden = true; onRestart(); });
      notice.appendChild(b);
    }

    return {
      el: root,
      focus,
      apply,
      reset,
      setExited,
      dispose() { clearInterval(ticker); root.remove(); },
      // Same surface as a Claude UI frame, so the terminal webview's tab code treats both alike.
      post() {},
      owns() { return false; },
      receive() {},
    };
  }

  window.TspView = { create };
}());
