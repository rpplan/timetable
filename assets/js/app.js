/* App core: data, routing, shared pieces, edit dialogs, drag & drop. */
(function (g) {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, modal, closeModal } = UI;

  const TYPES = {
    meeting: { label: 'Meeting', color: '#6b63c9', bg: '#eeedfb' },
    site: { label: 'Site measurement', color: '#1f8a78', bg: '#e3f4f0' },
    outstation: { label: 'Outstation', color: '#c0701c', bg: '#fbeedd' },
    billing: { label: 'Billing', color: '#cc3f5a', bg: '#fbe6ea' },
    advance: { label: 'Advances', color: '#2f74c8', bg: '#e4eefa' },
    office: { label: 'Office work', color: '#5c8a1e', bg: '#edf4e1' },
    review: { label: 'Daily check', color: '#6f7b82', bg: '#eef1f2' }
  };
  const GROUPS = { main: 'Main contractors', outstation: 'Outstation sites', other: 'Other contractors' };

  const App = {
    TYPES, GROUPS, views: {}, data: null, route: { view: 'today', params: {} },

    compute() {
      const plan = Store.plan;
      const gen = Engine.generate(plan);
      const iss = Engine.issues(plan, gen);
      const stats = Engine.stats(plan, gen);
      const byKey = {}, byDate = {}, visitsBy = {};
      gen.occs.forEach(o => { byKey[o.key] = o; (byDate[o.date] = byDate[o.date] || []).push(o); });
      gen.visits.forEach(v => { const k = v.runKey + '|' + v.person + '|' + v.date; (visitsBy[k] = visitsBy[k] || []).push(v); });
      const clashKeys = new Set(), clashPD = new Set();
      iss.filter(i => i.level === 'clash').forEach(i => { (i.keys || []).forEach(k => clashKeys.add(k)); clashPD.add(i.person + '|' + i.date); });
      this.data = { plan, gen, iss, stats, byKey, byDate, visitsBy, clashKeys, clashPD };
      return this.data;
    },

    /* ---------- lookups ---------- */
    person(id) { return Engine.personOf(Store.plan, id); },
    pname(id) { const p = this.person(id); return p ? p.name : id; },
    pcolor(id) { const p = this.person(id); return p ? p.color : '#888'; },
    cname(id) { return Engine.companyName(Store.plan, id); },
    task(id) { return Store.plan.tasks.find(t => t.id === id); },
    isWorking(d) { return !this.data.gen.hol[d] && !(D.dow(d) === 0 && Store.plan.settings.sundayOff); },
    visitsFor(o, pid) { return this.data.visitsBy[o.runKey + '|' + pid + '|' + o.date] || []; },
    isPast(d) { return d < D.today(); },
    entry(o, pid) { return (this.data.gen.sched[pid + '|' + o.date] || []).find(e => e.key === o.key) || null; },
    slotLabel(i) { const s = this.data.gen.slots[i]; return s ? `Slot ${i + 1} ${T.s(s[0])}–${T.s(s[1])}` : ''; },
    slotsText() { return this.data.gen.slots.map((s, i) => this.slotLabel(i)).join(' and '); },
    remark(key, pid) { return (Store.plan.remarks || {})[key + '|' + pid] || {}; },
    defaultDate() { const st = Store.plan.settings, t = D.today(); return (t >= st.start && t <= st.end) ? t : st.start; },

    /* What this person does in this piece of work (site runs name the company) */
    personLabel(o, pid) {
      if (o.siteGroup && pid) {
        const v = this.visitsFor(o, pid);
        if (v.length) return v.map(x => this.cname(x.company) + (x.together ? ' (with ' + this.data.gen.visits.filter(y => y.runKey === x.runKey && y.date === x.date && y.company === x.company && y.person !== pid).map(y => this.pname(y.person)).join(', ') + ')' : '')).join(', ');
        return o.siteGroup === 'outstation' ? 'Outstation: sheets, cement calculation' : 'Sheet preparation, cement calculation';
      }
      return o.title;
    },
    /* Time text: the person's fitted time when given, otherwise the planned time without the break */
    timeText(o, pid) {
      const e = pid ? this.entry(o, pid) : null;
      if (e) return e.noTime ? 'No free slot' : Engine.partsText(e.parts);
      return Engine.partsText(Engine.minusGaps(T.m(o.start), T.m(o.end), Store.plan.settings));
    },
    /* A person's day as fitted into the slots: [{o, e, a, b, slot}] one row per time part, plus "no time" rows */
    dayRows(date, pid) {
      const list = this.data.gen.sched[pid + '|' + date] || [], slots = this.data.gen.slots, rows = [];
      list.forEach(e => {
        if (e.noTime) { rows.push({ o: e.o, e, a: 99999, b: 99999, slot: -1, noTime: true }); return; }
        e.parts.forEach(p => rows.push({ o: e.o, e, a: p[0], b: p[1], slot: slots.findIndex(s => p[0] >= s[0] && p[0] < s[1]) }));
      });
      return rows.sort((x, y) => x.a - y.a);
    },
    whereLabel(date, pid) {
      const hol = this.data.gen.hol[date];
      if (hol) return { k: 'off', text: hol };
      if (Engine.personOff(Store.plan, pid, date) && !(this.data.byDate[date] || []).some(o => o.people.includes(pid))) return { k: 'off', text: 'Weekly day off' };
      const mine = (this.data.byDate[date] || []).filter(o => o.people.includes(pid) && o.type !== 'review');
      const out = mine.find(o => o.type === 'outstation');
      if (out) { const v = this.visitsFor(out, pid); return { k: 'out', text: 'Outstation' + (v.length ? ': ' + v.map(x => this.cname(x.company)).join(', ') : '') }; }
      const site = mine.find(o => o.type === 'site');
      if (site) { const v = this.visitsFor(site, pid); return { k: 'site', text: v.length ? 'On site: ' + v.map(x => this.cname(x.company)).join(', ') : 'Sheets & cement calculation' }; }
      if (mine.length) return { k: 'office', text: mine.some(o => o.noSite) ? 'In office (no site work today)' : 'In office' };
      if (D.dow(date) === 0) return { k: 'off', text: 'Sunday' };
      return { k: 'free', text: 'Free' };
    },

    /* ---------- shared pieces ---------- */
    avatar(id, size) { const p = this.person(id); return `<span class="av ${size || ''}" style="--pc:${p ? p.color : '#999'}">${esc(p ? p.id : id)}</span>`; },
    who(id) { const p = this.person(id); return `<span class="who"><span class="av sm" style="--pc:${p ? p.color : '#999'}">${esc(p ? p.id : id)}</span>${esc(p ? p.name : id)}</span>`; },
    pill(o, pid, opts) {
      opts = opts || {};
      const ty = TYPES[o.type] || TYPES.office;
      const clash = this.data.clashKeys.has(o.key) && (!pid || this.data.clashPD.has(pid + '|' + o.date));
      const e = pid ? this.entry(o, pid) : null, past = this.isPast(o.date);
      const startT = e && e.parts.length ? T.s(e.parts[0][0]) : o.start;
      const rk = pid ? this.remark(o.key, pid) : {};
      const tag = past ? 'span' : 'button';
      return `<${tag} ${past ? '' : 'type="button"'} class="pill ${clash ? 'clash' : ''} ${o.status === 'done' || rk.s === 'done' ? 'done' : ''} ${past ? 'past' : ''} ${e && e.noTime ? 'notime' : ''}" style="--c:${ty.color};--bg:${ty.bg}" ${past ? '' : `data-occ="${esc(o.key)}" draggable="true"`} ${pid && !past ? `data-from="${esc(pid)}"` : ''}
        title="${esc(o.title + '\n' + this.timeText(o, pid) + (rk.s ? '\nStatus: ' + (REMARK_LABELS[rk.s] || rk.s) : '') + (rk.t ? '\nRemarks: ' + rk.t : '') + '\n' + o.people.map(p => this.pname(p)).join(', ') + (o.away && o.away.length ? '\nOut of station: ' + o.away.map(p => this.pname(p)).join(', ') : '') + (clash ? '\nClash: booked twice' : ''))}">
        ${opts.time !== false ? `<span class="pt">${e && e.noTime ? '–' : startT}</span>` : ''}<span class="pl">${esc(pid ? this.personLabel(o, pid) : o.title)}</span>${opts.people ? `<span class="pp">${o.people.map(p => `<i style="--pc:${this.pcolor(p)}">${esc(this.person(p) ? this.person(p).id : p)}</i>`).join('')}</span>` : ''}</${tag}>`;
    },
    typeTag(t) { const ty = TYPES[t] || TYPES.office; return `<span class="tag" style="--c:${ty.color};--bg:${ty.bg}">${ty.label}</span>`; },
    peoplePicker(name, selected, opts) {
      opts = opts || {};
      return `<div class="picks">${Store.plan.people.map(p => `<label class="pick" style="--pc:${p.color}"><input type="checkbox" name="${name}" value="${esc(p.id)}" ${selected.includes(p.id) ? 'checked' : ''} ${opts.data ? `data-${opts.data}` : ''}><span>${esc(p.name)}</span></label>`).join('')}</div>`;
    },

    /* ---------- routing ---------- */
    go(view, params) { location.hash = '#/' + view + (params ? '?' + new URLSearchParams(params).toString() : ''); },
    parseHash() {
      const [v, q] = location.hash.replace(/^#\/?/, '').split('?');
      this.route = { view: this.views[v] ? v : 'today', params: Object.fromEntries(new URLSearchParams(q || '')) };
    },
    render() {
      this.compute();
      const v = this.views[this.route.view];
      const root = $('#view');
      const y = window.scrollY;
      root.innerHTML = v.render(this.route.params);
      if (v.mount) v.mount(root, this.route.params);
      bindCommon(root);
      $$('#nav a').forEach(a => { const on = a.dataset.view === this.route.view; a.classList.toggle('on', on); a.setAttribute('aria-current', on ? 'page' : 'false'); });
      $('#undo').disabled = !Store.undoStack.length;
      const n = this.data.iss.filter(i => i.level === 'clash').length;
      const b = $('#clash-badge'); b.hidden = !n; b.textContent = n === 1 ? '1 clash' : `${n} clashes`;
      document.title = `${v.title} – ${Store.plan.title || 'Works timetable'}`;
      if (this.keepScroll) { window.scrollTo(0, y); this.keepScroll = false; }
    },

    /* ---------- changes ---------- */
    commit(label, fn) {
      App.keepScroll = true;
      Store.change(label, fn);
      toast(label, { label: 'Undo', run: () => { App.keepScroll = true; Store.undo(); } });
    },
    moveOcc(key, date) {
      const o = this.data.byKey[key]; if (!o || o.date === date) return;
      if (this.isPast(date) || this.isPast(o.date)) { toast('Past days are closed. Write a remark instead.'); return; }
      if (key.startsWith('x:')) return this.commit(`Moved ${o.title} to ${D.nice(date)}`, p => { p.extra.find(x => 'x:' + x.id === key).date = date; });
      this.commit(`Moved ${o.title} to ${D.nice(date)}`, p => { p.overrides[key] = Object.assign({}, p.overrides[key] || {}, { date }); });
    },
    reassign(key, from, to) {
      const o = this.data.byKey[key]; if (!o || from === to) return;
      if (this.isPast(o.date)) { toast('Past days are closed. Write a remark instead.'); return; }
      const ppl = o.people.filter(p => p !== from); if (!ppl.includes(to)) ppl.push(to);
      const visits = o.siteGroup ? this.visitsFor(o, from) : [];
      this.commit(`${this.pname(to)} now does ${this.personLabel(o, from)} on ${D.nice(o.date)}`, p => {
        if (key.startsWith('x:')) { p.extra.find(x => 'x:' + x.id === key).people = ppl; return; }
        p.overrides[key] = Object.assign({}, p.overrides[key] || {}, { people: ppl });
        visits.forEach(v => { p.visitOverrides[v.key] = { date: v.date, person: to }; });   // the site visit goes with the work
      });
    },
    setAway(runKey, pid, going) {
      this.commit(`${this.pname(pid)} ${going ? 'goes outstation' : 'stays in town'} (${runKey.split('@')[1]})`, p => {
        p.away[runKey] = p.away[runKey] || {};
        if (going) delete p.away[runKey][pid]; else p.away[runKey][pid] = false;
      });
    },
    outstationRuns(pid) {
      const plan = Store.plan, st = plan.settings, out = [];
      plan.tasks.filter(t => t.type === 'outstation' && (t.mode || 'monthly') === 'monthly').forEach(t => {
        Engine.normPeople(plan, t.people).filter(x => !pid || x === pid).forEach(person => {
          const months = [...new Set(App.data.gen.dates.map(D.month))];
          months.forEach(m => {
            const days = (t.days || []).map(d => `${m}-${String(d).padStart(2, '0')}`).filter(d => d >= st.start && d <= st.end);
            if (!days.length) return;
            const rk = `${t.id}@${m}`;
            out.push({ runKey: rk, task: t, person, days, going: !((plan.away[rk] || {})[person] === false) });
          });
        });
      });
      return out;
    },

    /* ---------- dialogs ---------- */
    openOcc(key) {
      const o = this.data.byKey[key]; if (!o) return;
      if (this.isPast(o.date)) { toast('This day is over, so it can no longer be changed. Add a remark on the Today page.'); return; }
      const plan = Store.plan, isExtra = key.startsWith('x:'), t = isExtra ? null : this.task(o.taskId);
      const clashes = this.data.iss.filter(i => i.level === 'clash' && (i.keys || []).includes(key));
      const outRun = o.type === 'outstation' && o.runKey ? this.outstationRuns().filter(r => r.runKey === o.runKey) : [];
      const site = o.siteGroup ? o.people.map(pid => `<li>${this.who(pid)} <span>${esc(this.personLabel(o, pid))}</span></li>`).join('') : '';
      const times = o.people.map(pid => `<li>${this.who(pid)} <b>${esc(this.timeText(o, pid))}</b></li>`).join('');
      modal({
        title: o.title,
        body: `<p class="muted">${this.typeTag(o.type)} ${esc(D.nice(o.date, { long: true }))}, planned ${esc(this.timeText(o))}${o.shifted ? `. Moved from ${D.nice(o.planned)}` : ''}</p>
          ${o.inOffice && o.inOffice.length ? `<p class="note">In the office, no site work today: ${o.inOffice.map(x => esc(this.pname(x.pid) + ' (' + x.why + ')')).join(', ')}</p>` : ''}
          ${o.offToday && o.offToday.length ? `<p class="note">Weekly day off: ${o.offToday.map(p => esc(this.pname(p))).join(', ')}</p>` : ''}
          ${clashes.map(c => `<p class="alert">${esc(c.text)}</p>`).join('')}
          ${o.away && o.away.length ? `<p class="note">Out of station, not attending: ${o.away.map(p => esc(this.pname(p))).join(', ')}</p>` : ''}
          ${outRun.length ? `<div class="box"><b>Who goes outstation this trip?</b><p class="muted small">Untick anyone who stays in town. People who go do not join meetings on those days.</p>
            <div class="picks">${outRun.map(r => `<label class="pick" style="--pc:${this.pcolor(r.person)}"><input type="checkbox" data-away="${esc(r.runKey)}|${esc(r.person)}" ${r.going ? 'checked' : ''}><span>${esc(this.pname(r.person))}</span></label>`).join('')}</div></div>` : ''}
          <form id="occ-form" class="form">
            <div class="row3"><label>Date<input type="date" name="date" value="${o.date}" min="${D.today() > plan.settings.start ? D.today() : plan.settings.start}" max="${plan.settings.end}" required></label>
            <label>From<input type="time" name="start" value="${o.start}" step="300" required></label>
            <label>To<input type="time" name="end" value="${o.end}" step="300" required></label></div>
            <fieldset><legend>Who</legend>${this.peoplePicker('pp', o.people)}</fieldset>
            <label>Note<input name="note" value="${esc(o.note || '')}" placeholder="Optional note for this day"></label>
            <label class="check"><input type="checkbox" name="done" ${o.status === 'done' ? 'checked' : ''}> Done</label>
          </form>
          <p class="muted small">Changing the times here fixes them for this day; the rest of each person's day is fitted around them.</p>
          ${times ? `<h3>Time for each person</h3><ul class="list">${times}</ul>` : ''}
          ${site ? `<h3>Site days</h3><ul class="list">${site}</ul>` : ''}
          ${o.details ? `<p class="muted small">${esc(o.details)}</p>` : ''}`,
        foot: `<button type="button" class="btn ghost danger" id="occ-del">${isExtra ? 'Delete' : 'Cancel this day'}</button>
          ${!isExtra && plan.overrides[key] ? '<button type="button" class="btn ghost" id="occ-reset">Undo my changes to this day</button>' : ''}
          <span class="spacer"></span><button type="button" class="btn ghost" data-close>Close</button><button type="submit" form="occ-form" class="btn primary">Save</button>`,
        onOpen: m => {
          $$('[data-away]', m).forEach(c => c.onchange = () => { const [rk, pid] = c.dataset.away.split('|'); closeModal(); App.setAway(rk, pid, c.checked); });
          $('#occ-form', m).onsubmit = e => {
            e.preventDefault(); const fd = new FormData(e.target);
            const patch = { date: fd.get('date'), start: fd.get('start'), end: fd.get('end'), note: fd.get('note'), people: fd.getAll('pp') };
            if (T.m(patch.end) <= T.m(patch.start)) { toast('The end time must be after the start time.'); return; }
            if (App.isPast(patch.date)) { toast('Pick today or a later day.'); return; }
            if (Engine.inGap(patch.start, plan.settings)) { toast(`Start inside a working slot: ${App.slotsText()}.`); return; }
            closeModal();
            App.commit(`Saved ${o.title}, ${D.nice(patch.date)}`, p => {
              if (isExtra) Object.assign(p.extra.find(x => 'x:' + x.id === key), patch);
              else {
                const clean = {};
                if (patch.date !== o.planned) clean.date = patch.date;
                if (patch.start !== t.start) clean.start = patch.start;
                if (patch.end !== t.end) clean.end = patch.end;
                if (patch.note) clean.note = patch.note;
                if (JSON.stringify(patch.people.slice().sort()) !== JSON.stringify(Engine.normPeople(plan, t.people).slice().sort())) clean.people = patch.people;
                if (Object.keys(clean).length) p.overrides[key] = Object.assign({}, p.overrides[key] && p.overrides[key].deleted ? {} : {}, clean); else delete p.overrides[key];
              }
              if (fd.get('done')) p.status[key] = 'done'; else delete p.status[key];
            });
          };
          const r = $('#occ-reset', m); if (r) r.onclick = () => { closeModal(); App.commit(`${o.title} is back to plan`, p => { delete p.overrides[key]; }); };
          $('#occ-del', m).onclick = () => { closeModal(); App.commit(`${isExtra ? 'Deleted' : 'Cancelled'} ${o.title}, ${D.nice(o.date)}`, p => { if (isExtra) p.extra = p.extra.filter(x => 'x:' + x.id !== key); else p.overrides[key] = { deleted: true }; }); };
        }
      });
    },

    addExtra(date, pid) {
      const plan = Store.plan, slots = this.data.gen.slots, minD = D.today() > plan.settings.start ? D.today() : plan.settings.start;
      date = date && date >= minD ? date : (this.defaultDate() >= minD ? this.defaultDate() : minD);
      const choices = slots.map((s, i) => [`s${i}`, this.slotLabel(i), T.s(s[0]), T.s(s[1])]);
      if (slots.length > 1) choices.push(['day', `Whole day ${T.s(slots[0][0])}–${T.s(slots[slots.length - 1][1])}`, T.s(slots[0][0]), T.s(slots[slots.length - 1][1])]);
      modal({
        title: 'Add work',
        body: `<form id="x-form" class="form">
          <label>What<input name="title" required placeholder="For example: Bank visit"></label>
          <label>When<select id="x-slot">${choices.map(c => `<option value="${c[0]}" data-a="${c[2]}" data-b="${c[3]}">${esc(c[1])}</option>`).join('')}<option value="custom">Other time</option></select></label>
          <div class="row3"><label>Date<input type="date" name="date" value="${date}" min="${minD}" max="${plan.settings.end}" required></label>
          <label>From<input type="time" name="start" value="${choices[0][2]}" step="300" required></label><label>To<input type="time" name="end" value="${choices[0][3]}" step="300" required></label></div>
          <p class="muted small">The other work of these people on that day is moved around this entry automatically.</p>
          <fieldset><legend>Who</legend>${this.peoplePicker('pp', pid ? [pid] : [])}</fieldset>
          <div class="row2"><label>Kind<select name="type">${Object.keys(TYPES).map(k => `<option value="${k}" ${k === 'office' ? 'selected' : ''}>${TYPES[k].label}</option>`).join('')}</select></label>
          <label>Company<select name="company"><option value="">None</option>${companyOptions('')}</select></label></div>
          <label class="check"><input type="checkbox" name="noSite"> Office work: no site measurement for these people that day</label></form>`,
        foot: `<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="x-form" class="btn primary">Add</button>`,
        onOpen: m => {
          const sel = $('#x-slot', m), f = $('#x-form', m);
          sel.onchange = () => { const op = sel.selectedOptions[0]; if (op.dataset.a) { f.start.value = op.dataset.a; f.end.value = op.dataset.b; } };
          [f.start, f.end].forEach(i => i.addEventListener('input', () => { sel.value = 'custom'; }));
          f.onsubmit = e => {
            e.preventDefault(); const fd = new FormData(e.target);
            if (T.m(fd.get('end')) <= T.m(fd.get('start'))) { toast('The end time must be after the start time.'); return; }
            if (App.isPast(fd.get('date'))) { toast('Pick today or a later day.'); return; }
            if (Engine.inGap(fd.get('start'), plan.settings)) { toast(`Start inside a working slot: ${App.slotsText()}.`); return; }
            const x = { id: 'e' + Date.now().toString(36), title: fd.get('title'), date: fd.get('date'), start: fd.get('start'), end: fd.get('end'), type: fd.get('type'), people: fd.getAll('pp'), companies: fd.get('company') ? [fd.get('company')] : [], details: '', noSite: !!fd.get('noSite') };
            closeModal(); App.commit(`Added ${x.title}, ${D.nice(x.date)}. Other work moved around it.`, p => p.extra.push(x));
          };
        }
      });
    },

    editTask(id) {
      const plan = Store.plan, isNew = !id;
      const t = isNew ? { id: 't' + Date.now().toString(36), title: '', type: 'office', mode: 'monthly', days: [], people: [], start: '10:30', end: '13:30', companies: [], details: '', holiday: 'shift' } : Store.clone(this.task(id));
      modal({
        title: isNew ? 'New repeating work' : t.title, wide: true,
        body: `<form id="t-form" class="form">
          <label>Name<input name="title" value="${esc(t.title)}" required></label>
          <div class="row3"><label>Kind<select name="type">${Object.keys(TYPES).map(k => `<option value="${k}" ${t.type === k ? 'selected' : ''}>${TYPES[k].label}</option>`).join('')}</select></label>
          <label>From<input type="time" name="start" value="${t.start}" step="300" required></label><label>To<input type="time" name="end" value="${t.end}" step="300" required></label></div>
          <label>Repeats<select name="mode" id="t-mode"><option value="monthly" ${(t.mode || 'monthly') === 'monthly' ? 'selected' : ''}>On these dates every month</option><option value="daily" ${t.mode === 'daily' ? 'selected' : ''}>Every working day</option><option value="weekly" ${t.mode === 'weekly' ? 'selected' : ''}>A few free days every week</option></select></label>
          <fieldset data-for="monthly"><legend>Dates of the month</legend><div class="days">${Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<label><input type="checkbox" name="days" value="${d}" ${(t.days || []).includes(d) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div></fieldset>
          <label data-for="weekly">Days per week<input type="number" name="perWeek" min="1" max="6" value="${t.perWeek || 2}"></label>
          <label data-for="monthly">If the date is a holiday<select name="holiday"><option value="shift" ${t.holiday !== 'skip' ? 'selected' : ''}>Move to the next working day</option><option value="skip" ${t.holiday === 'skip' ? 'selected' : ''}>Skip it</option></select></label>
          <fieldset><legend>Who</legend>${this.peoplePicker('pp', Engine.normPeople(plan, t.people))}</fieldset>
          <label class="check"><input type="checkbox" name="noSite" ${t.noSite ? 'checked' : ''}> Office work: these people do no site measurement on these days</label>
          <label>Details<textarea name="details" rows="2">${esc(t.details || '')}</textarea></label></form>`,
        foot: `${!isNew ? '<button type="button" class="btn ghost danger" id="t-del">Delete</button>' : ''}<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="t-form" class="btn primary">Save</button>`,
        onOpen: m => {
          const sync = () => $$('[data-for]', m).forEach(el => { el.hidden = el.dataset.for !== $('#t-mode', m).value; });
          $('#t-mode', m).onchange = sync; sync();
          $('#t-form', m).onsubmit = e => {
            e.preventDefault(); const fd = new FormData(e.target);
            if (T.m(fd.get('end')) <= T.m(fd.get('start'))) { toast('The end time must be after the start time.'); return; }
            Object.assign(t, { title: fd.get('title'), type: fd.get('type'), mode: fd.get('mode'), start: fd.get('start'), end: fd.get('end'), days: fd.getAll('days').map(Number), perWeek: Number(fd.get('perWeek')) || 2, holiday: fd.get('holiday'), people: fd.getAll('pp'), details: fd.get('details'), noSite: !!fd.get('noSite') });
            if (Engine.inGap(t.start, plan.settings)) { toast(`Start inside a working slot: ${App.slotsText()}.`); return; }
            if (t.mode === 'monthly' && !t.days.length) { toast('Tick at least one date.'); return; }
            closeModal(); App.commit(`Saved ${t.title}`, p => { const i = p.tasks.findIndex(x => x.id === t.id); if (i >= 0) p.tasks[i] = t; else p.tasks.push(t); });
          };
          const d = $('#t-del', m); if (d) d.onclick = () => { closeModal(); App.commit(`Deleted ${t.title}`, p => { p.tasks = p.tasks.filter(x => x.id !== t.id); }); };
        }
      });
    },

    editVisit(vkey) {
      const v = this.data.gen.visits.find(x => x.key === vkey); if (!v) return;
      if (this.isPast(v.date)) { toast('This site day is over. Add a remark on the Today page.'); return; }
      const days = this.data.gen.occs.filter(o => o.runKey === v.runKey && o.people.includes(v.person) && !this.isPast(o.date));
      modal({
        title: `${this.cname(v.company)}: site day`,
        body: `<p class="muted">${esc(this.pname(v.person))}, ${esc(this.task(v.taskId).title)}. Pick the day for this company.</p>
          <form id="v-form" class="form"><label>Day<select name="date">${days.map(o => `<option value="${o.date}" ${o.date === v.date ? 'selected' : ''}>${D.nice(o.date, { long: true })}</option>`).join('')}</select></label></form>`,
        foot: `<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="v-form" class="btn primary">Save</button>`,
        onOpen: m => $('#v-form', m).onsubmit = e => { e.preventDefault(); const d = new FormData(e.target).get('date'); closeModal(); App.commit(`${this.cname(v.company)} moved to ${D.nice(d)}`, p => { p.visitOverrides[vkey] = { date: d }; }); }
      });
    }
  };

  const REMARK_LABELS = { done: 'Done', part: 'Partly done', not: 'Not done', moved: 'Postponed' };
  App.REMARK_LABELS = REMARK_LABELS;

  function companyOptions(sel) {
    return Object.keys(GROUPS).map(gk => `<optgroup label="${GROUPS[gk]}">${Store.plan.companies.filter(c => c.group === gk).map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
  }
  App.companyOptions = companyOptions;

  function bindCommon(root) {
    $$('[data-occ]', root).forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); App.openOcc(el.dataset.occ); });
      el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify({ key: el.dataset.occ, from: el.dataset.from || null })); el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
    $$('[data-drop]', root).forEach(cell => {
      cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drop'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
      cell.addEventListener('drop', e => {
        e.preventDefault(); cell.classList.remove('drop');
        let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (x) { return; }
        const o = App.data.byKey[d.key]; if (!o) return;
        const date = cell.dataset.drop, to = cell.dataset.person;
        if (to && d.from && to !== d.from) { if (date !== o.date) { toast('To hand work over, drop it on another person on the same day.'); return; } App.reassign(d.key, d.from, to); }
        else App.moveOcc(d.key, date);
      });
    });
    $$('[data-rs], [data-rt]', root).forEach(el => el.addEventListener('change', () => {
      const k = el.dataset.rs || el.dataset.rt, f = el.dataset.rs ? 's' : 't';
      App.keepScroll = true;
      Store.change('Remark saved', p => { p.remarks = p.remarks || {}; const r = Object.assign({}, p.remarks[k] || {}); if (el.value) r[f] = el.value; else delete r[f]; if (Object.keys(r).length) p.remarks[k] = r; else delete p.remarks[k]; });
      toast('Remark saved.');
    }));
    $$('[data-add]', root).forEach(b => b.addEventListener('click', () => App.addExtra(b.dataset.add, b.dataset.person)));
    $$('[data-visit]', root).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); App.editVisit(b.dataset.visit); }));
    $$('[data-task]', root).forEach(b => b.addEventListener('click', () => App.editTask(b.dataset.task)));
  }

  g.App = App;
})(window);
