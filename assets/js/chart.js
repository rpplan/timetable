/* Link chart: the team in the middle, companies around it in four coloured islands, and lines (one colour per
   employee, gold for high priority) for who works where at the moment chosen on the time bar. Drag boxes to arrange
   them; drag from the ⊕ of an employee onto a company to give work; click a line to make it high priority, hand it
   over, remove it or copy it to more days or hours.
   Everything here reads and writes the same plan as the rest of the website. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, modal, closeModal } = UI;
  const V = App.views;
  /* Two layouts. Wide (laptop): the team in the middle, companies spread around it in four coloured islands
     (main contractors on top, outstation on the right, other contractors below, office & meetings on the left).
     Tall (phone): the team on top and the islands below one another. The chart is sized to the window. */
  const ISLE = {
    people: { label: 'Team', color: '#64748b' },
    office: { label: 'Office & meetings', color: '#5c8a1e' },
    main: { label: 'Main contractors', color: '#0f8b8d' },
    outstation: { label: 'Outstation sites', color: '#d9480f' },
    other: { label: 'Other contractors', color: '#5f3dc4' }
  };
  const LAYOUTS = {
    wide: { W: 1400, H: 660, nw: 158, nh: 36, pr: 40,
      REG: { people: { x: 460, y: 190, w: 480, h: 284, round: true }, main: { x: 200, y: 6, w: 1000, h: 176, shape: 'top', rows: 1 }, outstation: { x: 1200, y: 140, w: 194, h: 350, shape: 'right' },
        other: { x: 120, y: 486, w: 1160, h: 168, shape: 'bottom', rows: 2 }, office: { x: 6, y: 200, w: 194, h: 260, shape: 'left' } } },
    tall: { W: 600, H: 1300, nw: 280, nh: 46, pr: 34,
      REG: { people: { x: 8, y: 8, w: 584, h: 150, shape: 'row' }, office: { x: 8, y: 170, w: 584, h: 96, cols: 2 }, main: { x: 8, y: 278, w: 584, h: 214, cols: 2 },
        outstation: { x: 8, y: 504, w: 584, h: 214, cols: 2 }, other: { x: 8, y: 730, w: 584, h: 562, cols: 2 } } }
  };
  let L = LAYOUTS.wide, REG = L.REG;
  const posKey = () => L === LAYOUTS.tall ? 'posRT' : 'posR';
  const OFFICE_NODES = [{ id: 'office', name: 'Office work' }, { id: 'meeting', name: 'Meetings' }];
  const GOLD = '#e2a400';
  const state = { scale: 'half', idx: null, playing: false, speed: 700, timer: null, sel: null, drag: null };

  /* ---------- time steps ---------- */
  function steps() {
    const dates = App.data.gen.dates, st = Store.plan.settings;
    if (state.scale === 'month') return [...new Set(dates.map(D.month))].map(m => ({ kind: 'month', m, label: App.monthName(m) }));
    if (state.scale === 'day') return dates.map(d => ({ kind: 'day', date: d, from: 0, to: 1440, label: D.nice(d, { long: true }) }));
    const a = Math.min(T.m('09:00'), ...App.data.gen.slots.map(s => s[0]) , T.m((Store.plan.tasks.find(t => t.type === 'meeting') || {}).start || '09:00'));
    const b = Math.max(...App.data.gen.slots.map(s => s[1]), T.m(st.workEnd || '19:00'));
    const out = [];
    dates.forEach(d => { for (let m = Math.floor(a / 30) * 30; m < b; m += 30) out.push({ kind: 'half', date: d, from: m, to: m + 30, label: `${D.nice(d, { long: true })}, ${T.s(m)}–${T.s(m + 30)}` }); });
    return out;
  }
  function defaultIdx(list) {
    const today = D.today(), now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
    let i = list.findIndex(s => s.kind === 'month' ? s.m === D.month(App.defaultDate()) : s.kind === 'day' ? s.date === App.defaultDate() : (s.date === App.defaultDate() && (s.date !== today || s.to > mins) && s.from >= App.data.gen.slots[0][0]));
    return Math.max(0, i);
  }

  /* ---------- who is linked to what ---------- */
  function targetsOf(e, pid, from, to) {
    const o = e.o, out = [];
    if (o.type === 'review' || !e.parts.some(p => p[0] < to && p[1] > from)) return out;
    const add = (node, label) => out.push({ node, label, o, e, pid });
    if (o.type === 'meeting') { add('meeting', o.title); return out; }
    if (o.siteGroup) { const vs = App.visitsFor(o, pid); if (vs.length) vs.forEach(v => add(v.company, `${App.cname(v.company)} (${v.cycle || 'site'})`)); else add('office', 'Sheets & cement calculation'); return out; }
    if (o.type === 'billing' || o.type === 'advance') {
      const rows = App.payRows(o).filter(r => r.segs.some(s => s[0] < to && s[1] > from));
      rows.forEach(r => add(r.company === 'general' ? 'office' : r.company, `${o.title}: ${r.company === 'general' ? 'all works' : App.cname(r.company)}`));
      return out;
    }
    if (o.companies && o.companies.length) { o.companies.forEach(c => add(c, o.title)); return out; }
    add('office', o.title);
    return out;
  }
  function linksAt(step) {
    const plan = Store.plan, map = {};
    const dates = step.kind === 'month' ? App.data.gen.dates.filter(d => D.month(d) === step.m) : [step.date];
    const from = step.kind === 'half' ? step.from : 0, to = step.kind === 'half' ? step.to : 1440;
    dates.forEach(d => team().forEach(p => (App.data.gen.sched[p.id + '|' + d] || []).forEach(e => targetsOf(e, p.id, from, to).forEach(t => {
      const k = p.id + '>' + t.node; (map[k] = map[k] || { key: k, pid: p.id, node: t.node, type: t.o.type, items: [] }).items.push(Object.assign({ date: d }, t));
    }))));
    return Object.values(map);
  }
  function statusAt(step, pid) {
    if (step.kind === 'month') return '';
    if (Store.plan.holidays.some(h => h.date === step.date)) return 'Holiday';
    if (App.onLeave(pid, step.date)) return 'On leave';
    if (Engine.personOff(Store.plan, pid, step.date) && !(App.data.gen.sched[pid + '|' + step.date] || []).length) return 'Day off';
    return '';
  }

  /* ---------- nodes & layout ---------- */
  const team = () => App.staff();
  function place(region, i, n) {
    const r = REG[region];
    if (L === LAYOUTS.tall) {
      if (r.shape === 'row') { const cw = r.w / n; return [r.x + cw * i + cw / 2, r.y + 66]; }
      const cols = r.cols || 2, rows = Math.ceil(n / cols), cw = (r.w - 16) / cols, rh = Math.min(64, (r.h - 50) / Math.max(1, rows));
      return [r.x + 8 + cw * (i % cols) + cw / 2, r.y + 46 + rh * Math.floor(i / cols) + rh / 2];
    }
    if (region === 'people') { const a = (-135 + i * (360 / n)) * Math.PI / 180, cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 6; return [cx + Math.cos(a) * 150, cy + Math.sin(a) * 92]; }
    if (r.shape === 'top' || r.shape === 'bottom') {
      const rows = r.rows || 1, per = Math.ceil(n / rows), row = Math.floor(i / per), k = i % per, cnt = Math.min(per, n - row * per);
      const pad = r.shape === 'top' ? 90 : 70 + (row % 2) * 30, t = cnt > 1 ? k / (cnt - 1) : .5, x = r.x + pad + t * (r.w - 2 * pad);
      const bow = (2 * t - 1) ** 2;   // the ends bend towards the team, so the island wraps around the middle
      const base = r.shape === 'top' ? r.y + 62 + bow * 84 : r.y + r.h - 46 - row * 56 - bow * (66 - row * 18);
      return [x, base];
    }
    const t = n > 1 ? i / (n - 1) : .5, y = r.y + 64 + t * (r.h - 100), bow = (2 * t - 1) ** 2;
    return [r.shape === 'right' ? r.x + r.w / 2 + 12 - (1 - bow) * 14 : r.x + r.w / 2 - 12 + (1 - bow) * 14, y];
  }
  function nodes() {
    const plan = Store.plan, out = [];
    team().forEach(p => out.push({ id: 'p:' + p.id, pid: p.id, region: 'people', name: p.name, color: p.color, r: L.pr, w: L.pr * 2, h: L.pr * 2 }));
    OFFICE_NODES.forEach(n => out.push({ id: 'n:' + n.id, target: n.id, region: 'office', name: n.name, w: L.nw, h: L.nh }));
    plan.companies.filter(c => REG[c.group]).forEach(c => out.push({ id: 'c:' + c.id, target: c.id, region: c.group, name: c.name, w: L.nw, h: L.nh }));
    const count = {}; out.forEach(n => { count[n.region] = (count[n.region] || 0) + 1; });
    const seen = {};
    out.forEach(n => {
      const i = (seen[n.region] = (seen[n.region] || 0) + 1) - 1, def = place(n.region, i, count[n.region]);
      const s = ((plan.chart || {})[posKey()] || {})[n.id];
      n.x = s ? clampX(n, s[0]) : def[0]; n.y = s ? clampY(n, s[1]) : def[1];
    });
    return out;
  }
  const clampX = (n, x) => Math.max(n.w / 2 + 4, Math.min(L.W - n.w / 2 - 4, x));
  const clampY = (n, y) => Math.max(n.h / 2 + 4, Math.min(L.H - n.h / 2 - 4, y));
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const isHigh = l => l.items.some(it => App.imp(it.o.key, it.pid) === 'high');

  /* ---------- drawing ---------- */
  function islandShape(k) {
    const r = REG[k];
    if (r.round) { const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 6; return `<ellipse cx="${cx}" cy="${cy}" rx="${r.w / 2}" ry="${r.h / 2}"/>`; }
    if (L === LAYOUTS.wide && (r.shape === 'top' || r.shape === 'bottom')) {   // a curved band that wraps around the team
      const x1 = r.x, x2 = r.x + r.w, mid = (x1 + x2) / 2;
      if (r.shape === 'top') return `<path d="M${x1 + 22},${r.y} H${x2 - 22} Q${x2},${r.y} ${x2},${r.y + 22} V${r.y + r.h} Q${mid},${r.y + r.h - 150} ${x1},${r.y + r.h} V${r.y + 22} Q${x1},${r.y} ${x1 + 22},${r.y} Z"/>`;
      const y1 = r.y - 12, y2 = r.y + r.h;
      return `<path d="M${x1},${y1} Q${mid},${y1 + 150} ${x2},${y1} V${y2 - 22} Q${x2},${y2} ${x2 - 22},${y2} H${x1 + 22} Q${x1},${y2} ${x1},${y2 - 22} Z"/>`;
    }
    return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="22"/>`;
  }
  function draw(root) {
    const cv = $('.lc-canvas', root); L = cv && cv.clientWidth && cv.clientWidth < 700 ? LAYOUTS.tall : LAYOUTS.wide; REG = L.REG;
    const list = steps(); if (state.idx == null || state.idx >= list.length) state.idx = defaultIdx(list);
    const step = list[state.idx], ns = nodes(), byId = {}; ns.forEach(n => { byId[n.id] = n; });
    const links = linksAt(step).filter(l => byId['p:' + l.pid]);
    const tgt = t => byId['c:' + t] || byId['n:' + t];
    const tall = L === LAYOUTS.tall, cx = L.W / 2, cy = REG.people.y + REG.people.h / 2;
    const path = (l, k, nk) => {
      const a = byId['p:' + l.pid], b = tgt(l.node); if (!a || !b) return '';
      if (tall) { const x1 = a.x, y1 = a.y + a.r, x2 = b.x, y2 = b.y - b.h / 2, my = (y1 + y2) / 2; return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`; }
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const x1 = a.x + dx / len * a.r, y1 = a.y + dy / len * a.r;
      // end on the side of the box that faces the person
      const side = Math.abs(dx) * (b.h / 2) > Math.abs(dy) * (b.w / 2), ex = side ? b.x - Math.sign(dx) * b.w / 2 : b.x, ey = side ? b.y : b.y - Math.sign(dy) * b.h / 2;
      // fan out from the middle: first away from the centre of the team, then into the company
      const ox = a.x - cx, oy = a.y - cy, ol = Math.hypot(ox, oy) || 1, spread = (k - (nk - 1) / 2) * 14;
      const c1x = x1 + ox / ol * 70 + (-dy / len) * spread, c1y = y1 + oy / ol * 70 + (dx / len) * spread;
      const c2x = ex - dx / len * 90, c2y = ey - dy / len * 90;
      return `M${x1.toFixed(1)},${y1.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
    };
    const perNode = {}; links.forEach(l => { (perNode[l.pid] = perNode[l.pid] || []).push(l); });
    const active = new Set(links.map(l => 'c:' + l.node).concat(links.map(l => 'n:' + l.node), links.map(l => 'p:' + l.pid)));
    const selL = links.find(l => l.key === state.sel);
    const svg = $('#lc-svg', root);
    svg.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`); svg.classList.toggle('tall', tall); svg.classList.toggle('has-sel', !!selL);
    const islands = Object.keys(REG).map(k => { const r = REG[k], c = ISLE[k].color;
      const lx = r.round ? r.x + r.w / 2 : r.shape === 'bottom' && !tall ? r.x + r.w / 2 : r.x + 16, ly = r.round ? r.y + 22 : r.shape === 'bottom' && !tall ? r.y + r.h - 8 : r.y + 22;
      return `<g class="isle isle-${k}" style="--ic:${c}">${islandShape(k)}<text x="${lx}" y="${ly}" ${r.round || (r.shape === 'bottom' && !tall) ? 'text-anchor="middle"' : ''}>${esc(ISLE[k].label)}${(k === 'main' || k === 'other') && !tall ? `<tspan class="rd">${esc(dayNote(k))}</tspan>` : ''}</text>${k === 'outstation' || (tall && (k === 'main' || k === 'other')) ? `<text class="rd2" x="${lx}" y="${ly + 17}">${esc(dayNote(k).replace(/^\s*·\s*/, ''))}</text>` : ''}</g>`; }).join('');
    const linkSvg = links.map(l => {
      const ty = App.TYPES[l.type] || App.TYPES.office, n = l.items.length, hi = isHigh(l), pc = App.pcolor(l.pid);
      const arr = perNode[l.pid], k = arr.indexOf(l), w = Math.min(10, 3 + (step.kind === 'half' ? 0 : Math.log2(n) * 1.6));
      const d = path(l, k, arr.length), on = selL && selL.key === l.key, dim = selL && !on;
      return `<g class="lkg ${hi ? 'hi' : ''} ${on ? 'sel' : ''} ${dim ? 'dim' : ''}" data-link="${esc(l.key)}">${hi ? `<path class="lk-glow" d="${d}" style="stroke-width:${w + 9}"/>` : ''}
        <path class="lk ${state.playing ? 'flow' : ''}" d="${d}" style="--c:${hi ? GOLD : pc};stroke-width:${hi ? w + 2 : w}"/><path class="lk-hit" d="${d}"/>
        <title>${esc(App.pname(l.pid))} → ${esc(l.items[0].label)}${n > 1 ? ` (${n})` : ''} · ${esc(ty.label)}${hi ? ' · HIGH PRIORITY' : ''}</title></g>`; }).join('');
    const nodeSvg = ns.map(n => {
      const on = active.has(n.id), st = n.pid ? statusAt(step, n.pid) : '', isl = ISLE[n.region].color;
      const rel = selL && (n.id === 'p:' + selL.pid || n.id === 'c:' + selL.node || n.id === 'n:' + selL.node);
      if (n.pid) {
        const mine = links.filter(l => l.pid === n.pid), now = mine.map(l => l.items[0].label);
        const sub = st || (step.kind === 'month' ? `${mine.length} places` : now[0] || 'Free');
        const pa = tall ? [n.r * .72, n.r * .72] : [n.r * .72, n.r * .72];
        return `<g class="nd person ${on ? 'on' : ''} ${st ? 'quiet' : ''} ${rel ? 'rel' : ''}" data-node="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="--pc:${n.color}">
          <circle class="halo" r="${n.r + 7}"/><circle class="disc" r="${n.r}"/><text class="av-t" y="8">${esc(n.pid)}</text>
          ${n.name !== n.pid ? `<text class="nm" y="${n.r + 19}" text-anchor="middle">${esc(short(n.name, 14))}</text>` : ''}<text class="sub" y="${n.name !== n.pid ? n.r + 35 : n.r + 20}" text-anchor="middle">${esc(short(sub, 24))}</text>
          <g class="port" data-port="${esc(n.pid)}" transform="translate(${pa[0]},${pa[1]})"><circle r="${tall ? 12 : 10}"/><path d="M-4,0H4M0,-4V4"/><title>Drag from here onto a company to give ${esc(n.name)} work</title></g></g>`;
      }
      return `<g class="nd co ${on ? 'on' : ''} ${rel ? 'rel' : ''}" data-node="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="--ic:${isl}">
        <rect x="${-n.w / 2}" y="${-n.h / 2}" width="${n.w}" height="${n.h}" rx="${n.h / 2}"/><circle class="dot" cx="${-n.w / 2 + 15}" cy="0" r="5"/>
        <text class="nm" x="${-n.w / 2 + 27}" y="5">${esc(short(n.name, tall ? 22 : 15))}</text><title>${esc(n.name)}</title></g>`;
    }).join('');
    svg.innerHTML = `<defs><filter id="lc-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter></defs>
      <g class="isles">${islands}</g><g class="links">${linkSvg}</g><g class="nodes">${nodeSvg}</g><path id="lc-rubber" class="rubber" d=""/>`;
    $('#lc-when', root).textContent = step.label;
    $('#lc-range', root).max = list.length - 1; $('#lc-range', root).value = state.idx;
    const hol = step.date && App.data.gen.hol[step.date], nHi = links.filter(isHigh).length;
    $('#lc-note', root).textContent = hol ? `Holiday: ${hol}` : !links.length ? (step.kind === 'half' ? 'Nobody is booked in this half hour.' : 'Nothing booked.') : `${links.length} link${links.length > 1 ? 's' : ''}${nHi ? ` · ${nHi} high priority` : ''}`;
    panel(root, links, step);
    bindSvg(root, ns, byId, step);
    fit(root);
  }
  /* Wide layout: the whole chart fits in the window without scrolling; tall layout (phone): scrolls with the page */
  function fit(root) {
    const svg = $('#lc-svg', root); if (!svg) return;
    if (L === LAYOUTS.tall) { svg.style.maxHeight = ''; return; }
    const top = svg.getBoundingClientRect().top + window.scrollY;
    svg.style.maxHeight = Math.max(420, window.innerHeight - 20) + 'px';   // the whole chart fits once scrolled to it
  }
  let resizeT = null;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const r = document.querySelector('.lc'); if (r && App.route.view === 'chart') draw(document.getElementById('view')); }, 150); });
  function dayNote(group) { const d = Engine.windowDays(Store.plan, group); return d ? `  ·  days ${d.join(', ')}` : ''; }

  /* ---------- floating panel: the selected line ---------- */
  function setHigh(l, on) {
    const items = l.items.filter(it => !App.isPast(it.date) && it.o.type !== 'meeting');
    if (!items.length) { toast('This link is over; priority cannot be changed.'); return; }
    App.keepScroll = true;
    App.commit(on ? `High priority: ${App.pname(l.pid)} → ${items[0].label}` : `Normal priority: ${App.pname(l.pid)} → ${items[0].label}`, p => {
      items.forEach(it => { const k = it.o.key + '|' + it.pid; if (on) p.importance[k] = 'high'; else { delete p.importance[k]; if (App.imp(it.o.key, it.pid) === 'high') p.importance[k] = 'normal'; } });
    });
  }
  function panel(root, links, step) {
    const box = $('#lc-panel', root), l = links.find(x => x.key === state.sel);
    if (!l) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const tgtName = OFFICE_NODES.find(n => n.id === l.node) ? OFFICE_NODES.find(n => n.id === l.node).name : App.cname(l.node);
    const hi = isHigh(l), canHi = l.items.some(it => !App.isPast(it.date) && it.o.type !== 'meeting');
    box.innerHTML = `<div class="lp-h" style="--pc:${App.pcolor(l.pid)}">${App.avatar(l.pid, 'sm')}<div><b>${esc(App.pname(l.pid))} → ${esc(tgtName)}</b><small>${l.items.length} time${l.items.length > 1 ? 's' : ''} · ${esc((App.TYPES[l.type] || App.TYPES.office).label)}</small></div><button type="button" class="x" id="lc-unsel" aria-label="Close">${icon('x')}</button></div>
      ${canHi ? `<button type="button" class="hi-btn ${hi ? 'on' : ''}" id="lc-hi">${hi ? '★ High priority (tap for normal)' : '☆ Make high priority'}</button>` : ''}
      <ul class="lc-items">${l.items.slice(0, 40).map((it, i) => `<li><div><b>${esc(D.nice(it.date))}</b> ${esc(Engine.partsText(it.e.parts))}${App.imp(it.o.key, it.pid) === 'high' ? ' <b class="star">★</b>' : ''}<br><span class="muted small">${esc(it.label)}${it.o.extra ? ' · added by hand' : ''}</span></div>
        ${App.isPast(it.date) ? '<span class="muted small">over</span>' : `<div class="lc-acts"><button type="button" class="btn ghost sm" data-chg="${i}" title="Move to another day, change the times or the people">Move / change</button><button type="button" class="btn ghost sm" data-copy="${i}">Copy</button><button type="button" class="btn ghost sm" data-hand="${i}">Hand over</button><button type="button" class="btn ghost sm danger" data-rm="${i}">${it.o.extra ? 'Delete' : 'Not this day'}</button></div>`}</li>`).join('')}</ul>
      ${l.items.length > 40 ? `<p class="muted small">and ${l.items.length - 40} more</p>` : ''}`;
    $('#lc-unsel', box).onclick = () => { state.sel = null; draw(root); };
    const hb = $('#lc-hi', box); if (hb) hb.onclick = () => setHigh(l, !hi);
    $$('[data-chg]', box).forEach(b => b.onclick = () => App.openOcc(l.items[+b.dataset.chg].o.key));
    $$('[data-copy]', box).forEach(b => b.onclick = () => copyDialog([l.items[+b.dataset.copy]], step));
    $$('[data-rm]', box).forEach(b => b.onclick = () => { const it = l.items[+b.dataset.rm]; removeItem(it); });
    $$('[data-hand]', box).forEach(b => b.onclick = () => { const it = l.items[+b.dataset.hand]; handDialog(it); });
  }
  function removeItem(it) {
    if (it.o.extra) return App.commit(`Deleted ${it.o.title}, ${D.nice(it.date)}`, p => { p.extra = p.extra.filter(x => 'x:' + x.id !== it.o.key); });
    if (it.o.carried) { toast('This work was carried over from leave. Cancel the leave to change it.'); return; }
    const ppl = it.o.people.filter(x => x !== it.pid);
    App.commit(`${App.pname(it.pid)} does not do ${it.o.title} on ${D.nice(it.date)}`, p => {
      p.overrides[it.o.key] = ppl.length ? Object.assign({}, p.overrides[it.o.key] || {}, { people: ppl }) : { deleted: true };
    });
  }
  function handDialog(it) {
    modal({ title: 'Hand over', body: `<p class="muted">${esc(it.label)}, ${esc(D.nice(it.date, { long: true }))}. Who does it instead of ${esc(App.pname(it.pid))}?</p>${App.peoplePicker('to', [])}`,
      foot: '<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" id="hd-ok">Hand over</button>',
      onOpen: m => { $$('input[name=to]', m).forEach(c => c.onchange = () => { $$('input[name=to]', m).forEach(o => { if (o !== c) o.checked = false; }); });
        $('#hd-ok', m).onclick = () => { const to = ($('input[name=to]:checked', m) || {}).value; if (!to) { toast('Pick a person.'); return; } closeModal();
          if (it.o.extra) App.commit(`${App.pname(to)} now does ${it.o.title}`, p => { const x = p.extra.find(y => 'x:' + y.id === it.o.key); x.people = x.people.filter(q => q !== it.pid).concat(x.people.includes(to) ? [] : [to]); });
          else App.reassign(it.o.key, it.pid, to); }; } });
  }

  /* ---------- making copies ---------- */
  function extraFrom(it, date, start, end) {
    const comp = it.node && Store.plan.companies.some(c => c.id === it.node) ? [it.node] : [];
    const type = it.o.type === 'meeting' || it.o.type === 'review' ? 'office' : it.o.type;
    return { id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: it.label, date, start, end, type, people: [it.pid], companies: comp, details: 'Copied in the Link chart.', noSite: !!it.o.noSite, importance: App.imp(it.o.key, it.pid) || '' };
  }
  function copyDialog(items, step) {
    const half = step.kind === 'half';
    modal({ title: items.length > 1 ? `Copy ${items.length} links` : 'Copy this link',
      body: `<form id="cp" class="form"><p class="muted">${items.length > 1 ? 'Everything shown at this moment' : esc(items[0].label + ', ' + D.nice(items[0].date, { long: true }))} is copied as work added by hand. The other work on those days is fitted around it.</p>
        <label>Copy to the next working days<input type="number" name="days" min="0" max="31" value="1"></label>
        ${half ? `<fieldset><legend>What to copy</legend><label class="check"><input type="radio" name="what" value="block" checked> The whole work (${esc(items.length > 1 ? 'each line' : Engine.partsText(items[0].e.parts))})</label><label class="check"><input type="radio" name="what" value="half"> Only this half hour (${T.s(step.from)}–${T.s(step.to)})</label></fieldset>
        <label>and make it longer by this many half hours on the same day<input type="number" name="halves" min="0" max="20" value="0"></label>` : ''}</form>`,
      foot: '<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="cp" class="btn primary">Copy</button>',
      onOpen: m => $('#cp', m).onsubmit = e => {
        e.preventDefault(); const fd = new FormData(e.target), days = Number(fd.get('days')) || 0, halves = Number(fd.get('halves')) || 0;
        const add = [], skipped = [];
        items.forEach(it => {
          const block = [it.e.parts[0][0], it.e.parts[it.e.parts.length - 1][1]];
          const span = half && fd.get('what') === 'half' ? [step.from, step.to + halves * 30] : (half && halves ? [block[0], block[1] + halves * 30] : block);
          if (half && halves) add.push(extraFrom(it, it.date, T.s(fd.get('what') === 'half' ? step.from : block[1]), T.s(span[1])));
          let d = it.date, n = 0;
          for (let k = 0; n < days && k < 60; k++) {
            d = D.add(d, 1); if (d > Store.plan.settings.end) break;
            if (App.data.gen.hol[d] || D.dow(d) === 0 || Engine.personOff(Store.plan, it.pid, d) || App.onLeave(it.pid, d)) continue;
            n++;
            const wm = Store.plan.companies.some(c => c.id === it.node) && (it.o.type === 'site' || it.o.type === 'outstation') ? Engine.windowProblem(Store.plan, it.node, d) : null;
            if (wm) { skipped.push(D.nice(d, { short: true })); continue; }
            add.push(extraFrom(it, d, T.s(span[0]), T.s(span[1])));
          }
        });
        closeModal();
        if (!add.length) { toast(skipped.length ? 'Nothing copied: those days are outside the company\'s site window.' : 'Nothing to copy.'); return; }
        App.commit(`Copied ${add.length} time${add.length > 1 ? 's' : ''}${skipped.length ? ` (skipped ${skipped.join(', ')}: outside the site window)` : ''}`, p => { p.extra.push(...add); });
      } });
  }

  /* ---------- new link ---------- */
  function newLink(pid, target, step) {
    const plan = Store.plan, slots = App.data.gen.slots;
    const co = plan.companies.find(c => c.id === target);
    if (target === 'meeting') { toast('Meetings are planned in Repeating work. Drop on "Office work" or a company.'); return; }
    let date = step.kind === 'month' ? (App.data.gen.dates.find(d => D.month(d) === step.m && !App.isPast(d) && !App.data.gen.hol[d]) || '') : step.date;
    if (!date || App.isPast(date)) { toast('Pick today or a later time on the time bar.'); return; }
    let a = step.kind === 'half' ? step.from : slots[0][0];
    let sl = slots.find(s => a >= s[0] && a < s[1]); if (!sl) { sl = slots.find(s => s[0] >= a) || slots[0]; a = sl[0]; }
    const b = step.kind === 'half' ? sl[1] : slots[slots.length - 1][1];
    const kind = !co ? 'office' : co.group === 'outstation' ? 'outstation' : co.id === 'ppv-works' ? 'office' : 'site';
    modal({ title: `${App.pname(pid)} → ${co ? co.name : 'Office work'}`,
      body: `<form id="nl" class="form"><label>What<input name="title" value="${esc(co ? (kind === 'office' ? co.name : `Site measurement: ${co.name}`) : 'Office work')}" required></label>
        <div class="row3"><label>Date<input type="date" name="date" value="${date}" min="${D.today()}" max="${plan.settings.end}" required></label><label>From<input type="time" name="start" value="${T.s(a)}" step="1800" required></label><label>To<input type="time" name="end" value="${T.s(b)}" step="1800" required></label></div>
        <div class="row2"><label>Kind<select name="type">${Object.keys(App.TYPES).filter(k => k !== 'review' && k !== 'meeting').map(k => `<option value="${k}" ${k === kind ? 'selected' : ''}>${App.TYPES[k].label}</option>`).join('')}</select></label>
        <label>Also on the next working days<input type="number" name="days" min="0" max="31" value="0"></label></div>
        <p class="muted small">The rest of ${esc(App.pname(pid))}'s day is fitted around this automatically.</p></form>`,
      foot: '<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="nl" class="btn primary">Add link</button>',
      onOpen: m => $('#nl', m).onsubmit = e => {
        e.preventDefault(); const fd = new FormData(e.target), type = fd.get('type'), st = fd.get('start'), en = fd.get('end');
        if (T.m(en) <= T.m(st)) { toast('The end time must be after the start time.'); return; }
        if (Engine.inGap(st, plan.settings)) { toast(`Start inside a working slot: ${App.slotsText()}.`); return; }
        const dates = [fd.get('date')]; let d = fd.get('date');
        for (let k = 0, n = 0; n < (Number(fd.get('days')) || 0) && k < 60; k++) { d = D.add(d, 1); if (d > plan.settings.end) break; if (App.data.gen.hol[d] || D.dow(d) === 0 || Engine.personOff(plan, pid, d) || App.onLeave(pid, d)) continue; n++; dates.push(d); }
        const ok = [], bad = [];
        dates.forEach(x => { const wm = co && (type === 'site' || type === 'outstation') ? Engine.windowProblem(plan, co.id, x) : null; if (wm) bad.push(wm); else ok.push(x); });
        if (!ok.length) { toast(bad[0]); return; }
        closeModal();
        const add = ok.map(x => ({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: fd.get('title'), date: x, start: st, end: en, type, people: [pid], companies: co ? [co.id] : [], details: 'Added in the Link chart.', noSite: false, importance: '' }));
        App.commit(`${App.pname(pid)} linked to ${co ? co.name : 'office work'} on ${App.listDates(ok)}${bad.length ? `. ${bad.length} day(s) skipped: outside the site window` : ''}`, p => { p.extra.push(...add); });
      } });
  }

  /* ---------- pointer handling ---------- */
  function svgPt(svg, e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
  function bindSvg(root, ns, byId, step) {
    const svg = $('#lc-svg', root);
    $$('[data-link]', svg).forEach(p => p.addEventListener('click', e => { e.stopPropagation(); state.sel = state.sel === p.dataset.link ? null : p.dataset.link; stop(root); draw(root); }));
    svg.onclick = e => { if (!e.target.closest('[data-link]') && !e.target.closest('[data-node]') && state.sel) { state.sel = null; draw(root); } };
    svg.onpointerdown = e => {
      const port = e.target.closest('[data-port]'), g = e.target.closest('[data-node]');
      if (!port && !g) return;
      e.preventDefault(); svg.setPointerCapture(e.pointerId);
      const p0 = svgPt(svg, e);
      if (port) { state.drag = { kind: 'link', pid: port.dataset.port, from: byId['p:' + port.dataset.port] }; stop(root); return; }
      const n = byId[g.dataset.node]; state.drag = { kind: 'move', n, g, dx: p0.x - n.x, dy: p0.y - n.y, moved: false };
    };
    svg.onpointermove = e => {
      const d = state.drag; if (!d) return; const p = svgPt(svg, e);
      if (d.kind === 'move') {
        d.n.x = clampX(d.n, p.x - d.dx); d.n.y = clampY(d.n, p.y - d.dy); d.moved = true;
        d.g.setAttribute('transform', `translate(${d.n.x},${d.n.y})`);
        $$('[data-link]', svg).forEach(path => path.style.opacity = '.2');
      } else {
        const a = d.from, sx = a.x, sy = a.y; $('#lc-rubber', svg).setAttribute('d', `M${sx},${sy} L${p.x},${p.y}`);
        $$('.nd.co', svg).forEach(x => x.classList.remove('hover'));
        const over = document.elementFromPoint(e.clientX, e.clientY); const g = over && over.closest('.nd.co'); if (g) g.classList.add('hover');
      }
    };
    svg.onpointerup = e => {
      const d = state.drag; state.drag = null; if (!d) return;
      if (d.kind === 'move') { if (d.moved) { const k = posKey(); Store.plan.chart = Store.plan.chart || {}; Store.plan.chart[k] = Store.plan.chart[k] || {}; Store.plan.chart[k][d.n.id] = [Math.round(d.n.x), Math.round(d.n.y)]; Store.save(true); } draw(root); return; }
      $('#lc-rubber', svg).setAttribute('d', '');
      const over = document.elementFromPoint(e.clientX, e.clientY); const g = over && over.closest('[data-node]');
      if (!g || g.dataset.node.startsWith('p:')) { draw(root); return; }
      newLink(d.pid, g.dataset.node.slice(2), step);
    };
  }

  /* ---------- playing ---------- */
  function stop(root) { state.playing = false; clearInterval(state.timer); state.timer = null; const b = root && $('#lc-play', root); if (b) b.innerHTML = icon('play') + 'Play'; }
  function play(root) {
    state.playing = true; state.sel = null; $('#lc-play', root).innerHTML = icon('pause') + 'Pause';
    state.timer = setInterval(() => {
      if (!document.body.contains(root) || !$('#lc-svg', root)) { stop(); return; }
      const n = steps().length; state.idx = (state.idx + 1) % n; draw(root);
    }, state.speed);
  }

  V.chart = {
    title: 'Link chart', editing: true,
    desc: { what: 'Link chart: the team in the middle, companies around it in coloured islands. Each line shows who works where at the time chosen.',
      why: 'The one place to see and arrange who works where: give work by dragging, and click a line to move it to another day, change its times, hand it over, remove it or copy it.',
      edit: 'Changes made here are the same changes as in the Edit area; they show up on every page, in Excel and in the PDFs.' },
    render() {
      const tip = (n, b, t) => `<li><span class="n">${n}</span><span><b>${b}</b> ${t}</span></li>`;
      return `<section class="lc"><h1 class="print-only">Link chart</h1>
        <div class="lc-how noprint"><b>How to use</b><ol>
          ${tip(1, 'Pick a time', 'or Play')}${tip(2, 'Colour', '= employee, <span class="gold-t">gold</span> = high priority')}${tip(3, 'Click a line:', 'priority, move, copy, hand over')}${tip(4, 'Drag ⊕', 'onto a company: new work; drag boxes to arrange')}</ol></div>
        <div class="lc-bar noprint">
          <div class="seg" role="group" aria-label="Time scale">${[['half', 'Half hour'], ['day', 'Day'], ['month', 'Month']].map(([k, l]) => `<button type="button" data-scale="${k}" class="${state.scale === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <button type="button" class="round" id="lc-prev" aria-label="Back">${icon('left')}</button>
          <input type="range" id="lc-range" min="0" value="0" aria-label="Time">
          <button type="button" class="round" id="lc-next" aria-label="Forward">${icon('right')}</button>
          <button type="button" class="btn primary" id="lc-play">${icon('play')}Play</button>
          <span class="lc-when"><b id="lc-when"></b> <span class="muted small" id="lc-note"></span></span>
          <select id="lc-speed" aria-label="Speed"><option value="1200">Slow</option><option value="700" selected>Normal</option><option value="300">Fast</option></select>
          <span class="lc-more"><button type="button" class="btn ghost sm" id="lc-copyall" title="Copy everything shown now to more days or hours">${icon('copy')}<span>Copy moment</span></button><button type="button" class="btn ghost sm" id="lc-reset" title="Put the boxes back in their places">Reset</button><button type="button" class="btn ghost sm" data-print="chart" title="Print / save PDF">${icon('print')}</button></span>
        </div>
        <div class="lc-canvas"><svg id="lc-svg" viewBox="0 0 1400 660" role="img" aria-label="Link chart of employees and companies"></svg><aside class="lc-panel" id="lc-panel" hidden></aside></div>
        <ul class="key lc-key">${team().map(x => `<li><span class="kl" style="background:${x.color}"></span>${esc(x.name)}</li>`).join('')}<li><span class="kl gold"></span>High priority</li>${['main', 'outstation', 'other', 'office'].map(k => `<li><span class="ki" style="--ic:${ISLE[k].color}"></span>${ISLE[k].label}</li>`).join('')}</ul></section>`;
    },
    mount(root) {
      const sp = $('#lc-speed', root); sp.value = String(state.speed);
      if (state.playing) { clearInterval(state.timer); play(root); }
      draw(root);
      $$('[data-scale]', root).forEach(b => b.onclick = () => {
        const cur = steps()[state.idx]; state.scale = b.dataset.scale; const list = steps();
        const win = App.data.gen.dates, dd = App.defaultDate();
        const date = cur && (cur.date || (cur.m && (D.month(dd) === cur.m ? dd : win.find(d => D.month(d) === cur.m))));
        let i = list.findIndex(s => s.kind === 'month' ? date && s.m === date.slice(0, 7) : s.date === date && (s.kind === 'day' || s.from >= App.data.gen.slots[0][0]));
        state.idx = Math.max(0, i); state.sel = null;
        $$('[data-scale]', root).forEach(x => x.classList.toggle('on', x === b)); draw(root);
      });
      $('#lc-range', root).oninput = e => { state.idx = +e.target.value; state.sel = null; draw(root); };
      $('#lc-prev', root).onclick = () => { stop(root); state.idx = Math.max(0, state.idx - 1); draw(root); };
      $('#lc-next', root).onclick = () => { stop(root); state.idx = Math.min(steps().length - 1, state.idx + 1); draw(root); };
      $('#lc-play', root).onclick = () => { if (state.playing) stop(root); else play(root); };
      sp.onchange = () => { state.speed = +sp.value; if (state.playing) { clearInterval(state.timer); play(root); } };
      $('#lc-reset', root).onclick = () => App.commit('Chart layout reset', p => { p.chart = p.chart || {}; p.chart.posR = {}; p.chart.posRT = {}; });
      $('#lc-copyall', root).onclick = () => {
        const step = steps()[state.idx]; if (step.kind === 'month') { toast('Choose the half hour or day scale to copy a moment.'); return; }
        const items = linksAt(step).flatMap(l => l.items.slice(0, 1)).filter(it => !App.isPast(it.date));
        if (!items.length) { toast('Nothing to copy at this moment.'); return; }
        copyDialog(items, step);
      };
    }
  };
})();
