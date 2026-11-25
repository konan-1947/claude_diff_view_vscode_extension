/*
 * PaneLayout — chia pane (docking) cho các tab bên trong webview terminal.
 *
 * Mô hình: một cây
 *   { type: 'split', dir: 'row' | 'col', children: Node[], sizes: number[] }   (sizes là tỉ lệ, tổng = 1)
 *   { type: 'group', id, tabs: string[], active: string | null }
 *
 * Nguyên tắc quan trọng: các pane nội dung (.term-pane: xterm hoặc iframe Claude UI)
 * KHÔNG BAO GIỜ đổi cha — chúng nằm cố định trong paneHost và chỉ được đặt lại
 * left/top/width/height theo rect của .group-body. Chuyển iframe sang cha khác sẽ làm
 * nó tải lại (mất cuộc hội thoại đang hiện). Chỉ phần tử .tab (nhẹ) mới được chuyển
 * giữa các thanh tab.
 *
 * Kéo thả dùng Pointer Events + một lớp "shield" phủ toàn webview (iframe/xterm không
 * nuốt được sự kiện), ghost bám theo con trỏ bằng transform trong requestAnimationFrame,
 * hit-test trên các rect đã cache lúc bắt đầu kéo.
 */
(function () {
  'use strict';

  var SASH = 4;            // độ dày sash (px), cũng là khe giữa hai group
  var MIN_W = 140;         // bề rộng tối thiểu của một ô khi chia ngang
  var MIN_H = 90;          // chiều cao tối thiểu khi chia dọc
  var DRAG_THRESHOLD = 4;  // px trước khi một lần nhấn trở thành kéo
  var EDGE = 0.33;         // vùng sát mép (tỉ lệ) để chia; còn lại là gộp vào group
  var TAB_GAP = 4;         // khớp với gap của .tabs trong CSS
  var ANIM_MS = 160;

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function create(opts) {
    var root = opts.root;
    var paneHost = opts.paneHost;
    var gidSeq = 0;
    var groupEls = new Map();   // gid -> { el, strip, tabsBtn, tabs, add, body }
    var tree = newGroup([], null);
    var focusedGid = tree.id;
    var lastActive;             // id cuối cùng đã báo qua onActive
    var changeTimer = 0;
    var drag = null;            // trạng thái kéo tab
    var suppressClick = false;

    function newGroup(tabs, active) {
      gidSeq += 1;
      return { type: 'group', id: 'g' + gidSeq, tabs: tabs || [], active: active || null };
    }

    // ---------- duyệt cây ----------
    function forEachGroup(node, fn) {
      if (node.type === 'group') { fn(node); return; }
      node.children.forEach(function (c) { forEachGroup(c, fn); });
    }
    function allGroups() { var out = []; forEachGroup(tree, function (g) { out.push(g); }); return out; }
    function findGroup(gid) { var hit = null; forEachGroup(tree, function (g) { if (g.id === gid) hit = g; }); return hit; }
    function groupOf(id) { var hit = null; forEachGroup(tree, function (g) { if (g.tabs.indexOf(id) >= 0) hit = g; }); return hit; }
    function parentOf(target, node) {
      node = node || tree;
      if (node.type === 'group') return null;
      for (var i = 0; i < node.children.length; i++) {
        if (node.children[i] === target) return node;
        var p = parentOf(target, node.children[i]);
        if (p) return p;
      }
      return null;
    }
    function focusedGroup() { return findGroup(focusedGid) || allGroups()[0]; }
    function firstGroup(node) { while (node.type !== 'group') node = node.children[0]; return node; }
    // group nằm trên cùng bên phải: nơi đặt các nút chung của header (giống VS Code)
    function topRightGroup(node) {
      while (node.type !== 'group') node = node.dir === 'row' ? node.children[node.children.length - 1] : node.children[0];
      return node;
    }
    function replaceNode(oldNode, newNode) {
      var p = parentOf(oldNode);
      if (!p) { tree = newNode; return; }
      p.children[p.children.indexOf(oldNode)] = newNode;
    }

    // Gỡ một group rỗng; khoảng trống trả cho hàng xóm, split chỉ còn một con thì bị gộp.
    function removeGroup(g) {
      var p = parentOf(g);
      if (!p) return; // group gốc luôn còn lại (có thể rỗng)
      var i = p.children.indexOf(g);
      var freed = p.sizes[i];
      p.children.splice(i, 1);
      p.sizes.splice(i, 1);
      var n = i > 0 ? i - 1 : 0;
      p.sizes[n] += freed;
      if (focusedGid === g.id) focusedGid = firstGroup(p.children[n]).id;
      if (p.children.length === 1) collapse(p);
    }
    function collapse(split) {
      var only = split.children[0];
      var gp = parentOf(split);
      if (gp && only.type === 'split' && only.dir === gp.dir) {
        // cùng chiều với ông: trải các con ra một cấp
        var at = gp.children.indexOf(split);
        var share = gp.sizes[at];
        gp.children.splice.apply(gp.children, [at, 1].concat(only.children));
        gp.sizes.splice.apply(gp.sizes, [at, 1].concat(only.sizes.map(function (s) { return s * share; })));
        return;
      }
      replaceNode(split, only);
    }

    function pickNeighbor(g, idx) {
      if (g.tabs.length === 0) return null;
      return g.tabs[Math.min(idx, g.tabs.length - 1)];
    }

    // ---------- DOM ----------
    function groupDom(g) {
      var d = groupEls.get(g.id);
      if (d) return d;
      var gid = g.id;
      var wrap = el('div', 'group');
      wrap.dataset.gid = gid;
      var strip = el('div', 'tab-strip');
      var tabsBtn = el('button', 'header-btn tabs-btn');
      tabsBtn.type = 'button';
      tabsBtn.title = 'Tabs';
      tabsBtn.setAttribute('aria-label', 'Tabs');
      tabsBtn.setAttribute('aria-haspopup', 'menu');
      tabsBtn.setAttribute('aria-expanded', 'false');
      tabsBtn.innerHTML = (opts.tabsIcon || '') + '<span class="tabs-count" aria-hidden="true"></span>';
      var tabs = el('div', 'tabs');
      var add = el('button', 'tab-add');
      add.type = 'button';
      add.textContent = '+';
      add.title = 'New terminal or agent';
      add.setAttribute('aria-label', 'New terminal or agent');
      add.setAttribute('aria-haspopup', 'menu');
      add.setAttribute('aria-expanded', 'false');
      strip.appendChild(tabsBtn);
      strip.appendChild(tabs);
      strip.appendChild(add);
      var body = el('div', 'group-body');
      wrap.appendChild(strip);
      wrap.appendChild(body);
      tabsBtn.addEventListener('click', function () { focusGroup(gid); if (opts.onTabsButton) opts.onTabsButton(gid, tabsBtn); });
      add.addEventListener('click', function () { focusGroup(gid); if (opts.onAddButton) opts.onAddButton(gid, add); });
      // nhấn vào chỗ trống của thanh tab hoặc thân group rỗng: group đó thành group đang làm việc
      strip.addEventListener('pointerdown', function (e) { if (e.target === strip || e.target === tabs) focusGroup(gid, true); });
      body.addEventListener('pointerdown', function () { focusGroup(gid, true); });
      d = { el: wrap, strip: strip, tabsBtn: tabsBtn, tabs: tabs, add: add, body: body };
      groupEls.set(gid, d);
      return d;
    }

    function makeSash(split, i) {
      var s = el('div', 'sash ' + (split.dir === 'row' ? 'sash-v' : 'sash-h'));
      s.addEventListener('pointerdown', function (e) { startSashDrag(e, split, i, s); });
      s.addEventListener('dblclick', function () {
        var n = split.sizes.length;
        split.sizes = split.sizes.map(function () { return 1 / n; });
        applySizes(split);
        layoutNow(true);
        scheduleChange();
      });
      return s;
    }

    function applySizes(split) {
      var k = 0;
      Array.prototype.forEach.call(split.el.children, function (c) {
        if (c.classList.contains('sash')) return;
        c.style.flex = split.sizes[k++] + ' 1 0px';
      });
    }

    function build(node, used) {
      if (node.type === 'group') {
        used.add(node.id);
        var d = groupDom(node);
        node.tabs.forEach(function (id, i) {
          var t = opts.tabEl(id);
          if (t && d.tabs.children[i] !== t) d.tabs.insertBefore(t, d.tabs.children[i] || null);
        });
        Array.prototype.slice.call(d.tabs.children).forEach(function (c) {
          if (node.tabs.indexOf(c.dataset.id) < 0) c.remove();
        });
        d.el.style.flex = '';
        return d.el;
      }
      var s = el('div', 'split split-' + node.dir);
      Object.defineProperty(node, 'el', { value: s, configurable: true, enumerable: false, writable: true });
      node.children.forEach(function (child, i) {
        if (i > 0) s.appendChild(makeSash(node, i));
        var c = build(child, used);
        c.style.flex = node.sizes[i] + ' 1 0px';
        s.appendChild(c);
      });
      return s;
    }

    function render() {
      var used = new Set();
      var top = build(tree, used);
      if (root.childNodes.length !== 1 || root.firstChild !== top) root.replaceChildren(top);
      groupEls.forEach(function (d, gid) {
        if (!used.has(gid)) { d.el.remove(); groupEls.delete(gid); }
      });
      if (opts.actionsEl) {
        var trg = topRightGroup(tree).id;
        groupEls.get(trg).strip.appendChild(opts.actionsEl);
        groupEls.forEach(function (d, gid) { d.el.classList.toggle('has-actions', gid === trg); });
      }
      root.classList.toggle('multi', tree.type !== 'group');
      updateClasses();
      layoutNow(true);
      scheduleChange();
    }

    function updateClasses() {
      forEachGroup(tree, function (g) {
        var d = groupEls.get(g.id);
        if (d) d.el.classList.toggle('focused', g.id === focusedGid);
        g.tabs.forEach(function (id) {
          var on = id === g.active;
          var t = opts.tabEl(id);
          var p = opts.paneEl(id);
          if (t) t.classList.toggle('active', on);
          if (p) p.classList.toggle('active', on);
        });
      });
    }

    // Đặt mọi pane đúng vào thân group của nó (pane ẩn cũng được đặt, nên đổi tab là tức thì).
    function layoutNow(final) {
      var hr = paneHost.getBoundingClientRect();
      var visible = [];
      forEachGroup(tree, function (g) {
        var d = groupEls.get(g.id);
        if (!d) return;
        var r = d.body.getBoundingClientRect();
        var x = Math.round(r.left - hr.left) + 'px';
        var y = Math.round(r.top - hr.top) + 'px';
        var w = Math.max(0, Math.round(r.width)) + 'px';
        var h = Math.max(0, Math.round(r.height)) + 'px';
        g.tabs.forEach(function (id) {
          var p = opts.paneEl(id);
          if (!p) return;
          var st = p.style;
          if (st.left !== x) st.left = x;
          if (st.top !== y) st.top = y;
          if (st.width !== w) st.width = w;
          if (st.height !== h) st.height = h;
        });
        if (g.active) visible.push(g.active);
      });
      if (opts.onPanesLayout) opts.onPanesLayout(visible, !!final);
    }

    function scheduleChange() {
      if (!opts.onLayoutChange) return;
      clearTimeout(changeTimer);
      changeTimer = setTimeout(function () { opts.onLayoutChange(serialize()); }, 200);
    }

    function notifyActive(focus) {
      updateClasses();
      var g = focusedGroup();
      var id = g ? g.active : null;
      if (id === lastActive) return;
      lastActive = id;
      if (opts.onActive) opts.onActive(id, { focus: focus !== false });
    }

    // ---------- thao tác trên mô hình ----------
    function addTab(id, o) {
      o = o || {};
      if (groupOf(id)) return;
      var g = (o.gid && findGroup(o.gid)) || focusedGroup();
      var idx = o.index == null ? g.tabs.length : clamp(o.index, 0, g.tabs.length);
      g.tabs.splice(idx, 0, id);
      var activate = o.activate !== false;
      if (activate || !g.active) g.active = id;
      if (activate) focusedGid = g.id;
      render();
      if (activate) notifyActive(true);
    }

    function removeTab(id) {
      var g = groupOf(id);
      if (!g) return;
      var idx = g.tabs.indexOf(id);
      g.tabs.splice(idx, 1);
      if (g.active === id) g.active = pickNeighbor(g, idx);
      if (g.tabs.length === 0) removeGroup(g);
      render();
      notifyActive(true);
    }

    function activate(id, focus) {
      var g = groupOf(id);
      if (!g) return;
      var changedInGroup = g.active !== id;
      g.active = id;
      focusedGid = g.id;
      updateClasses();
      if (changedInGroup) { layoutNow(true); scheduleChange(); }
      notifyActive(focus);
    }

    function focusGroup(gid, focusContent) {
      if (gid === focusedGid) return;
      if (!findGroup(gid)) return;
      focusedGid = gid;
      notifyActive(!!focusContent);
      scheduleChange();
    }

    // Ô nội dung nhận focus (xterm textarea, iframe): group của nó thành group đang làm việc,
    // không cần đẩy focus lại lần nữa.
    function focusPane(id) {
      var g = groupOf(id);
      if (!g || (g.id === focusedGid && g.active === id)) return;
      g.active = id;
      focusedGid = g.id;
      notifyActive(false);
    }

    function moveTab(id, gid, index) {
      var src = groupOf(id);
      var dst = findGroup(gid);
      if (!src || !dst) return;
      var si = src.tabs.indexOf(id);
      src.tabs.splice(si, 1);
      if (src !== dst && src.active === id) src.active = pickNeighbor(src, si);
      var di = index == null ? dst.tabs.length : clamp(index, 0, dst.tabs.length);
      dst.tabs.splice(di, 0, id);
      dst.active = id;
      focusedGid = dst.id;
      if (src !== dst && src.tabs.length === 0) removeGroup(src);
      render();
      notifyActive(true);
    }

    function canSplit(id, gid) {
      var src = groupOf(id);
      var dst = findGroup(gid);
      if (!src || !dst) return false;
      return !(src === dst && src.tabs.length < 2);
    }

    function splitTab(id, gid, side) {
      if (!canSplit(id, gid)) return;
      var src = groupOf(id);
      var dst = findGroup(gid);
      var si = src.tabs.indexOf(id);
      src.tabs.splice(si, 1);
      if (src.active === id) src.active = pickNeighbor(src, si);
      var g = newGroup([id], id);
      var dir = side === 'left' || side === 'right' ? 'row' : 'col';
      var before = side === 'left' || side === 'up';
      var p = parentOf(dst);
      if (p && p.dir === dir) {
        var i = p.children.indexOf(dst);
        var half = p.sizes[i] / 2;
        p.sizes[i] = half;
        var at = before ? i : i + 1;
        p.children.splice(at, 0, g);
        p.sizes.splice(at, 0, half);
      } else {
        replaceNode(dst, { type: 'split', dir: dir, children: before ? [g, dst] : [dst, g], sizes: [0.5, 0.5] });
      }
      if (src.tabs.length === 0) removeGroup(src);
      focusedGid = g.id;
      render();
      notifyActive(true);
    }

    // ---------- lưu / khôi phục ----------
    function serialize() {
      function ser(n) {
        if (n.type === 'group') return { type: 'group', tabs: n.tabs.slice(), active: n.active, focused: n.id === focusedGid || undefined };
        return { type: 'split', dir: n.dir, sizes: n.sizes.slice(), children: n.children.map(ser) };
      }
      return ser(tree);
    }

    function restore(data, ids) {
      var alive = new Set(ids);
      var placed = new Set();
      var focusTarget = null;
      function des(n) {
        if (!n || typeof n !== 'object') return null;
        if (n.type === 'group') {
          var tabs = (Array.isArray(n.tabs) ? n.tabs : []).filter(function (id) {
            if (!alive.has(id) || placed.has(id)) return false;
            placed.add(id);
            return true;
          });
          if (tabs.length === 0) return null;
          var g = newGroup(tabs, tabs.indexOf(n.active) >= 0 ? n.active : tabs[0]);
          if (n.focused) focusTarget = g;
          return g;
        }
        if (n.type !== 'split' || !Array.isArray(n.children)) return null;
        var kids = [];
        var sizes = [];
        n.children.forEach(function (c, i) {
          var k = des(c);
          if (!k) return;
          kids.push(k);
          var s = Array.isArray(n.sizes) ? Number(n.sizes[i]) : NaN;
          sizes.push(isFinite(s) && s > 0 ? s : 1);
        });
        if (kids.length === 0) return null;
        if (kids.length === 1) return kids[0];
        var sum = sizes.reduce(function (a, b) { return a + b; }, 0);
        return { type: 'split', dir: n.dir === 'col' ? 'col' : 'row', children: kids, sizes: sizes.map(function (s) { return s / sum; }) };
      }
      tree = des(data) || newGroup([], null);
      var fg = focusTarget || firstGroup(tree);
      focusedGid = fg.id;
      ids.forEach(function (id) {
        if (placed.has(id)) return;
        fg.tabs.push(id);
        if (!fg.active) fg.active = id;
      });
      lastActive = undefined;
      render();
      notifyActive(false);
    }

    // ---------- shield (phủ webview khi kéo) ----------
    var shield = null;
    function showShield(cursor) {
      if (!shield) {
        shield = el('div', 'pl-shield');
        document.body.appendChild(shield);
      }
      shield.style.cursor = cursor;
      shield.hidden = false;
      document.body.classList.add('pl-dragging');
    }
    function hideShield() {
      if (shield) shield.hidden = true;
      document.body.classList.remove('pl-dragging');
    }

    // ---------- kéo sash ----------
    function startSashDrag(e, split, i, sashEl) {
      if (e.button !== 0) return;
      e.preventDefault();
      var horiz = split.dir === 'row';
      var rect = split.el.getBoundingClientRect();
      var total = (horiz ? rect.width : rect.height) - (split.children.length - 1) * SASH;
      if (total <= 0) return;
      var start = horiz ? e.clientX : e.clientY;
      var a = split.sizes[i - 1];
      var b = split.sizes[i];
      var sum = a + b;
      var minF = Math.min((horiz ? MIN_W : MIN_H) / total, sum / 2);
      var pending = null;
      var raf = 0;
      try { sashEl.setPointerCapture(e.pointerId); } catch (_) {}
      showShield(horiz ? 'col-resize' : 'row-resize');
      sashEl.classList.add('active');
      function apply() {
        raf = 0;
        if (pending === null) return;
        var na = clamp(a + (pending - start) / total, minF, sum - minF);
        split.sizes[i - 1] = na;
        split.sizes[i] = sum - na;
        applySizes(split);
        layoutNow(false);
      }
      function move(ev) {
        pending = horiz ? ev.clientX : ev.clientY;
        if (!raf) raf = requestAnimationFrame(apply);
      }
      function end() {
        sashEl.removeEventListener('pointermove', move);
        sashEl.removeEventListener('pointerup', end);
        sashEl.removeEventListener('pointercancel', end);
        window.removeEventListener('blur', end);
        if (raf) cancelAnimationFrame(raf);
        apply();
        hideShield();
        sashEl.classList.remove('active');
        layoutNow(true);
        scheduleChange();
      }
      sashEl.addEventListener('pointermove', move);
      sashEl.addEventListener('pointerup', end);
      sashEl.addEventListener('pointercancel', end);
      window.addEventListener('blur', end);
    }

    // ---------- kéo tab ----------
    root.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || drag) return;
      var tab = e.target.closest && e.target.closest('.tab');
      if (!tab || !root.contains(tab) || e.target.closest('.tab-close')) return;
      pressTab(e, tab);
    });
    // một lần kéo kết thúc trên chính tab thì không được tính là click
    root.addEventListener('click', function (e) {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    root.addEventListener('contextmenu', function (e) {
      var tab = e.target.closest && e.target.closest('.tab');
      if (!tab || !root.contains(tab)) return;
      e.preventDefault();
      openTabMenu(tab.dataset.id, e.clientX, e.clientY);
    });

    function pressTab(e, tab) {
      var id = tab.dataset.id;
      var sx = e.clientX;
      var sy = e.clientY;
      var pid = e.pointerId;
      function move(ev) {
        if (Math.abs(ev.clientX - sx) < DRAG_THRESHOLD && Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
        cleanup();
        beginDrag(id, tab, sx, sy, pid, ev);
      }
      function cleanup() {
        tab.removeEventListener('pointermove', move);
        tab.removeEventListener('pointerup', cleanup);
        tab.removeEventListener('pointercancel', cleanup);
      }
      try { tab.setPointerCapture(pid); } catch (_) {}
      tab.addEventListener('pointermove', move);
      tab.addEventListener('pointerup', cleanup);
      tab.addEventListener('pointercancel', cleanup);
    }

    function beginDrag(id, tab, sx, sy, pid, ev) {
      var src = groupOf(id);
      if (!src) return;
      closeTabMenu();
      var tr = tab.getBoundingClientRect();
      // Cache mọi rect một lần: hit-test trong lúc kéo không đo lại DOM.
      var groups = allGroups().map(function (g) {
        var d = groupEls.get(g.id);
        var list = [];
        g.tabs.forEach(function (tid) {
          if (tid === id) return;
          var t = opts.tabEl(tid);
          if (!t) return;
          var r = t.getBoundingClientRect();
          list.push({ id: tid, el: t, mid: r.left + r.width / 2, origIdx: g.tabs.indexOf(tid) });
        });
        return { g: g, d: d, strip: d.strip.getBoundingClientRect(), body: d.body.getBoundingClientRect(), list: list };
      });
      var ghost = tab.cloneNode(true);
      ghost.classList.add('tab-ghost', 'active');
      ghost.classList.remove('dragging', 'drag-hidden');
      ghost.removeAttribute('title');
      ghost.style.width = tr.width + 'px';
      ghost.style.height = tr.height + 'px';
      var overlay = el('div', 'pl-drop-overlay');
      showShield('grabbing');
      shield.appendChild(overlay);
      shield.appendChild(ghost);
      tab.classList.add('dragging');
      root.classList.add('pl-tab-drag');
      drag = {
        id: id, tab: tab, src: src, srcIdx: src.tabs.indexOf(id), pid: pid,
        gx: sx - tr.left, gy: sy - tr.top, w: tr.width + TAB_GAP,
        groups: groups, ghost: ghost, overlay: overlay, overlayShown: false,
        x: ev.clientX, y: ev.clientY, raf: 0, target: null,
      };
      try { tab.setPointerCapture(pid); } catch (_) {}
      tab.addEventListener('pointermove', onDragMove);
      tab.addEventListener('pointerup', onDragUp);
      tab.addEventListener('pointercancel', cancelDrag);
      window.addEventListener('keydown', onDragKey, true);
      window.addEventListener('blur', cancelDrag);
      frame();
    }

    function onDragMove(ev) {
      if (!drag) return;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      if (!drag.raf) drag.raf = requestAnimationFrame(frame);
    }
    function onDragKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancelDrag(); }
    }

    function inside(r, x, y) { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

    function hitTest(x, y) {
      for (var i = 0; i < drag.groups.length; i++) {
        var c = drag.groups[i];
        if (inside(c.strip, x, y)) {
          var idx = 0;
          c.list.forEach(function (t) { if (t.mid < x) idx += 1; });
          return { kind: 'strip', c: c, index: idx };
        }
        if (inside(c.body, x, y)) {
          var b = c.body;
          var rx = (x - b.left) / Math.max(1, b.width);
          var ry = (y - b.top) / Math.max(1, b.height);
          var cands = [];
          if (b.width >= MIN_W * 2) { cands.push(['left', rx]); cands.push(['right', 1 - rx]); }
          if (b.height >= MIN_H * 2) { cands.push(['up', ry]); cands.push(['down', 1 - ry]); }
          var side = 'center';
          var best = EDGE;
          cands.forEach(function (cd) { if (cd[1] < best) { best = cd[1]; side = cd[0]; } });
          var own = c.g === drag.src;
          if (own && (side === 'center' || drag.src.tabs.length < 2)) return null;
          return { kind: 'zone', c: c, side: side };
        }
      }
      return null;
    }

    function zoneRect(b, side) {
      var w = b.width;
      var h = b.height;
      switch (side) {
        case 'left': return { l: b.left, t: b.top, w: w / 2, h: h };
        case 'right': return { l: b.left + w / 2, t: b.top, w: w / 2, h: h };
        case 'up': return { l: b.left, t: b.top, w: w, h: h / 2 };
        case 'down': return { l: b.left, t: b.top + h / 2, w: w, h: h / 2 };
        default: return { l: b.left, t: b.top, w: w, h: h };
      }
    }

    function frame() {
      if (!drag) return;
      drag.raf = 0;
      drag.ghost.style.transform = 'translate3d(' + (drag.x - drag.gx) + 'px,' + (drag.y - drag.gy) + 'px,0)';
      var t = hitTest(drag.x, drag.y);
      drag.target = t;
      // các tab trượt sang để chừa chỗ (chỉ ở thanh tab đang được nhắm tới)
      var overSrcStrip = t && t.kind === 'strip' && t.c.g === drag.src;
      drag.tab.classList.toggle('drag-hidden', !!overSrcStrip);
      drag.groups.forEach(function (c) {
        var isSrc = c.g === drag.src;
        var isTarget = t && t.kind === 'strip' && t.c === c;
        c.list.forEach(function (item, li) {
          var off = 0;
          if (isTarget) {
            if (isSrc && item.origIdx > drag.srcIdx) off -= drag.w;
            if (li >= t.index) off += drag.w;
          }
          var v = off ? 'translateX(' + off + 'px)' : '';
          if (item.el.style.transform !== v) item.el.style.transform = v;
        });
        c.d.strip.classList.toggle('pl-drop-target', !!isTarget);
      });
      var ov = drag.overlay;
      if (t && t.kind === 'zone') {
        var r = zoneRect(t.c.body, t.side);
        if (!drag.overlayShown) ov.classList.add('no-anim');
        ov.style.left = r.l + 'px';
        ov.style.top = r.t + 'px';
        ov.style.width = r.w + 'px';
        ov.style.height = r.h + 'px';
        if (!drag.overlayShown) {
          void ov.offsetWidth;
          ov.classList.remove('no-anim');
          drag.overlayShown = true;
        }
        ov.classList.add('show');
      } else if (drag.overlayShown) {
        ov.classList.remove('show');
        drag.overlayShown = false;
      }
    }

    function stopDragListeners() {
      var tab = drag.tab;
      tab.removeEventListener('pointermove', onDragMove);
      tab.removeEventListener('pointerup', onDragUp);
      tab.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('keydown', onDragKey, true);
      window.removeEventListener('blur', cancelDrag);
      try { tab.releasePointerCapture(drag.pid); } catch (_) {}
      if (drag.raf) cancelAnimationFrame(drag.raf);
    }

    function tabRects() {
      var m = new Map();
      forEachGroup(tree, function (g) {
        g.tabs.forEach(function (id) {
          var t = opts.tabEl(id);
          if (t) m.set(id, t.getBoundingClientRect());
        });
      });
      return m;
    }

    // Tháo trạng thái kéo, chạy thao tác (mutate), rồi FLIP các tab từ vị trí đang thấy về chỗ mới.
    function finishDrag(mutate) {
      var d = drag;
      stopDragListeners();
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      var before = tabRects();
      var ghostRect = d.ghost.getBoundingClientRect();
      root.classList.add('pl-no-anim');
      d.groups.forEach(function (c) {
        c.list.forEach(function (item) { item.el.style.transform = ''; });
        c.d.strip.classList.remove('pl-drop-target');
      });
      d.overlay.remove();
      drag = null;
      root.classList.remove('pl-tab-drag');
      if (mutate) mutate();
      var moved = [];
      forEachGroup(tree, function (g) {
        g.tabs.forEach(function (id) {
          if (id === d.id) return;
          var t = opts.tabEl(id);
          var a = before.get(id);
          if (!t || !a) return;
          var b = t.getBoundingClientRect();
          var dx = a.left - b.left;
          var dy = a.top - b.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
          t.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          moved.push(t);
        });
      });
      // tab vừa thả: ghost bay vào chỗ của nó rồi mới hiện tab thật
      var dest = d.tab.getBoundingClientRect();
      void root.offsetWidth;
      root.classList.remove('pl-no-anim');
      moved.forEach(function (t) { t.style.transform = ''; });
      d.ghost.classList.add('landing');
      d.ghost.style.transform = 'translate3d(' + dest.left + 'px,' + dest.top + 'px,0)';
      if (dest.width > 0) d.ghost.style.width = dest.width + 'px';
      var done = false;
      function land() {
        if (done) return;
        done = true;
        d.tab.classList.remove('dragging', 'drag-hidden');
        d.ghost.remove();
        hideShield();
      }
      var dist = Math.abs(dest.left - ghostRect.left) + Math.abs(dest.top - ghostRect.top);
      if (dest.width === 0 || dist < 1) land();
      else {
        d.ghost.addEventListener('transitionend', land);
        setTimeout(land, ANIM_MS + 60);
      }
    }

    function cancelDrag() {
      if (!drag) return;
      finishDrag(null);
    }

    function onDragUp(ev) {
      if (!drag) return;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      var t = hitTest(drag.x, drag.y);
      var id = drag.id;
      finishDrag(t ? function () {
        if (t.kind === 'strip') moveTab(id, t.c.g.id, t.index);
        else if (t.side === 'center') moveTab(id, t.c.g.id);
        else splitTab(id, t.c.g.id, t.side);
      } : null);
    }

    // ---------- menu chuột phải trên tab ----------
    var menu = null;
    function closeTabMenu() {
      if (!menu) return;
      menu.remove();
      menu = null;
      document.removeEventListener('pointerdown', onMenuOutside, true);
      window.removeEventListener('blur', closeTabMenu);
      window.removeEventListener('keydown', onMenuKey, true);
    }
    function onMenuOutside(e) { if (menu && !menu.contains(e.target)) closeTabMenu(); }
    function onMenuKey(e) { if (e.key === 'Escape') { e.preventDefault(); closeTabMenu(); } }
    function openTabMenu(id, x, y) {
      closeTabMenu();
      var g = groupOf(id);
      if (!g) return;
      menu = el('div', 'agent-menu pl-tab-menu');
      menu.setAttribute('role', 'menu');
      var canS = canSplit(id, g.id);
      function item(label, enabled, run) {
        var b = el('button', 'agent-item');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.disabled = !enabled;
        var n = el('span', 'agent-name');
        n.textContent = label;
        b.appendChild(n);
        b.addEventListener('click', function () { closeTabMenu(); run(); });
        menu.appendChild(b);
      }
      item('Split Right', canS, function () { splitTab(id, g.id, 'right'); });
      item('Split Down', canS, function () { splitTab(id, g.id, 'down'); });
      item('Split Left', canS, function () { splitTab(id, g.id, 'left'); });
      item('Split Up', canS, function () { splitTab(id, g.id, 'up'); });
      var groups = allGroups();
      if (groups.length > 1) {
        menu.appendChild(el('div', 'agent-menu-sep'));
        var gi = groups.indexOf(g);
        item('Move to Next Group', true, function () { moveTab(id, groups[(gi + 1) % groups.length].id); });
        item('Join All Groups', true, function () { joinAll(); });
      }
      menu.appendChild(el('div', 'agent-menu-sep'));
      item('Close', true, function () { if (opts.onCloseTab) opts.onCloseTab(id); });
      document.body.appendChild(menu);
      var mw = menu.offsetWidth;
      var mh = menu.offsetHeight;
      menu.style.left = clamp(x, 8, window.innerWidth - mw - 8) + 'px';
      menu.style.top = clamp(y, 8, window.innerHeight - mh - 8) + 'px';
      document.addEventListener('pointerdown', onMenuOutside, true);
      window.addEventListener('blur', closeTabMenu);
      window.addEventListener('keydown', onMenuKey, true);
      var first = menu.querySelector('.agent-item:not(:disabled)');
      if (first) first.focus();
    }

    function joinAll() {
      var fg = focusedGroup();
      var tabs = [];
      forEachGroup(tree, function (g) { tabs = tabs.concat(g.tabs); });
      var g = newGroup(tabs, fg ? fg.active : tabs[0]);
      tree = g;
      focusedGid = g.id;
      render();
      notifyActive(true);
    }

    // ---------- theo dõi kích thước & focus ----------
    var roRaf = 0;
    var roFinal = 0;
    new ResizeObserver(function () {
      if (!roRaf) roRaf = requestAnimationFrame(function () { roRaf = 0; layoutNow(false); });
      clearTimeout(roFinal);
      roFinal = setTimeout(function () { layoutNow(true); }, 150);
    }).observe(root);

    paneHost.addEventListener('focusin', function (e) {
      var p = e.target.closest && e.target.closest('.term-pane');
      if (p && p.dataset.id) focusPane(p.dataset.id);
    });
    // iframe (Claude UI) nhận focus: cửa sổ webview mất focus, activeElement là iframe
    window.addEventListener('blur', function () {
      setTimeout(function () {
        var a = document.activeElement;
        if (!a || a.tagName !== 'IFRAME') return;
        var p = a.closest('.term-pane');
        if (p && p.dataset.id) focusPane(p.dataset.id);
      }, 0);
    });

    render();

    return {
      addTab: addTab,
      removeTab: removeTab,
      activate: activate,
      focusGroup: focusGroup,
      moveTab: moveTab,
      splitTab: splitTab,
      restore: restore,
      serialize: serialize,
      relayout: function () { layoutNow(true); },
      activeId: function () { var g = focusedGroup(); return g ? g.active : null; },
      focusedGroupId: function () { return focusedGid; },
      groups: function () {
        return allGroups().map(function (g) {
          var d = groupEls.get(g.id);
          return { id: g.id, tabs: g.tabs.slice(), active: g.active, tabsEl: d && d.tabs, tabsBtn: d && d.tabsBtn, add: d && d.add };
        });
      },
    };
  }

  window.PaneLayout = { create: create };
})();
