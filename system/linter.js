/* ═══════════════════════════════════════════════════════════════════════
   linter.js · HLV Slide System — HOUSE RULES, ENFORCED
   ───────────────────────────────────────────────────────────────────────
   The house rules are no longer just documented — they are measured. Drop
   this on any page that renders `section.s` slides (deck or specimen).

     press  L  -> toggle the lint report (measures every slide, lists every
                  violation, click a row to flash the offending element)
     press  G  -> toggle the baseline + column grid overlay

   What it catches (the failures the system exists to prevent):
     • OFF SLIDE      — an element bleeds past the 1920x1080 canvas
     • PAST FOOTER    — content drops below the 984 footer-band end
     • COLLISION      — two .el boxes overlap (the 2x2-legend bug)
     • OFF GRID       — an .el top not on 12 / left not on 24
     • SUB-FLOOR TYPE — non-mono text below 32px outside the footer band
     • EM-DASH        — a forbidden "—" anywhere in slide text
     • NON-HEX COLOUR — oklch() / color-mix() in any stylesheet (breaks export)
     • currentColor   — an SVG fill/stroke that exports black

   All measurement is done in CANVAS space (rect / scale), so it is correct
   whether a slide is full-size, deck-scaled, or shown in a specimen frame.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var G = 12, GX = 24, CANVAS_W = 1920, CANVAS_H = 1080, FOOTER_END = 984, TOL = 1.5;
  var on = false, panel = null;

  function canvasBox(el, sec, scale) {
    var r = el.getBoundingClientRect(), s = sec.getBoundingClientRect();
    return {
      x: (r.left - s.left) / scale, y: (r.top - s.top) / scale,
      w: r.width / scale, h: r.height / scale,
      right: (r.right - s.left) / scale, bottom: (r.bottom - s.top) / scale
    };
  }
  function near(v, step) { var m = ((v % step) + step) % step; return m < TOL || step - m < TOL; }
  function overlap(a, b) {
    var ix = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    var iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (ix <= 2 || iy <= 2) return 0;
    var inter = ix * iy, small = Math.min(a.w * a.h, b.w * b.h);
    return small > 0 ? inter / small : 0;
  }
  function isMono(el) {
    var f = getComputedStyle(el).fontFamily || '';
    return f.toLowerCase().indexOf('mono') > -1 || f.indexOf('JetBrains') > -1;
  }
  // decorative elements that are allowed to bleed / overlap by design.
  // `no-lint` is the author escape hatch for intentional decorative fills.
  function decorative(el) {
    return el.classList.contains('no-lint') || el.classList.contains('ghost') ||
           el.classList.contains('q-mark') || el.classList.contains('ln') ||
           el.classList.contains('shp') || el.classList.contains('leader') ||
           el.classList.contains('motif');
  }
  // right-anchored chrome: its LEFT edge legitimately is not on the 24 grid
  function rightAnchored(el) {
    return el.classList.contains('pc') || el.classList.contains('cred');
  }
  // single-line hand-placed furniture: exempt from pairwise collision (it is
  // never the n-up overlap the check exists to catch; real drops are caught
  // by PAST FOOTER / OFF SLIDE instead)
  function chrome(el) {
    var c = el.classList;
    return c.contains('k') || c.contains('pc') || c.contains('cred') ||
           c.contains('foot') || c.contains('chk') || c.contains('q-attr');
  }

  function scanStyles() {
    var hits = [], i, j, ss = document.styleSheets;
    for (i = 0; i < ss.length; i++) {
      var rules; try { rules = ss[i].cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (j = 0; j < rules.length; j++) {
        var t = rules[j].cssText || '';
        var lo = t.toLowerCase();
        if (lo.indexOf('oklch(') > -1 || lo.indexOf('color-mix(') > -1) {
          hits.push((rules[j].selectorText || t).slice(0, 70));
        }
      }
    }
    return hits;
  }

  function lintSlide(sec) {
    var out = [], scale = sec.getBoundingClientRect().width / CANVAS_W || 1;
    var els = [].slice.call(sec.querySelectorAll(':scope > .el'));
    var boxes = [];
    els.forEach(function (el) {
      var b = canvasBox(el, sec, scale); b.el = el; b.dec = decorative(el); boxes.push(b);
      if (b.dec) return;
      if (b.x < -TOL || b.y < -TOL || b.right > CANVAS_W + TOL || b.bottom > CANVAS_H + TOL)
        out.push({ el: el, kind: 'OFF SLIDE', msg: tag(el) + ' bleeds past the canvas' });
      else if (b.bottom > FOOTER_END + TOL && !el.classList.contains('pc') && !el.classList.contains('cred') && !el.classList.contains('foot') && !el.classList.contains('chk'))
        out.push({ el: el, kind: 'PAST FOOTER', msg: tag(el) + ' drops below the 984 footer band (' + Math.round(b.bottom) + ')' });
      if (!near(b.y, G)) out.push({ el: el, kind: 'OFF GRID', msg: tag(el) + ' top ' + Math.round(b.y) + ' not on 12' });
      if (!near(b.x, GX) && !rightAnchored(el)) out.push({ el: el, kind: 'OFF GRID', msg: tag(el) + ' left ' + Math.round(b.x) + ' not on 24' });
    });
    // collision — pairwise, skip decorative + single-line chrome
    for (var i = 0; i < boxes.length; i++) for (var k = i + 1; k < boxes.length; k++) {
      if (boxes[i].dec || boxes[k].dec) continue;
      if (chrome(boxes[i].el) || chrome(boxes[k].el)) continue;
      if (overlap(boxes[i], boxes[k]) > 0.12)
        out.push({ el: boxes[i].el, kind: 'COLLISION', msg: tag(boxes[i].el) + ' overlaps ' + tag(boxes[k].el) });
    }
    // sub-floor type — walk text-bearing descendants
    [].slice.call(sec.querySelectorAll('*')).forEach(function (el) {
      if (!el.childNodes.length) return;
      var hasText = false, n; for (n = 0; n < el.childNodes.length; n++)
        if (el.childNodes[n].nodeType === 3 && el.childNodes[n].textContent.trim()) hasText = true;
      if (!hasText) return;
      var b = canvasBox(el, sec, scale), fs = parseFloat(getComputedStyle(el).fontSize) || 99;
      if (fs < 32 - TOL && b.y < FOOTER_END - 40 && !isMono(el))
        out.push({ el: el, kind: 'SUB-FLOOR', msg: '"' + el.textContent.trim().slice(0, 24) + '" at ' + Math.round(fs) + 'px' });
    });
    // em-dash
    if (sec.textContent.indexOf('\u2014') > -1)
      out.push({ el: sec, kind: 'EM-DASH', msg: 'em-dash (\u2014) in slide text' });
    // currentColor SVG
    if (sec.querySelector('svg [fill="currentColor"], svg [stroke="currentColor"]'))
      out.push({ el: sec, kind: 'currentColor', msg: 'SVG currentColor (exports black)' });
    return out;
  }

  function tag(el) {
    var c = (el.className || '').toString().split(' ').filter(function (x) { return x && x !== 'el'; })[0];
    return '.' + (c || el.tagName.toLowerCase());
  }

  function flash(el) {
    var o = el.style.outline, ow = el.style.outlineOffset;
    el.style.outline = '3px solid #FF6B6B'; el.style.outlineOffset = '2px';
    setTimeout(function () { el.style.outline = o; el.style.outlineOffset = ow; }, 1600);
  }

  function build() {
    var slides = [].slice.call(document.querySelectorAll('section.s'));
    var all = [], styleHits = scanStyles();
    slides.forEach(function (sec, i) {
      lintSlide(sec).forEach(function (v) { v.slide = i + 1; all.push(v); });
    });
    panel = document.createElement('div');
    panel.id = '__lint';
    var css = 'position:fixed;right:16px;top:16px;z-index:99999;width:380px;max-height:88vh;overflow:auto;'
      + 'background:#1E1E1E;color:#fff;font:12px/1.5 ui-monospace,Menlo,monospace;'
      + 'border:1px solid #3A3A3A;box-shadow:0 12px 40px rgba(0,0,0,.5)';
    panel.style.cssText = css;
    var head = '<div style="padding:12px 14px;border-bottom:1px solid #3A3A3A;display:flex;justify-content:space-between;align-items:center">'
      + '<b style="letter-spacing:.08em">LINT</b><span style="color:' + (all.length ? '#FF6B6B' : '#00D967') + '">'
      + (all.length ? all.length + ' issue' + (all.length > 1 ? 's' : '') : 'clean') + '</span></div>';
    var body = '';
    if (styleHits.length) styleHits.forEach(function (h) {
      body += row('NON-HEX', 'stylesheet', 'oklch/color-mix in ' + h, -1);
    });
    all.forEach(function (v, idx) { body += row(v.kind, 'slide ' + v.slide, v.msg, idx); });
    if (!all.length && !styleHits.length) body = '<div style="padding:18px 14px;color:#939393">No violations. Every element is on the grid, on the palette, and inside the canvas.</div>';
    panel.innerHTML = head + body;
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var r = e.target.closest('[data-idx]'); if (!r) return;
      var idx = +r.getAttribute('data-idx'); if (idx >= 0 && all[idx]) flash(all[idx].el);
    });
  }
  function row(kind, where, msg, idx) {
    var color = kind === 'OFF SLIDE' || kind === 'COLLISION' || kind === 'NON-HEX' ? '#FF6B6B'
      : kind === 'PAST FOOTER' || kind === 'SUB-FLOOR' || kind === 'EM-DASH' || kind === 'currentColor' ? '#FFC21A' : '#1E9BFE';
    return '<div data-idx="' + idx + '" style="padding:9px 14px;border-bottom:1px solid #2A2A2A;cursor:pointer">'
      + '<span style="color:' + color + ';font-weight:700">' + kind + '</span> '
      + '<span style="color:#666">' + where + '</span><br><span style="color:#CECECE">' + msg + '</span></div>';
  }

  function toggleLint() {
    if (panel) { panel.remove(); panel = null; on = false; return; }
    build(); on = true;
  }

  // ── grid overlay ──────────────────────────────────────────────────────
  var gridOn = false;
  function toggleGrid() {
    gridOn = !gridOn;
    document.querySelectorAll('section.s').forEach(function (sec) {
      var ov = sec.querySelector('.__grid');
      if (!gridOn) { if (ov) ov.remove(); return; }
      if (ov) return;
      ov = document.createElement('div'); ov.className = '__grid';
      ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:9000;'
        + 'background-image:'
        + 'repeating-linear-gradient(to bottom,rgba(30,144,255,.30) 0 1px,transparent 1px 60px),'
        + 'repeating-linear-gradient(to bottom,rgba(30,144,255,.10) 0 1px,transparent 1px 12px),'
        + 'repeating-linear-gradient(to right,rgba(30,144,255,.10) 0 1px,transparent 1px 24px);';
      // margins + footer band markers
      var m = document.createElement('div');
      m.style.cssText = 'position:absolute;left:120px;right:120px;top:96px;bottom:96px;'
        + 'box-shadow:0 0 0 1px rgba(255,107,107,.5);';
      ov.appendChild(m);
      sec.appendChild(ov);
    });
  }

  document.addEventListener('keydown', function (e) {
    var tn = e.target ? e.target.tagName : '';
    if (tn === 'INPUT' || tn === 'TEXTAREA') return;
    var k = e.key.toLowerCase();
    if (k === 'l') { toggleLint(); }
    if (k === 'g') { toggleGrid(); }
  });

  // ── FRAME SCALER — fit every specimen's 1920×1080 slide to its container.
  //   Pure-CSS cqw is the fallback; this JS sets an explicit per-frame scale
  //   so frames are ALWAYS fully contained, regardless of cqw support. ──────
  function scaleFrames() {
    var frames = document.querySelectorAll('.frame');
    for (var i = 0; i < frames.length; i++) {
      var w = frames[i].clientWidth;
      // only write when the width actually changed, so setting --fscale never
      // re-triggers the ResizeObserver that called us (kills the benign
      // "ResizeObserver loop" warning, which 30+ frames reliably surface)
      if (w && frames[i].__lastW !== w) {
        frames[i].__lastW = w;
        frames[i].style.setProperty('--fscale', (w / 1920).toFixed(5));
      }
    }
  }
  var rafPending = false;
  function scaleFramesRAF() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; scaleFrames(); });
  }
  window.addEventListener('resize', scaleFramesRAF);
  window.addEventListener('load', scaleFrames);
  if (document.readyState !== 'loading') scaleFrames();
  else document.addEventListener('DOMContentLoaded', scaleFrames);
  // re-scale once more after web fonts settle (their reflow changes layout).
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scaleFrames);
  // NOTE: no ResizeObserver here on purpose. The .frame CSS already carries a
  // container-query fallback (transform:scale(calc(100cqw/1920))), so frames
  // stay contained without JS; the resize + load + fonts.ready passes set an
  // explicit --fscale on top. An RO observing .wrap re-fires when we write
  // --fscale across 30+ frames during font reflow and surfaces the benign
  // "ResizeObserver loop completed" console warning for no real benefit.
})();
