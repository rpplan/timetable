/* Link chart: employees on the left, companies in their three groups on the right, and lines for who works where
   at the moment chosen on the time bar. Drag nodes to arrange them; drag from the dot of an employee onto a
   company to give work; click a line to hand it over, remove it or copy it to more days or hours.
   Everything here reads and writes the same plan as the rest of the website. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, modal, closeModal } = UI;
  const V = App.views;
  const W = 1000, H = 720, NW = 168, NH = 38, PW = 184, PH = 50;
  const REG = {
    people: { x: 16, y: 16, w: 220, h: 500, label: 'Employees' },
    office: { x: 16, y: 532, w: 220, h: 172, label: 'Office & meetings' },
    main: { x: 256, y: 16, w: 728, h: 180, label: 'Main contractors' },
    outstation: { x: 256, y: 212, w: 728, h: 160, label: 'Outstation sites' },
    other: { x: 256, y: 388, w: 728, h: 316, label: 'Other contractors' }
  };
  const OFFICE_NODES = [{ id: 'office', name: 'Office work' }, { id: 'meeting', name: 'Meetings' }];
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
      const rows = Engine.slotPlan(Store.plan, o, [], App.data.gen).filter(r => r.segs.some(s => s[0] < to && s[1] > from));
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
    dates.forEach(d => plan.people.forEach(p => (App.data.gen.sched[p.id + '|' + d] || []).forEach(e => targetsOf(e, p.id, from, to).forEach(t => {
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
  function nodes() {
    const plan = Store.plan, out = [];
    plan.people.forEach(p => out.push({ id: 'p:' + p.id, pid: p.id, region: 'people', name: p.name, color: p.color, w: PW, h: PH }));
    OFFICE_NODES.forEach(n => out.push({ id: 'n:' + n.id, target: n.id, region: 'office', name: n.name, w: NW, h: NH }));
    plan.companies.forEach(c => out.push({ id: 'c:' + c.id, target: c.id, region: c.group, name: c.name, w: NW, h: NH }));
    const count = {}; out.forEach(n => { count[n.region] = (count[n.region] || 0) + 1; });
    const seen = {};
    out.forEach(n => {
      const r = REG[n.region], i = (seen[n.region] = (seen[n.region] || 0) + 1) - 1;
      const cols = n.region === 'people' || n.region === 'office' ? 1 : 4, rows = Math.ceil(count[n.region] / cols);
      const cw = (r.w - 16) / cols, rh = Math.min(84, (r.h - 34) / Math.max(1, rows));
      const def = [r.x + 8 + cw * (i % cols) + cw / 2, r.y + 30 + rh * Math.floor(i / cols) + rh / 2];
      const s = (plan.chart.pos || {})[n.id];
      n.x = s ? clampX(n, s[0]) : def[0]; n.y = s ? clampY(n, s[1]) : def[1];
    });
    return out;
  }
  const clampX = (n, x) => { const r = REG[n.region]; return Math.max(r.x + n.w / 2 + 4, Math.min(r.x + r.w - n.w / 2 - 4, x)); };
  const clampY = (n, y) => { const r = REG[n.region]; return Math.max(r.y + 26 + n.h / 2, Math.min(r.y + r.h - n.h / 2 - 4, y)); };
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  /* ---------- drawing ---------- */
  function draw(root) {
    const list = steps(); if (state.idx == null || state.idx >= list.length) state.idx = defaultIdx(list);
    const step = list[state.idx], ns = nodes(), byId = {}; ns.forEach(n => { byId[n.id] = n; });
    const links = linksAt(step);
    const tgt = t => byId['c:' + t] || byId['n:' + t];
    const path = l => {
      const a = byId['p:' + l.pid], b = tgt(l.node); if (!a || !b) return '';
      const x1 = a.x + a.w / 2, y1 = a.y;
      if (b.region === 'office') { const x2 = b.x + b.w / 2, y2 = b.y; return `M${x1},${y1} C${x1 + 70},${y1} ${x2 + 70},${y2} ${x2},${y2}`; }
      const x2 = b.x - b.w / 2, y2 = b.y, mx = (x1 + x2) / 2;
      return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    };
    const active = new Set(links.map(l => 'c:' + l.node).concat(links.map(l => 'n:' + l.node), links.map(l => 'p:' + l.pid)));
    const svg = $('#lc-svg', root);
    svg.innerHTML = `${Object.keys(REG).map(k => { const r = REG[k]; return `<g class="reg reg-${k}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14"/><text x="${r.x + 12}" y="${r.y + 19}">${esc(r.label)}<tspan class="rd">${k === 'main' || k === 'other' || k === 'outstation' ? esc(dayNote(k)) : ''}</tspan></text></g>`; }).join('')}
      <g class="links">${links.map(l => { const ty = App.TYPES[l.type] || App.TYPES.office; const n = l.items.length; return `<path class="lk ${state.sel === l.key ? 'sel' : ''} ${state.playing ? 'flow' : ''}" d="${path(l)}" data-link="${esc(l.key)}" style="--c:${ty.color};stroke-width:${Math.min(9, 2.5 + (step.kind === 'half' ? 0 : Math.log2(n) * 1.6))}"><title>${esc(App.pname(l.pid))} → ${esc(l.items[0].label)}${n > 1 ? ` (${n})` : ''}</title></path>`; }).join('')}</g>
      <g class="nodes">${ns.map(n => {
        const on = active.has(n.id), st = n.pid ? statusAt(step, n.pid) : '';
        const now = n.pid ? links.filter(l => l.pid === n.pid).map(l => l.items[0].label) : [];
        return `<g class="nd ${n.pid ? 'person' : 'co'} ${on ? 'on' : ''} ${st ? 'quiet' : ''}" data-node="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="${n.color ? `--pc:${n.color}` : ''}">
          <rect x="${-n.w / 2}" y="${-n.h / 2}" width="${n.w}" height="${n.h}" rx="${n.pid ? 12 : 9}"/>
          ${n.pid ? `<circle class="av-c" cx="${-n.w / 2 + 22}" cy="0" r="14"/><text class="av-t" x="${-n.w / 2 + 22}" y="4">${esc(n.pid)}</text>
            <text class="nm" x="${-n.w / 2 + 44}" y="-4">${esc(short(n.name, 14))}</text><text class="sub" x="${-n.w / 2 + 44}" y="12">${esc(short(st || (step.kind === 'month' ? `${links.filter(l => l.pid === n.pid).length} places` : now[0] || 'Free'), 22))}</text>
            <circle class="port" cx="${n.w / 2}" cy="0" r="8" data-port="${esc(n.pid)}"><title>Drag onto a company to give ${esc(n.name)} work</title></circle>`
            : `<text class="nm" x="0" y="4" text-anchor="middle">${esc(short(n.name, 22))}</text><title>${esc(n.name)}</title>`}</g>`;
      }).join('')}</g><path id="lc-rubber" class="rubber" d=""/>`;
    $('#lc-when', root).textContent = step.label;
    $('#lc-range', root).max = list.length - 1; $('#lc-range', root).value = state.idx;
    const hol = step.date && App.data.gen.hol[step.date];
    $('#lc-note', root).textContent = hol ? `Holiday: ${hol}` : !links.length ? (step.kind === 'half' ? 'Nobody is booked in this half hour.' : 'Nothing booked.') : `${links.length} link${links.length > 1 ? 's' : ''}`;
    panel(root, links, step);
    bindSvg(root, ns, byId, step);
  }
  function dayNote(group) { const d = Engine.windowDays(Store.plan, group); return d ? `  ·  days ${d.join(', ')}` : ''; }

  /* ---------- side panel: the selected line ---------- */
  function panel(root, links, step) {
    const box = $('#lc-panel', root), l = links.find(x => x.key === state.sel);
    if (!l) { box.innerHTML = `<h3>How to use</h3><ol class="howto"><li><b>Move the time</b> with the bar or the arrows. Choose half hours, days or months.</li><li><b>Play</b> shows the work moving through the day.</li><li><b>Drag a box</b> to arrange the chart.</li><li><b>Drag from the dot</b> ● on an employee onto a company to give work at this time.</li><li><b>Click a line</b> to hand it over, remove it, or copy it to more days or hours.</li></ol>`; return; }
    const tgtName = OFFICE_NODES.find(n => n.id === l.node) ? OFFICE_NODES.find(n => n.id === l.node).name : App.cname(l.node);
    box.innerHTML = `<h3>${App.avatar(l.pid, 'sm')} ${esc(App.pname(l.pid))} → ${esc(tgtName)}</h3>
      <ul class="lc-items">${l.items.slice(0, 40).map((it, i) => `<li><div><b>${esc(D.nice(it.date))}</b> ${esc(Engine.partsText(it.e.parts))}<br><span class="muted small">${esc(it.label)}${it.o.extra ? ' · added by hand' : ''}</span></div>
        ${App.isPast(it.date) ? '<span class="muted small">over</span>' : `<div class="lc-acts"><button type="button" class="btn ghost sm" data-copy="${i}">Copy…</button><button type="button" class="btn ghost sm" data-hand="${i}">Hand over…</button><button type="button" class="btn ghost sm danger" data-rm="${i}">${it.o.extra ? 'Delete' : 'Not this day'}</button></div>`}</li>`).join('')}</ul>
      ${l.items.length > 40 ? `<p class="muted small">and ${l.items.length - 40} more</p>` : ''}
      <button type="button" class="btn ghost sm" id="lc-unsel">Close</button>`;
    $('#lc-unsel', box).onclick = () => { state.sel = null; draw(root); };
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
        $$('[data-link]', svg).forEach(path => path.style.opacity = '.25');
      } else {
        const a = d.from; $('#lc-rubber', svg).setAttribute('d', `M${a.x + a.w / 2},${a.y} L${p.x},${p.y}`);
        $$('.nd.co', svg).forEach(x => x.classList.remove('hover'));
        const over = document.elementFromPoint(e.clientX, e.clientY); const g = over && over.closest('.nd.co'); if (g) g.classList.add('hover');
      }
    };
    svg.onpointerup = e => {
      const d = state.drag; state.drag = null; if (!d) return;
      if (d.kind === 'move') { if (d.moved) { Store.plan.chart.pos[d.n.id] = [Math.round(d.n.x), Math.round(d.n.y)]; Store.save(true); } draw(root); return; }
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
    desc: { what: 'Link chart: employees on the left and companies in their three groups on the right. Each line shows who works where at the time chosen on the time bar.',
      why: 'To see the work move through the day, the month and between companies, and to give, hand over, remove or copy work by dragging and clicking.',
      edit: 'Changes made here are the same changes as in the Edit area; they show up on every page, in Excel and in the PDFs.' },
    render() {
      return `<section class="lc"><header class="head"><h1>Link chart</h1>
          <div class="acts noprint"><button type="button" class="btn ghost" id="lc-copyall">${icon('copy')}Copy this moment…</button><button type="button" class="btn ghost" id="lc-reset">Reset layout</button><button type="button" class="btn ghost" data-print="chart">${icon('print')}Print / save PDF</button></div></header>
        <div class="lc-bar noprint">
          <div class="seg" role="group" aria-label="Time scale">${[['half', 'Half hour'], ['day', 'Day'], ['month', 'Month']].map(([k, l]) => `<button type="button" data-scale="${k}" class="${state.scale === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <button type="button" class="round" id="lc-prev" aria-label="Back">${icon('left')}</button>
          <input type="range" id="lc-range" min="0" value="0" aria-label="Time">
          <button type="button" class="round" id="lc-next" aria-label="Forward">${icon('right')}</button>
          <button type="button" class="btn primary" id="lc-play">${icon('play')}Play</button>
          <select id="lc-speed" aria-label="Speed"><option value="1200">Slow</option><option value="700" selected>Normal</option><option value="300">Fast</option></select>
        </div>
        <div class="lc-when"><b id="lc-when"></b> <span class="muted small" id="lc-note"></span></div>
        <div class="lc-grid"><div class="lc-canvas"><svg id="lc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Link chart of employees and companies"></svg></div><aside class="card lc-panel" id="lc-panel"></aside></div>
        <ul class="key">${Object.keys(App.TYPES).filter(k => k !== 'review').map(k => `<li><span style="background:${App.TYPES[k].color}"></span>${App.TYPES[k].label}</li>`).join('')}</ul></section>`;
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
      $('#lc-reset', root).onclick = () => App.commit('Chart layout reset', p => { p.chart.pos = {}; });
      $('#lc-copyall', root).onclick = () => {
        const step = steps()[state.idx]; if (step.kind === 'month') { toast('Choose the half hour or day scale to copy a moment.'); return; }
        const items = linksAt(step).flatMap(l => l.items.slice(0, 1)).filter(it => !App.isPast(it.date));
        if (!items.length) { toast('Nothing to copy at this moment.'); return; }
        copyDialog(items, step);
      };
    }
  };
})();
