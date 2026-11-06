/* UI helpers: escaping, modal dialogs, toasts, and hand-drawn SVG charts. */
(function (g) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button" class="btn btn-ghost btn-sm" id="toast-act">${esc(action.label)}</button>` : '');
    t.classList.add('show');
    if (action) $('#toast-act').onclick = () => { action.run(); t.classList.remove('show'); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
  }

  /* ---------- modal ---------- */
  let lastFocus = null;
  function modal(opts) {
    const m = $('#modal');
    lastFocus = document.activeElement;
    m.innerHTML = `<div class="modal-card ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-head"><h2 id="modal-title">${esc(opts.title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">${opts.body}</div>
      ${opts.foot ? `<footer class="modal-foot">${opts.foot}</footer>` : ''}</div>`;
    m.hidden = false;
    document.body.classList.add('modal-open');
    $$('[data-close]', m).forEach(b => b.onclick = closeModal);
    m.onclick = e => { if (e.target === m) closeModal(); };
    const first = $('input,select,textarea,button:not([data-close])', m);
    setTimeout(() => (first || $('[data-close]', m)).focus(), 20);
    if (opts.onOpen) opts.onOpen(m);
    return m;
  }
  function closeModal() {
    const m = $('#modal'); if (m.hidden) return;
    m.hidden = true; m.innerHTML = ''; document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function confirmBox(title, text, okLabel, onOk, danger) {
    modal({ title, body: `<p class="lede">${esc(text)}</p>`,
      foot: `<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${esc(okLabel)}</button>`,
      onOpen: m => { $('#cf-ok', m).onclick = () => { closeModal(); onOk(); }; } });
  }

  /* ---------- icons (simple strokes) ---------- */
  const P = {
    today: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    board: '<path d="M4 6h16M4 12h16M4 18h16M9 4v16"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
    building: '<path d="M5 20V6l7-3 7 3v14M9 20v-4h6v4M9 9h1M14 9h1M9 13h1M14 13h1"/>',
    meeting: '<circle cx="8" cy="9" r="2.5"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5M11 19c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5"/>',
    bill: '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M10 8h4M10 12h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    plan: '<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5M8 17h3"/>',
    chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a5 5 0 010 10h-2"/>',
    redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a5 5 0 000 10h2"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11l7.4-3.8M8.3 13l7.4 3.8"/>',
    print: '<path d="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5H4v11h4"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 017.5-2"/>',
    ruler: '<path d="M3 16L16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>'
  };
  function icon(name, cls) { return `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`; }

  /* ---------- charts (SVG) ---------- */
  const fmtN = v => (Math.round(v * 10) / 10).toLocaleString('en-IN');

  /* Horizontal stacked bars: rows [{label, color?, segs:[{key, label, value, color}]}] */
  function hbars(rows, opts) {
    opts = opts || {};
    const max = opts.max || Math.max(1, ...rows.map(r => r.segs.reduce((s, x) => s + x.value, 0)));
    const unit = opts.unit || '';
    return `<div class="hbars" role="img" aria-label="${esc(opts.label || 'Bar chart')}">` + rows.map(r => {
      const total = r.segs.reduce((s, x) => s + x.value, 0);
      return `<div class="hbar-row" ${r.attr || ''}>
        <div class="hbar-label">${r.dot ? `<span class="dot" style="background:${r.dot}"></span>` : ''}${esc(r.label)}</div>
        <div class="hbar-track">${r.segs.filter(s => s.value > 0).map(s => `<span class="hbar-seg" style="width:${(s.value / max) * 100}%;background:${s.color}" title="${esc(s.label)}: ${fmtN(s.value)} ${unit}"></span>`).join('')}
          ${opts.marker ? `<span class="hbar-marker" style="left:${Math.min(100, (opts.marker / max) * 100)}%" title="${esc(opts.markerLabel || '')}"></span>` : ''}</div>
        <div class="hbar-val">${fmtN(total)}${unit ? ' ' + unit : ''}</div></div>`;
    }).join('') + '</div>';
  }

  /* Vertical grouped/stacked columns with axis */
  function columns(labels, series, opts) {
    opts = opts || {};
    const W = 640, H = opts.height || 220, padL = 34, padB = 34, padT = 10, padR = 8;
    const stacked = opts.stacked !== false;
    const totals = labels.map((_, i) => stacked ? series.reduce((s, se) => s + (se.values[i] || 0), 0) : Math.max(...series.map(se => se.values[i] || 0)));
    const max = niceMax(Math.max(1, ...totals, opts.ref || 0));
    const iw = W - padL - padR, ih = H - padT - padB;
    const bw = iw / labels.length;
    let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'Chart')}">`;
    for (let k = 0; k <= 4; k++) {
      const y = padT + ih - (ih * k / 4);
      out += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" class="axis" text-anchor="end">${fmtN(max * k / 4)}</text>`;
    }
    if (opts.ref) { const y = padT + ih - ih * opts.ref / max; out += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="ref"/><text x="${W - padR}" y="${y - 4}" class="axis ref-t" text-anchor="end">${esc(opts.refLabel || '')}</text>`; }
    labels.forEach((lab, i) => {
      const x0 = padL + i * bw + bw * 0.14, w = bw * 0.72;
      let acc = 0;
      series.forEach((se, si) => {
        const v = se.values[i] || 0; if (!v) return;
        const h = ih * v / max;
        if (stacked) { const y = padT + ih - ih * (acc + v) / max; out += `<rect x="${x0}" y="${y}" width="${w}" height="${h}" fill="${se.color}"><title>${esc(lab)} – ${esc(se.name)}: ${fmtN(v)} ${opts.unit || ''}</title></rect>`; acc += v; }
        else { const ww = w / series.length; out += `<rect x="${x0 + si * ww}" y="${padT + ih - h}" width="${ww - 1}" height="${h}" fill="${se.color}"><title>${esc(lab)} – ${esc(se.name)}: ${fmtN(v)} ${opts.unit || ''}</title></rect>`; }
      });
      const every = Math.ceil(labels.length / 18);
      if (i % every === 0) out += `<text x="${x0 + w / 2}" y="${H - padB + 14}" class="axis" text-anchor="middle">${esc(lab)}</text>`;
      if (opts.sub && i % every === 0) out += `<text x="${x0 + w / 2}" y="${H - padB + 26}" class="axis sub" text-anchor="middle">${esc(opts.sub[i])}</text>`;
    });
    return out + '</svg>';
  }

  function lines(labels, series, opts) {
    opts = opts || {};
    const W = 640, H = opts.height || 220, padL = 34, padB = 28, padT = 10, padR = 10;
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values), opts.ref || 0));
    const iw = W - padL - padR, ih = H - padT - padB;
    const x = i => padL + (labels.length === 1 ? iw / 2 : iw * i / (labels.length - 1));
    const y = v => padT + ih - ih * v / max;
    let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label || 'Line chart')}">`;
    for (let k = 0; k <= 4; k++) out += `<line x1="${padL}" x2="${W - padR}" y1="${y(max * k / 4)}" y2="${y(max * k / 4)}" class="grid"/><text x="${padL - 6}" y="${y(max * k / 4) + 4}" class="axis" text-anchor="end">${fmtN(max * k / 4)}</text>`;
    if (opts.ref) out += `<line x1="${padL}" x2="${W - padR}" y1="${y(opts.ref)}" y2="${y(opts.ref)}" class="ref"/><text x="${W - padR}" y="${y(opts.ref) - 4}" class="axis ref-t" text-anchor="end">${esc(opts.refLabel || '')}</text>`;
    labels.forEach((l, i) => out += `<text x="${x(i)}" y="${H - 8}" class="axis" text-anchor="middle">${esc(l)}</text>`);
    series.forEach(s => {
      out += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;
      s.values.forEach((v, i) => out += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${s.color}"><title>${esc(s.name)} – ${esc(labels[i])}: ${fmtN(v)} ${opts.unit || ''}</title></circle>`);
    });
    return out + '</svg>';
  }

  function donut(items, opts) {
    opts = opts || {};
    const total = items.reduce((s, x) => s + x.value, 0) || 1;
    const R = 60, r = 38, C = 80; let a0 = -Math.PI / 2; let paths = '';
    items.filter(x => x.value > 0).forEach(x => {
      const a1 = a0 + 2 * Math.PI * x.value / total;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rad) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
      if (x.value / total > 0.9999) paths += `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${x.color}" stroke-width="${R - r}"><title>${esc(x.label)}: 100%</title></circle>`;
      else paths += `<path d="M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z" fill="${x.color}"><title>${esc(x.label)}: ${fmtN(x.value)} ${opts.unit || ''} (${Math.round(x.value / total * 100)}%)</title></path>`;
      a0 = a1;
    });
    return `<div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(opts.label || 'Share chart')}">${paths}
      <text x="80" y="78" text-anchor="middle" class="donut-big">${esc(opts.center || fmtN(total))}</text>
      <text x="80" y="96" text-anchor="middle" class="donut-small">${esc(opts.centerSub || opts.unit || '')}</text></svg>
      <ul class="legend">${items.filter(x => x.value > 0).map(x => `<li><span class="dot" style="background:${x.color}"></span>${esc(x.label)}<b>${Math.round(x.value / total * 100)}%</b></li>`).join('')}</ul></div>`;
  }

  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    const f = c => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
    return '#' + [f(r), f(gg), f(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  g.UI = { esc, $, $$, toast, modal, closeModal, confirmBox, icon, hbars, columns, lines, donut, shade, fmtN };
})(window);
