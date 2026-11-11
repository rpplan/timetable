/* B admin: B's private schedule, opened with B's pattern. Five tabs:
   Day schedule (weekday / weekend sections with Monday and Tuesday specials), Sections (one section over the
   next 10 days, sortable), Lists (weekend work lists), PPV Works (monthly, G A M S P) and Architectural Works
   (monthly, B and S). The sections and texts come from B's update file, which is kept in the private document. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast } = UI;
  const link = params => `#/admin?${new URLSearchParams(params).toString()}`;
  const ba = () => (Store.plan.badmin = Store.plan.badmin || {});
  const short = d => `${D.DAYS[D.dow(d)].slice(0, 3)} ${D.day(d)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}`;
  const weekend = d => D.dow(d) === 0 || D.dow(d) === 6;
  const save = (rerender) => { Store.save(true); if (rerender) { App.keepScroll = true; App.render(); } else toast('Saved.'); };
  /* record of one day + one section: { t, done, items:[{done,t}], officers:[], agenda, hours:{} } */
  function rec(d, id, create) {
    const b = ba(); if (!create) return ((b.days || {})[d] || {})[id] || {};
    b.days = b.days || {}; b.days[d] = b.days[d] || {}; return (b.days[d][id] = b.days[d][id] || {});
  }
  function tidy(d, id) { const b = ba(); const r = ((b.days || {})[d] || {})[id]; if (!r) return;
    const empty = !r.t && !r.done && !(r.items || []).some(x => x && (x.t || x.done)) && !(r.officers || []).length && !r.agenda && !Object.values(r.hours || {}).some(Boolean) && !r.company;
    if (empty) { delete b.days[d][id]; if (!Object.keys(b.days[d]).length) delete b.days[d]; } }

  /* Everything in B's day, in time order */
  function dayItems(d) {
    const b = ba(), sec = b.sections || {}, dow = D.dow(d);
    const list = (weekend(d) ? sec.weekend : sec.weekday) || [];
    const out = list.map((s, i) => {
      const extra = [];
      (b.variants || []).filter(v => v.sec === s.id && v.dow === dow).forEach(v => extra.push(v.text));
      const dn = b.dinnerOut; if (dn && dn.sec === s.id && dow === 3 && (dn.weeks || []).includes(Math.ceil(D.day(d) / 7))) extra.push('★ ' + (dn.text || 'Dinner outside'));
      const prp = b.prp; if (prp && (prp.secs || []).includes(s.id) && prp.byDow && prp.byDow[dow]) extra.push((prp.label || 'Today') + ': ' + prp.byDow[dow]);
      const lists = b.lists && b.lists.sec === s.id && dow === 0;
      return { id: s.id, num: i + 1, name: s.name, start: s.start, end: s.end, note: s.note, extra, kind: lists ? 'lists' : 'section' };
    });
    (b.specials || []).filter(s => s.dow === dow).forEach(s => out.push({ id: s.id, num: 0, name: s.name, start: s.start, end: s.end, note: s.note || '', extra: [], kind: s.kind, sp: s }));
    return out.sort((a, c) => T.m(a.start) - T.m(c.start) || (a.num ? 1 : -1));
  }
  const timeTxt = it => `${it.start}–${it.end}`;

  function itemHtml(d, it) {
    const r = rec(d, it.id), k = `${d}|${it.id}`;
    let body = '';
    if (it.kind === 'checklist') body = `<ul class="ba-check">${it.sp.items.map((x, i) => { const v = (r.items || [])[i] || {}; return `<li><label class="check"><input type="checkbox" data-bi="${k}|${i}" ${v.done ? 'checked' : ''}><span class="${v.done ? 'struck' : ''}">${esc(x)}</span></label><input data-bit="${k}|${i}" value="${esc(v.t || '')}" placeholder="Details"></li>`; }).join('')}</ul>`;
    else if (it.kind === 'visit') {
      const offs = it.sp.officers || [], sel = r.officers || [], s0 = T.m(it.start), e0 = T.m(it.end), hrs = [];
      for (let t = s0; t < e0; t += 60) hrs.push(T.s(t));
      body = `<div class="ba-visit"><label>Company and site<input data-bf="${k}|company" value="${esc(r.company || '')}" list="ba-cos" placeholder="Company, site"></label>
        <div><span class="small muted">With officers</span><div class="chipset">${offs.map(o => `<label class="tchip sm ${sel.includes(o) ? 'on' : ''}"><input type="checkbox" data-boff="${k}|${esc(o)}" ${sel.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></div>
        <label>Agenda for the site visit<textarea data-bf="${k}|agenda" rows="2" placeholder="One point per line">${esc(r.agenda || '')}</textarea></label>
        <div><span class="small muted">Tentative hourly schedule</span>${hrs.map(h => `<div class="ba-hr"><span class="tm">${h}</span><input data-bh="${k}|${h}" value="${esc((r.hours || {})[h] || '')}" placeholder="Where / what"></div>`).join('')}</div></div>`;
    } else if (it.kind === 'lists') body = listsHtml(true);
    return `<li class="ba-it ${r.done ? 'done' : ''} ${it.sp ? 'sp' : ''}"><div class="ba-h"><span class="tm">${timeTxt(it)}</span><div class="ba-n"><b>${it.num ? it.num + '. ' : ''}${esc(it.name)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}${it.extra.map(x => `<span class="ba-x">${esc(x)}</span>`).join('')}</div>
        <label class="tchip sm ${r.done ? 'on' : ''}"><input type="checkbox" data-bd="${k}" ${r.done ? 'checked' : ''}><span>${r.done ? '✓ Done' : 'Done'}</span></label></div>
      ${body}<textarea class="ba-t" data-bt="${k}" rows="1" placeholder="${it.kind === 'checklist' ? 'More banking work, one per line' : 'Notes and details'}">${esc(r.t || '')}</textarea></li>`;
  }
  /* Point-by-point editor: a tick, the text (and a date for dated lists) on each line */
  function ptsHtml(key, pts, opt) {
    opt = opt || {};
    return `<ul class="pts-ed">${(pts || []).map((x, i) => `<li class="${x.done ? 'done' : ''}"><input type="checkbox" data-pd="${key}|${i}" ${x.done ? 'checked' : ''} aria-label="Done"><input class="pt-t" data-pt2="${key}|${i}" value="${esc(x.t || '')}" placeholder="${opt.ph || 'Point'}">${opt.dated ? `<input type="date" class="pt-d" data-pdt="${key}|${i}" value="${esc(x.date || '')}" aria-label="Date">` : ''}<button type="button" class="x noprint" data-prm2="${key}|${i}" aria-label="Remove">${icon('x')}</button>
      <span class="print-only">${x.done ? '✓ ' : '☐ '}${esc(x.t || '')}${opt.dated && x.date ? ` — ${esc(D.nice(x.date))}` : ''}</span></li>`).join('')}</ul>
      <button type="button" class="add-small noprint" data-padd2="${key}">${icon('plus')}${opt.add || 'Point'}</button>`;
  }
  /* where the points of a key live: "list|id", "ppv|date|pid", "arch|date|pid" */
  function ptsOf(key, create) {
    const [kind, a, c] = key.split('|'), b = ba();
    if (kind === 'list') {
      b.listItems = b.listItems || {};
      if (!b.listItems[a]) { const def = listDefs().find(l => l.id === a) || {}; const txt = (b.listText || {})[a] || def.text || '';
        const arr = txt.split('\n').map(t => t.trim()).filter(Boolean).map(t => ({ t })); if (!create) return arr; b.listItems[a] = arr; }
      return b.listItems[a];
    }
    const r = grec(kind, a, c, create); if (!create) return r.pts || [];
    return (r.pts = r.pts || []);
  }
  function listDefs() {
    const b = ba(), base = (b.lists && b.lists.items || []).map(x => ({ id: x.id, label: x.label, text: x.text, fixed: true }));
    return base.concat((b.customLists || []).map(x => ({ id: x.id, label: x.label, dated: !!x.dated })));
  }
  function listCard(l, inline) {
    const pts = ptsOf('list|' + l.id), open = pts.filter(x => !x.done).length;
    return `<article class="card wl-card" data-wl="${esc(l.id)}"><header class="wl-h">${l.fixed ? `<h3>${esc(l.label)}</h3>` : `<input class="wl-name" data-wlname="${esc(l.id)}" value="${esc(l.label)}" aria-label="List name"><h3 class="print-only">${esc(l.label)}</h3>`}
        <span class="count">${open} open</span>${inline ? '' : `<span class="wl-acts noprint"><button type="button" class="round sm" data-wlprint="${esc(l.id)}" title="Print this list" aria-label="Print this list">${icon('print')}</button>${l.fixed ? '' : `<button type="button" class="round sm" data-wldel="${esc(l.id)}" title="Delete this list" aria-label="Delete this list">${icon('trash')}</button>`}</span>`}</header>
      ${l.dated ? '<div class="wl-cols small muted"><span>Bill / tax</span><span>Date</span></div>' : ''}
      ${ptsHtml('list|' + l.id, pts, { dated: l.dated, ph: l.dated ? 'Bill or tax' : 'Work' })}</article>`;
  }
  function listsHtml(inline) {
    const b = ba(), L = b.lists; if (!L) return '';
    const ids = new Set(L.items.map(x => x.id));
    return `<div class="wl-grid inl">${listDefs().filter(l => ids.has(l.id)).map(l => listCard(l, true)).join('')}</div><p class="small"><a href="${link({ tab: 'lists' })}">All work lists</a></p>`;
  }

  /* ---------- tabs ---------- */
  function dayTab(p) {
    const st = Store.plan.settings, d = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : D.today();
    const items = dayItems(d), office = (App.data.gen.sched['B|' + d] || []).filter(e => e.o.type !== 'review');
    const done = items.filter(it => rec(d, it.id).done).length;
    return `<header class="head"><div><h2 class="h1">${esc(D.nice(d, { long: true }))}</h2><p class="muted">${weekend(d) ? 'Weekend schedule' : 'Weekday schedule'} · ${done} of ${items.length} done</p></div>
        <div class="acts noprint"><div class="nav-date"><a class="round" href="${link({ tab: 'day', date: D.add(d, -1) })}" aria-label="Previous day">${icon('left')}</a>
        <input type="date" value="${d}" id="ba-date" aria-label="Day"><a class="round" href="${link({ tab: 'day', date: D.add(d, 1) })}" aria-label="Next day">${icon('right')}</a></div>
        <a class="btn ghost" href="${link({ tab: 'day', date: D.today() })}">Today</a></div></header>
      ${office.length ? `<p class="banner">On the office timetable: ${office.map(e => `<b>${esc(Engine.partsText(e.parts))}</b> ${esc(e.o.title)}`).join(' · ')} <a href="#/today?date=${d}">open</a></p>` : ''}
      <datalist id="ba-cos">${Store.plan.companies.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <ol class="ba-day">${items.map(it => itemHtml(d, it)).join('')}</ol>`;
  }
  function secOptions() {
    const b = ba(), wd = (b.sections || {}).weekday || [], we = (b.sections || {}).weekend || [], n = Math.max(wd.length, we.length), out = [];
    for (let i = 0; i < n; i++) { const a = wd[i], c = we[i]; out.push([`n${i + 1}`, `${i + 1}. ${[a && a.name, c && c.name !== (a && a.name) ? c.name : null].filter(Boolean).join(' / ')}`]); }
    (b.specials || []).forEach(s => out.push([s.id, `${s.name} (${D.DAYS[s.dow]}s)`]));
    return out;
  }
  function sectionTab(p) {
    const opts = secOptions(), sel = opts.some(o => o[0] === p.sec) ? p.sec : (opts[0] || [''])[0], sort = p.sort || 'date';
    const days = D.range(D.today(), D.add(D.today(), 9));
    let rows = [];
    days.forEach(d => { const items = dayItems(d); const it = sel.startsWith('n') ? items.find(x => x.num === +sel.slice(1)) : items.find(x => x.id === sel); if (it) rows.push({ d, it, r: rec(d, it.id) }); });
    if (sort === 'status') rows.sort((a, c) => (!!a.r.done - !!c.r.done) || (a.d < c.d ? -1 : 1));
    if (sort === 'notes') rows.sort((a, c) => (!!c.r.t - !!a.r.t) || (a.d < c.d ? -1 : 1));
    const sb = (k, l) => `<a href="${link({ tab: 'sec', sec: sel, sort: k })}" class="${sort === k ? 'on' : ''}">${l}</a>`;
    return `<header class="head"><h2 class="h1">One section, next 10 days</h2></header>
      <div class="row-btns noprint"><select id="ba-sec" class="pick-sel" aria-label="Section">${opts.map(o => `<option value="${o[0]}" ${o[0] === sel ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>
        <nav class="tabs plain">${sb('date', 'By date')}${sb('status', 'Not done first')}${sb('notes', 'With notes first')}</nav></div>
      <div class="scroll"><table class="tbl ba-sec"><thead><tr><th>Day</th><th>Time</th><th>Section and today's plan</th><th>Notes</th><th>Done</th></tr></thead><tbody>${rows.map(({ d, it, r }) => `<tr class="${r.done ? 'done' : ''}">
        <th class="rowhead"><a href="${link({ tab: 'day', date: d })}">${short(d)}</a></th><td class="tm">${timeTxt(it)}</td>
        <td><b>${esc(it.name)}</b>${it.extra.map(x => `<div class="ba-x">${esc(x)}</div>`).join('')}</td>
        <td><textarea class="ba-t" data-bt="${d}|${it.id}" rows="1" placeholder="Notes">${esc(r.t || '')}</textarea></td>
        <td><input type="checkbox" data-bd="${d}|${it.id}" ${r.done ? 'checked' : ''} aria-label="Done"></td></tr>`).join('') || '<tr><td colspan="5" class="free">This section is not in the next 10 days.</td></tr>'}</tbody></table></div>`;
  }
  function listsTab() {
    return `<header class="head"><h2 class="h1">Work lists</h2><div class="acts noprint"><button type="button" class="btn ghost" id="wl-printall">${icon('print')}Print all lists on one page</button></div></header>
      <div class="wl-grid">${listDefs().map(l => listCard(l, false)).join('')}</div>
      <form class="wl-new card noprint" id="wl-new"><b>New list</b><input name="n" placeholder="Name of the new list" required aria-label="Name of the new list"><label class="check small"><input type="checkbox" name="dated"> With a date for each item</label><button type="submit" class="btn primary sm">${icon('plus')}Add list</button></form>`;
  }
  /* monthly grids (PPV and Architectural) */
  const months = () => { const st = Store.plan.settings, out = []; let m = D.month(st.start); while (m <= D.month(st.end)) { out.push(m); const [y, mo] = m.split('-').map(Number); m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; } return out; };
  const pickM = p => { const ms = months(); return ms.includes(p.m) ? p.m : (ms.includes(D.month(D.today())) ? D.month(D.today()) : ms[0]); };
  const mTabs = (tab, cur, from) => `<nav class="tabs plain noprint">${months().filter(m => !from || m >= D.month(D.today())).map(m => `<a href="${link({ tab, m })}" class="${m === cur ? 'on' : ''}">${App.monthName(m)}</a>`).join('')}</nav>`;
  const mDates = m => { const [y, mo] = m.split('-').map(Number); return D.range(`${m}-01`, `${m}-${String(D.monthLen(y, mo)).padStart(2, '0')}`); };
  const offDay = d => App.data.gen.hol[d] || (D.dow(d) === 0 ? 'Sunday' : '');
  const ppvOcc = (pid, d) => (App.data.byDate[d] || []).filter(o => o.people.includes(pid) && o.type !== 'meeting' && (/ppv/i.test(o.title) || (o.companies || []).includes('ppv-works')) && !App.onLeave(pid, d));
  const grec = (store, d, pid, create) => { const b = ba(); b[store] = b[store] || {}; const days = b[store].days = b[store].days || {}; if (!create) return (days[d] || {})[pid] || {}; days[d] = days[d] || {}; return (days[d][pid] = days[d][pid] || {}); };
  const tick = (store, d, pid, r, label) => `<label class="check small"><input type="checkbox" data-gd="${store}|${d}|${pid}" ${r.done ? 'checked' : ''}> ${label || 'Done'}</label>`;
  const note = (store, d, pid, r) => `${r.t ? `<div class="fine">${esc(r.t)}</div>` : ''}${ptsHtml(`${store}|${d}|${pid}`, r.pts, { ph: 'Note' })}`;
  /* the notes of the last earlier day that has notes, shown on today's line */
  function earlier(store, d, pid) {
    const days = (ba()[store] || {}).days || {}, prev = Object.keys(days).filter(x => x < d && days[x][pid] && ((days[x][pid].pts || []).some(y => y.t) || days[x][pid].t)).sort().pop();
    if (!prev) return ''; const r = days[prev][pid];
    return `<div class="g-prev"><small>Notes of ${esc(short(prev))}:</small><ul>${(r.pts || []).filter(y => y.t).map(y => `<li>${y.done ? '✓ ' : ''}${esc(y.t)}</li>`).join('')}${r.t ? `<li>${esc(r.t)}</li>` : ''}</ul></div>`;
  }

  function ppvTab(p) {
    const b = ba(), ppv = b.ppv; if (!ppv) return '<p class="free">No PPV schedule yet: load B\'s update file.</p>';
    const ms = months().filter(x => x >= D.month(D.today())), m = ms.includes(p.m) ? p.m : (ms[0] || pickM(p)), ppl = ppv.people || [], mt = ppv.meeting;
    const firstOfWeek = {}; // S: weekly coordination with the accountant on the first PPV day of each week
    const today = D.today();
    const rows = mDates(m).filter(d => d >= today).map(d => {
      const prevN = pid => d === today ? earlier('ppv', d, pid) : '';
      const off = offDay(d);
      if (off) return `<tr class="thin"><th class="rowhead">${short(d)}</th><td colspan="${ppl.length}">${esc(off)}</td></tr>`;
      const cells = ppl.map(x => {
        const r = grec('ppv', d, x.id), sat = D.dow(d) === 6;
        if (x.rpplan) {
          const occ = ppvOcc(x.rpplan, d);
          const wantDay = x.monthDays ? occ.length > 0 : occ.length > 0;
          if (!wantDay) { const busy = (App.data.gen.sched[x.rpplan + '|' + d] || []).filter(e => e.o.type !== 'review'); return `<td class="g-rp"><span class="muted small">${App.onLeave(x.rpplan, d) ? 'On leave' : busy.length ? 'Rpplan: ' + esc(busy.map(e => e.o.title).join(', ')) : sat ? '–' : 'Rpplan day'}</span></td>`; }
          const tm = occ.map(o => App.timeText(o, x.rpplan)).join(', ');
          let extra = '';
          if (x.weekly) { const w = D.weekStart(d); if (!firstOfWeek[w]) { firstOfWeek[w] = d; extra = `<div class="small"><b>${esc(x.weekly)}</b></div>`; } }
          return `<td class="g-on" style="--c:${x.color}"><div class="mline"><span class="tm">${esc(tm)}</span> <b>PPV</b>: ${esc(x.duty || '')}</div>${extra}${prevN(x.id)}${tick('ppv', d, x.id, r)}${note('ppv', d, x.id, r)}</td>`;
        }
        if (x.visits) { const v = r.v || []; return `<td style="--c:${x.color}"><div class="mline">${esc(x.duty || 'Valuation visits')}</div><div class="visits">${Array.from({ length: x.visits }, (_, i) => `<label title="Visit ${i + 1}"><input type="checkbox" data-gv="${d}|${x.id}|${i}" ${v[i] ? 'checked' : ''}><span>${i + 1}</span></label>`).join('')}<small>${v.filter(Boolean).length}/${x.visits}</small></div>${prevN(x.id)}${note('ppv', d, x.id, r)}</td>`; }
        return `<td style="--c:${x.color}"><div class="mline g-duty" title="${esc(x.duty || '')}">${esc(x.duty || '')}</div>${prevN(x.id)}${tick('ppv', d, x.id, r)}${note('ppv', d, x.id, r)}</td>`;
      }).join('');
      let meet = '';
      if (mt && D.dow(d) === mt.dow) { const r = grec('ppv', d, 'meet'), a = r.a || [];
        meet = `<tr class="g-meet"><th class="rowhead">${mt.start}</th><td colspan="${ppl.length}"><b>${esc(mt.title)}</b> <span class="muted small">G, A, M, S with B</span><div class="chipset">${mt.agenda.map((x, i) => `<label class="tchip sm ${a[i] ? 'on' : ''}"><input type="checkbox" data-gm="${d}|${i}" ${a[i] ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>${prevN('meet')}${note('ppv', d, 'meet', r)}</td></tr>`; }
      return `<tr class="${App.isPast(d) ? 'past' : ''}"><th class="rowhead"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</th>${cells}</tr>${meet}`;
    }).join('');
    return `<header class="head"><h2 class="h1">PPV Works: ${App.monthName(m)}</h2><button type="button" class="btn ghost noprint" data-print="admin">${icon('print')}Print / save PDF</button></header>${mTabs('ppv', m, true)}
      <p class="muted small">From today on; today's line also shows the notes of the earlier day. G, A and M work on Saturdays too. S works for PPV only in his PPV time on the office timetable, so it never clashes with Rpplan work. P's PPV tax work is on the 1st and 2nd of the month. A and M tick each valuation visit.</p>
      <div class="scroll"><table class="week month g-tbl" style="min-width:${110 + ppl.length * 190}px"><thead><tr><th>Date</th>${ppl.map(x => `<th style="border-top:4px solid ${x.color}"><b>${esc(x.name)}</b><small class="muted"> ${esc(x.duty ? x.duty.split(',')[0] : '')}</small></th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${ppl.length + 1}" class="free">No more days this month.</td></tr>`}</tbody></table></div>`;
  }
  function archTab(p) {
    const b = ba(), ar = b.arch; if (!ar) return '<p class="free">No Architectural Works schedule yet: load B\'s update file.</p>';
    const m = pickM(p), ppl = ar.people || [], today = D.today();
    const days = mDates(m).filter(d => !offDay(d) && (ar.byDow || {})[D.dow(d)]);
    const dayHtml = d => { const txt = ar.byDow[D.dow(d)], cnt = ppl.reduce((n, pid) => n + (grec('arch', d, pid).pts || []).filter(x => x.t).length, 0), dn = ppl.filter(pid => grec('arch', d, pid).done).length;
      return `<details class="ar-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" ${d === today || p.open === d ? 'open' : ''}><summary><b>${esc(short(d))}</b>${d === today ? ' <span class="ml-st today">Today</span>' : ''}<span class="ar-w">${esc(txt)}</span><span class="muted small">${cnt ? cnt + ' point' + (cnt > 1 ? 's' : '') : ''}${dn ? ` · ${dn}/${ppl.length} done` : ''}</span></summary>
        <div class="ar-grid">${ppl.map(pid => { const r = grec('arch', d, pid);
          const busy = pid !== 'B' ? (App.data.gen.sched[pid + '|' + d] || []).filter(e => e.o.type !== 'review') : [];
          return `<div class="ar-p" style="--pc:${App.pcolor(pid)}"><div class="ar-ph">${App.who(pid)}${tick('arch', d, pid, r)}</div>${busy.length ? `<div class="fine">Rpplan: ${esc(busy.map(e => Engine.partsText(e.parts) + ' ' + e.o.title).join(', '))}</div>` : ''}${r.t ? `<div class="fine">${esc(r.t)}</div>` : ''}${ptsHtml(`arch|${d}|${pid}`, r.pts, { ph: 'Work point' })}</div>`; }).join('')}</div></details>`; };
    return `<header class="head"><h2 class="h1">Architectural Works: ${App.monthName(m)}</h2><button type="button" class="btn ghost noprint" data-print="admin">${icon('print')}Print / save PDF</button></header>${mTabs('arch', m)}
      <p class="muted small">Today is open; click any other day to open it.</p>
      <div class="ar-list">${days.map(dayHtml).join('') || '<p class="free">No architectural work days this month.</p>'}</div>`;
  }

  App.views.admin = {
    title: 'B admin', editing: true,
    desc: { what: 'B admin: B\'s private schedule, opened with B\'s pattern.', why: 'Day schedule with the weekday and weekend sections, Monday banking, officers meeting and goodwill visits, the Tuesday site visit; one section over the next 10 days; work lists; PPV Works and Architectural Works monthly schedules.' },
    render(p) {
      if (!App.adminOpen()) return `<section><article class="card locked"><div class="lock-big">${icon('lock')}</div><h2>Locked</h2><p class="muted">B's personal schedule, PPV Works and Architectural Works. Open it with B's pattern${Store.plan.settings.bPin ? '' : ' (draw a new one the first time)'}.</p>
        <button type="button" class="btn primary" id="adm-open">${icon('unlock')}Open with pattern</button></article></section>`;
      const b = ba();
      if (!b.sections) return `<section><header class="head"><h1>B admin</h1><button type="button" class="btn ghost" id="adm-lock">${icon('lock')}Lock</button></header><article class="card"><h2>Load B's schedule</h2><p class="muted">The sections, daily plans, lists, PPV and Architectural schedules are kept private: they are not in the website files. Load the update file once (setup/update-nov-2026.json) and they are saved in the database.</p>
        <label class="btn primary">${icon('upload')}Load update file<input type="file" id="adm-up" accept=".json" hidden></label></article></section>`;
      const tab = ['day', 'sec', 'lists', 'ppv', 'arch'].includes(p.tab) ? p.tab : 'day';
      const tabs = [['day', 'Day schedule'], ['sec', 'Sections, next 10 days'], ['lists', 'Work lists'], ['ppv', 'PPV Works'], ['arch', 'Architectural Works']];
      const body = { day: dayTab, sec: sectionTab, lists: listsTab, ppv: ppvTab, arch: archTab }[tab](p);
      return `<section class="ba"><header class="head"><h1>B admin</h1><div class="acts noprint"><button type="button" class="btn ghost" id="adm-lock">${icon('lock')}Lock</button></div></header>
        <nav class="tabs ba-tabs noprint">${tabs.map(([k, l]) => `<a href="${link({ tab: k })}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>${body}</section>`;
    },
    mount(root, p) {
      const o = $('#adm-open', root); if (o) o.onclick = () => App.requireB(() => {}, 'Draw B\'s pattern to open B admin.');
      const l = $('#adm-lock', root); if (l) l.onclick = () => App.lockB();
      const up = $('#adm-up', root); if (up) up.onchange = async () => { try { const u = JSON.parse(await up.files[0].text()); let done; App.commit('B\'s update file loaded', pl => { done = Store.applyUpdate(pl, u); }); toast(`Loaded: ${done.join(', ')}.`); } catch (e) { toast('That is not an update file.'); } };
      const dt = $('#ba-date', root); if (dt) dt.onchange = () => { if (dt.value) location.hash = link({ tab: 'day', date: dt.value }); };
      const sec = $('#ba-sec', root); if (sec) sec.onchange = () => { location.hash = link({ tab: 'sec', sec: sec.value, sort: p.sort || 'date' }); };
      const grow = t => { const g = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }; g(); t.addEventListener('input', g); };
      const split = s => { const a = s.split('|'); return a; };
      $$('[data-bt]', root).forEach(t => { grow(t); t.onchange = () => { const [d, id] = split(t.dataset.bt); const r = rec(d, id, true); if (t.value.trim()) r.t = t.value; else delete r.t; tidy(d, id); save(); }; });
      $$('[data-bd]', root).forEach(c => c.onchange = () => { const [d, id] = split(c.dataset.bd); const r = rec(d, id, true); if (c.checked) r.done = true; else delete r.done; tidy(d, id); save(true); });
      $$('[data-bi]', root).forEach(c => c.onchange = () => { const [d, id, i] = split(c.dataset.bi); const r = rec(d, id, true); r.items = r.items || []; r.items[+i] = Object.assign({}, r.items[+i], { done: c.checked }); tidy(d, id); save(true); });
      $$('[data-bit]', root).forEach(t => t.onchange = () => { const [d, id, i] = split(t.dataset.bit); const r = rec(d, id, true); r.items = r.items || []; r.items[+i] = Object.assign({}, r.items[+i], { t: t.value }); tidy(d, id); save(); });
      $$('[data-bf]', root).forEach(t => { if (t.tagName === 'TEXTAREA') grow(t); t.onchange = () => { const [d, id, f] = split(t.dataset.bf); const r = rec(d, id, true); if (t.value.trim()) r[f] = t.value; else delete r[f]; tidy(d, id); save(); }; });
      $$('[data-bh]', root).forEach(t => t.onchange = () => { const [d, id, h] = split(t.dataset.bh); const r = rec(d, id, true); r.hours = r.hours || {}; if (t.value.trim()) r.hours[h] = t.value; else delete r.hours[h]; tidy(d, id); save(); });
      $$('[data-boff]', root).forEach(c => c.onchange = () => { const [d, id, o2] = split(c.dataset.boff); const r = rec(d, id, true); const s = new Set(r.officers || []); if (c.checked) s.add(o2); else s.delete(o2); r.officers = [...s]; tidy(d, id); save(true); });
      $$('[data-bl]', root).forEach(t => { grow(t); t.onchange = () => { const b = ba(); b.listText = b.listText || {}; b.listText[t.dataset.bl] = t.value; save(); }; });
      $$('[data-gd]', root).forEach(c => c.onchange = () => { const [st, d, pid] = split(c.dataset.gd); const r = grec(st, d, pid, true); if (c.checked) r.done = true; else delete r.done; save(true); });
      $$('[data-gn]', root).forEach(t => t.onchange = () => { const [st, d, pid] = split(t.dataset.gn); const r = grec(st, d, pid, true); if (t.value.trim()) r.t = t.value; else delete r.t; save(); });
      $$('[data-gv]', root).forEach(c => c.onchange = () => { const [d, pid, i] = split(c.dataset.gv); const r = grec('ppv', d, pid, true); r.v = r.v || []; r.v[+i] = c.checked; save(true); });
      /* points */
      const ptsSave = (key, fn, rerender) => { const arr = ptsOf(key, true); fn(arr); save(rerender); };
      const sp3 = s2 => { const i = s2.lastIndexOf('|'); return [s2.slice(0, i), +s2.slice(i + 1)]; };
      $$('[data-pt2]', root).forEach(i => { i.onchange = () => { const [k, n] = sp3(i.dataset.pt2); ptsSave(k, a => { a[n] = Object.assign({}, a[n], { t: i.value }); }); };
        i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const [k, n] = sp3(i.dataset.pt2); ptsSave(k, a => { a[n] = Object.assign({}, a[n], { t: i.value }); a.splice(n + 1, 0, { t: '' }); }, true); setTimeout(() => { const nx = document.querySelector(`[data-pt2="${k}|${n + 1}"]`); if (nx) nx.focus(); }, 50); } }; });
      $$('[data-pd]', root).forEach(c => c.onchange = () => { const [k, n] = sp3(c.dataset.pd); ptsSave(k, a => { a[n] = Object.assign({}, a[n], { done: c.checked }); }, true); });
      $$('[data-pdt]', root).forEach(c => c.onchange = () => { const [k, n] = sp3(c.dataset.pdt); ptsSave(k, a => { a[n] = Object.assign({}, a[n], { date: c.value }); }); });
      $$('[data-prm2]', root).forEach(c => c.onclick = () => { const [k, n] = sp3(c.dataset.prm2); ptsSave(k, a => { a.splice(n, 1); }, true); });
      $$('[data-padd2]', root).forEach(c => c.onclick = () => { const k = c.dataset.padd2; ptsSave(k, a => { a.push({ t: '' }); }, true); setTimeout(() => { const l = document.querySelectorAll(`[data-pt2^="${k}|"]`); if (l.length) l[l.length - 1].focus(); }, 50); });
      /* work lists */
      const wn = $('#wl-new', root); if (wn) wn.onsubmit = e => { e.preventDefault(); const fd = new FormData(wn), n = String(fd.get('n') || '').trim(); if (!n) return; const b = ba(); b.customLists = b.customLists || []; b.customLists.push({ id: 'l' + Date.now().toString(36), label: n, dated: !!fd.get('dated') }); save(true); toast(`List "${n}" added.`); };
      $$('[data-wlname]', root).forEach(i => i.onchange = () => { const l = (ba().customLists || []).find(x => x.id === i.dataset.wlname); if (l && i.value.trim()) { l.label = i.value.trim(); save(); } });
      $$('[data-wldel]', root).forEach(btn => btn.onclick = () => UI.confirmBox('Delete this list?', 'The list and all its items are deleted.', 'Delete', () => { const b = ba(), id = btn.dataset.wldel; b.customLists = (b.customLists || []).filter(x => x.id !== id); if (b.listItems) delete b.listItems[id]; save(true); }, true));
      const printLists = only => { $$('.wl-card', root).forEach(c => c.classList.toggle('print-hide', !!only && c.dataset.wl !== only)); document.body.dataset.print = 'lists';
        const restore = () => { $$('.wl-card', root).forEach(c => c.classList.remove('print-hide')); window.removeEventListener('afterprint', restore); }; window.addEventListener('afterprint', restore); window.print(); };
      const pa = $('#wl-printall', root); if (pa) pa.onclick = () => printLists(null);
      $$('[data-wlprint]', root).forEach(btn => btn.onclick = () => printLists(btn.dataset.wlprint));
      $$('[data-gm]', root).forEach(c => c.onchange = () => { const [d, i] = split(c.dataset.gm); const r = grec('ppv', d, 'meet', true); r.a = r.a || []; r.a[+i] = c.checked; save(true); });
    }
  };
})();
