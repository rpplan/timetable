/* The pages. Today, Meetings and Billing days are where things are changed; Week, Month, Employees and
   Companies only show the timetable. Everything reads and writes the same plan. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, confirmBox } = UI;
  const V = App.views;

  /* ---------- shared bits ---------- */
  const link = (view, params) => `#/${view}${params ? '?' + new URLSearchParams(params).toString() : ''}`;
  function dayNav(view, date) {
    const st = Store.plan.settings, prev = D.add(date, -1), next = D.add(date, 1);
    return `<div class="nav-date noprint">
      <a class="round ${prev < st.start ? 'off' : ''}" href="${link(view, { date: prev })}" aria-label="Previous day">${icon('left')}</a>
      <input type="date" value="${date}" min="${st.start}" max="${st.end}" data-pick="${esc(link(view, { date: 'DATE' }))}" aria-label="Choose a day">
      <a class="round ${next > st.end ? 'off' : ''}" href="${link(view, { date: next })}" aria-label="Next day">${icon('right')}</a></div>`;
  }
  function bindNav(root) { $$('[data-pick]', root).forEach(i => i.onchange = () => { if (i.value) location.hash = i.dataset.pick.replace('DATE', i.value); }); }
  function validDate(p) { const st = Store.plan.settings; return p.date && p.date >= st.start && p.date <= st.end ? p.date : App.defaultDate(); }
  const printBtn = (what, label) => `<button type="button" class="btn ghost noprint" data-print="${what}">${icon('print')}${label || 'Print / save PDF'}</button>`;
  const monthName = m => `${D.MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
  const winMonths = () => [...new Set(App.data.gen.dates.map(D.month))];
  const pickMonth = p => { const ms = winMonths(); return ms.includes(p.m) ? p.m : (ms.includes(D.month(App.defaultDate())) ? D.month(App.defaultDate()) : ms[0]); };
  const monthTabs = (view, cur, extra) => `<nav class="tabs plain noprint">${winMonths().map(m => `<a href="${link(view, Object.assign({}, extra || {}, { m }))}" class="${m === cur ? 'on' : ''}">${monthName(m)}</a>`).join('')}</nav>`;
  const entryText = e => e.noTime ? 'No free slot' : Engine.partsText(e.parts);
  const short = d => `${D.day(d)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}`;
  /* Every date written out: "2, 3, 4, 5 Nov" (several months: "30 Nov; 1, 2 Dec") */
  function listDates(ds) {
    const by = {}; ds.slice().sort().forEach(d => { const m = d.slice(0, 7); (by[m] = by[m] || []).push(D.day(d)); });
    return Object.keys(by).map(m => `${by[m].join(', ')} ${D.MONTHS[+m.slice(5) - 1].slice(0, 3)}`).join('; ');
  }
  function expired(date, pid) { const keep = Number(Store.plan.settings.retentionDays) || 0; return keep && !App.isB(pid) && date < D.add(D.today(), -keep); }
  const workOf = (pid, d) => (App.data.gen.sched[pid + '|' + d] || []).filter(e => e.o.type !== 'review');
  /* A day is "thin" (dark grey, narrow) when it is a holiday or nobody has any work */
  function dayKind(d) {
    const st = Store.plan.settings;
    if (d < st.start || d > st.end) return { thin: true, label: 'Outside' };
    const hol = App.data.gen.hol[d]; if (hol) return { thin: true, label: hol };
    if (!Store.plan.people.some(x => workOf(x.id, d).length)) return { thin: true, label: D.dow(d) === 0 ? 'Sunday' : 'No work' };
    return { thin: false };
  }
  const isOffDay = (pid, d) => !workOf(pid, d).length && (Engine.personOff(Store.plan, pid, d) || D.dow(d) === 0);

  /* Billing / advance day: the company rows (B may have changed times, companies or tasks) */
  const STEPS = {
    advance: ['Measurement checking', 'Rate check', 'Linking to PO file', 'Advances filling', 'Asset codes checking', 'Emailing'],
    billing: ['Bill checking', 'Rate check', 'Formatting', 'Advances', 'Asset codes', 'Tally billing by P1', 'B checks the billing sheet']
  };
  function payRows(o) {
    const st = Store.plan.settings, own = (Store.plan.paySheets || {})[o.key];
    if (Array.isArray(own) && own.length) return own.map(r => { const segs = Engine.minusGaps(T.m(r.start), T.m(r.end), st); return { company: r.company, start: r.start, end: r.end, steps: r.steps || '', segs, text: segs.length ? Engine.partsText(segs) : `${r.start}–${r.end}` }; });
    return Engine.slotPlan(Store.plan, o, STEPS[o.type], App.data.gen).map(r => Object.assign(r, { steps: (STEPS[o.type] || []).join(', ') }));
  }

  /* ---------------- Today: the daily timetable, where things are filled in ---------------- */
  V.today = {
    title: 'Today', editing: true,
    desc: { what: 'Today: the daily timetable. See and fill in one day.',
      why: 'Each employee\'s work in Slot 1 and Slot 2 with priority, clearance form, remarks, 7-day target ticks and a space to add a task. Below: meetings, billing ticks, 6 pm follow-ups and B\'s daily check. To move work between days or people, use the Link chart.' },
    render(p) {
      const plan = Store.plan, data = App.data, date = validDate(p), dt = D.parse(date);
      const hol = data.gen.hol[date], past = App.isPast(date);
      const clashes = data.iss.filter(i => i.level === 'clash' && i.date === date);
      const meetings = (data.byDate[date] || []).filter(o => o.type === 'meeting');
      const pays = (data.byDate[date] || []).filter(o => o.type === 'advance' || o.type === 'billing');
      const meet = meetings.map(m => {
        const t = App.task(m.taskId) || {}; let cur = T.m(m.start);
        return `<article class="card ${past ? 'past' : ''}"><h2>${esc(m.title)} <a class="small noprint" href="#/meetings">change</a></h2><p class="muted">${m.start}–${m.end}. Attending: ${m.people.map(x => esc(App.pname(x))).join(', ') || 'nobody'}${m.away && m.away.length ? `. Out of station: ${m.away.map(x => esc(App.pname(x))).join(', ')}` : ''}</p>
          <ol class="agenda">${(t.agenda || []).map(a => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li><span class="tm">${s}</span><span>${esc(a.item)}</span><span class="avs">${(a.owners || []).map(o => App.avatar(o, 'sm')).join('')}</span></li>`; }).join('')}</ol></article>`;
      }).join('');
      const payCards = pays.map(o => { const rows = payRows(o), checks = plan.reviews.pay || {};
        return `<article class="card"><h2>${esc(o.title)} <span class="count">${rows.filter(r => checks[o.key + '|' + r.company]).length} of ${rows.length} done</span> <a class="small noprint" href="#/billing">change times and tasks</a></h2>
          <div class="chipset">${rows.map(r => { const k = o.key + '|' + r.company; return `<label class="tchip ${checks[k] ? 'on' : ''}"><input type="checkbox" data-pay="${esc(k)}" ${checks[k] ? 'checked' : ''}><span>${esc(r.company === 'general' ? 'All works' : App.cname(r.company))}</span><small>${esc(r.text)}</small></label>`; }).join('')}</div></article>`; }).join('');
      return `<section>
        <header class="head">
          <div class="date-big"><b>${dt.getUTCDate()}</b><span>${D.DAYS[dt.getUTCDay()]}<br>${D.MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</span></div>
          <div class="acts">${dayNav('today', date)}${printBtn('day')}</div>
        </header>
        ${hol ? `<p class="banner">Holiday: ${esc(hol)}</p>` : ''}
        ${past ? '<p class="banner past-b">This day is over. The timetable is closed; the status, remarks and B\'s daily check can still be filled in.</p>' : ''}
        ${clashes.map(c => `<p class="banner warn">${esc(c.text)}</p>`).join('')}
        <div class="people-grid">${plan.people.map(x => personCard(x, date, hol, past)).join('')}</div>
        ${meet ? `<div class="grid2">${meet}</div>` : ''}
        ${payCards}
        ${followCard(date)}
        ${!hol && D.dow(date) !== 0 ? checkCard(date, past) : ''}
      </section>`;
    },
    mount(root, p) {
      bindNav(root);
      const date = validDate(p), slots = App.data.gen.slots;
      $$('[data-trip]', root).forEach(c => c.onchange = () => { const [rk, pid] = c.dataset.trip.split('|'); App.setAway(rk, pid, c.checked); });
      $$('[data-pay]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.pay = r.pay || {}; if (c.checked) r.pay[c.dataset.pay] = true; else delete r.pay[c.dataset.pay]; Store.save(true); App.keepScroll = true; App.render(); });
      $$('[data-fu]', root).forEach(t => { const grow = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }; grow(); t.oninput = grow;
        t.onchange = () => { const k = t.dataset.fu; if (t.value.trim()) Store.plan.followups[k] = t.value; else delete Store.plan.followups[k]; Store.save(true); toast('Follow-up saved.'); }; });
      $$('form[data-addtask]', root).forEach(f => f.onsubmit = e => {
        e.preventDefault(); const pid = f.dataset.addtask, fd = new FormData(f), w = fd.get('w'), title = String(fd.get('t') || '').trim(); if (!title) return;
        const a = w === 'day' ? slots[0][0] : slots[+w][0], b = w === 'day' ? slots[slots.length - 1][1] : slots[+w][1];
        const x = { id: 'e' + Date.now().toString(36), title, date, start: T.s(a), end: T.s(b), type: 'office', people: [pid], companies: [], details: 'Added on the daily timetable.', importance: fd.get('hp') ? 'high' : '' };
        App.commit(`Added "${title}" for ${App.pname(pid)}. Other work that day moved around it.`, pl => pl.extra.push(x));
      });
      /* B's daily check */
      const rec = () => { const r = Store.plan.reviews; r.days = r.days || {}; const d = (r.days[date] = r.days[date] && r.days[date].emp ? r.days[date] : Object.assign(r.days[date] || {}, { emp: {} })); return d; };
      const emp = pid => { const d = rec(); return (d.emp[pid] = d.emp[pid] || {}); };
      $$('[data-dcleave]', root).forEach(c => c.onchange = () => App.setLeave(c.dataset.dcleave, date, c.checked));
      $$('[data-dcw]', root).forEach(t => { const grow = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }; grow(); t.oninput = grow;
        t.onchange = () => { const e = emp(t.dataset.dcw); if (t.value.trim()) e.works = t.value; else delete e.works; Store.save(true); toast('Saved.'); }; });
      $$('[data-dcok]', root).forEach(c => c.onchange = () => { const [pid, v] = c.dataset.dcok.split('|'), e = emp(pid); if (c.checked) e.ok = v; else delete e.ok; Store.save(true); App.keepScroll = true; App.render(); });
      $$('[data-dct]', root).forEach(c => c.onchange = () => { const e = emp(c.dataset.dct); if (c.checked) e.timely = true; else delete e.timely; Store.save(true); App.keepScroll = true; App.render(); });
      $$('[data-dctom]', root).forEach(c => c.onchange = () => { const d = rec(); if (c.checked) d.tomorrow = true; else delete d.tomorrow; Store.save(true); App.keepScroll = true; App.render(); });
    }
  };

  function personCard(x, date, hol, past) {
    const pid = x.id, isB = App.isB(pid), list = workOf(pid, date), today = date === D.today();
    const w = App.whereLabel(date, pid), leave = App.onLeave(pid, date), off = isOffDay(pid, date);
    const trip = App.outstationRuns(pid).find(r => r.days.includes(date));
    const slots = App.data.gen.slots;
    let body;
    if (expired(date, pid)) body = `<p class="free">Record deleted (older than ${Store.plan.settings.retentionDays} days)</p>`;
    else if (hol) body = '<p class="free">Holiday</p>';
    else if (leave) body = '<p class="free leave-note">On leave. The work of this day is moved to the next working day.</p>';
    else if (!list.length) body = `<p class="free">${off ? 'Day off' : 'Nothing planned'}</p>`;
    else {
      const freeSlots = slots.map((s, i) => i).filter(i => !list.some(e => e.parts.some(pt => pt[0] < slots[i][1] && pt[1] > slots[i][0])));
      body = `<ul class="ed-rows">${list.map(e => {
        const ty = App.TYPES[e.o.type] || App.TYPES.office, k = e.key + '|' + pid, r = Store.plan.remarks[k] || {};
        const cf = !isB && e.o.type !== 'meeting' && date <= D.today();
        const clash = App.data.clashKeys.has(e.key) && App.data.clashPD.has(pid + '|' + date);
        return `<li class="${clash ? 'clash' : ''} ${e.o.carried ? 'carried' : ''}" style="--c:${ty.color}"><div class="ed-top"><span class="tm">${esc(entryText(e))}</span>${past ? `<span class="ed-name">${esc(App.personLabel(e.o, pid))}</span>` : `<button type="button" class="link ed-name" data-occ="${esc(e.key)}">${esc(App.personLabel(e.o, pid))}</button>`}${e.o.carried ? ` <small class="muted">from leave ${short(e.o.carriedFrom)}</small>` : ''}</div>
          ${e.o.type !== 'meeting' || cf ? `<div class="ed-ctl">${e.o.type !== 'meeting' ? App.impControl(e.key, pid) : ''}${cf ? `<button type="button" class="tchip sm ${Store.plan.clear[k] ? 'on' : ''}" data-cf="${esc(k)}">${Store.plan.clear[k] ? '✓ ' : ''}Clearance form</button>` : ''}</div>` : ''}
          ${date <= D.today() ? `<div class="rmk"><select data-rs="${esc(k)}" aria-label="Status"><option value="">Status…</option>${Object.keys(App.REMARK_LABELS).map(s => `<option value="${s}" ${r.s === s ? 'selected' : ''}>${App.REMARK_LABELS[s]}</option>`).join('')}</select><input data-rt="${esc(k)}" value="${esc(r.t || '')}" placeholder="Remark"></div>` : ''}</li>`;
      }).join('')}${freeSlots.map(i => `<li class="freeslot"><span class="tm">${esc(App.slotLabel(i))}</span><span>Free</span></li>`).join('')}</ul>`;
    }
    const tg = today && !isB && !leave ? App.openTargets(pid) : [];
    const canAdd = !past && !hol && !leave;
    return `<article class="card person tcard ${past ? 'past' : ''}" style="--pc:${x.color}">
      <header>${App.avatar(pid, 'lg')}<div><a href="#/employees" class="name">${esc(x.name)}</a><span class="where w-${w.k}">${esc(w.text)}</span></div>
        ${trip && !past ? `<label class="tchip sm ${trip.going ? 'on' : ''} trip-chip" title="Goes on the outstation trip ${esc(listDates(trip.days))}"><input type="checkbox" data-trip="${esc(trip.runKey)}|${esc(pid)}" ${trip.going ? 'checked' : ''}><span>Outstation</span></label>` : ''}</header>
      ${body}
      ${tg.length ? `<div class="ed-tg"><span class="muted small">7-day target, tick when measured in time:</span>${tg.map(v => App.targetRow(v)).join('')}</div>` : ''}
      ${canAdd ? `<form class="addtask noprint" data-addtask="${esc(pid)}"><input name="t" placeholder="New task for ${esc(x.name)}" aria-label="New task" required>
        <select name="w" aria-label="When">${slots.map((s, i) => `<option value="${i}">Slot ${i + 1}</option>`).join('')}<option value="day">Whole day</option></select>
        <label class="tchip sm hp-pick"><input type="checkbox" name="hp"><span>★ High</span></label><button class="btn ghost sm" type="submit">${icon('plus')}Add</button></form>` : ''}
    </article>`;
  }

  function followCard(date) {
    const data = App.data, set = new Set();
    data.gen.visits.filter(v => v.date === date).forEach(v => set.add(v.company));
    (data.byDate[date] || []).filter(o => !o.siteGroup && o.type !== 'meeting' && o.type !== 'billing' && o.type !== 'advance' && o.type !== 'review').forEach(o => (o.companies || []).forEach(c => set.add(c)));
    const cos = Store.plan.companies.filter(c => set.has(c.id));
    if (!cos.length) return '';
    return `<article class="card"><h2>6 pm follow-up points</h2><ul class="fu-list">${cos.map(c => { const k = c.id + '|' + date;
      return `<li><span class="dd"><b>${esc(c.name)}</b></span><textarea data-fu="${esc(k)}" rows="1" placeholder="Follow-up points">${esc(Store.plan.followups[k] || '')}</textarea></li>`; }).join('')}</ul></article>`;
  }

  /* B's daily check: per employee on leave, works completed, sufficient or not, on time; plus "timetable updated for tomorrow" */
  function checkCard(date, past) {
    const plan = Store.plan, d = ((plan.reviews.days || {})[date]) || {}, e = d.emp || {};
    const ppl = plan.people.filter(x => !App.isB(x.id));
    const filled = ppl.filter(x => (e[x.id] || {}).works || (e[x.id] || {}).ok).length;
    return `<article class="card review"><h2>B's daily check <span class="count">${filled} of ${ppl.length} filled</span></h2>
      <div class="dc">${ppl.map(x => { const r = e[x.id] || {}, lv = App.onLeave(x.id, date);
        return `<div class="dc-row" style="--pc:${x.color}"><div class="dc-who">${App.avatar(x.id, 'sm')}<b>${esc(x.name)}</b>
            <label class="check small"><input type="checkbox" data-dcleave="${esc(x.id)}" ${lv ? 'checked' : ''} ${past ? 'disabled' : ''}> On leave</label></div>
          <textarea data-dcw="${esc(x.id)}" rows="1" placeholder="Works completed today by ${esc(x.name)}" ${lv ? 'disabled' : ''}>${esc(r.works || '')}</textarea>
          <div class="dc-ticks"><label class="tchip sm ${r.ok === 'yes' ? 'on' : ''}"><input type="checkbox" data-dcok="${esc(x.id)}|yes" ${r.ok === 'yes' ? 'checked' : ''}><span>Sufficient</span></label>
            <label class="tchip sm bad ${r.ok === 'no' ? 'on' : ''}"><input type="checkbox" data-dcok="${esc(x.id)}|no" ${r.ok === 'no' ? 'checked' : ''}><span>Not sufficient</span></label>
            <label class="tchip sm ${r.timely ? 'on' : ''}"><input type="checkbox" data-dct="${esc(x.id)}" ${r.timely ? 'checked' : ''}><span>Tasks completed on time</span></label></div></div>`; }).join('')}</div>
      <label class="check dc-tom"><input type="checkbox" data-dctom ${d.tomorrow ? 'checked' : ''}> Timetable updated for tomorrow</label></article>`;
  }

  /* ---------------- Week (view only) ---------------- */
  V.week = {
    title: 'Week',
    desc: { what: 'Week: everyone against the seven days of one week.',
      why: 'To compare people side by side. Holidays and days without work are thin dark-grey columns; days off are dark grey. Change work on Today or in the Link chart.' },
    render(p) {
      const plan = Store.plan, st = plan.settings, data = App.data;
      const ws = D.weekStart(p.w || validDate(p));
      const days = D.range(ws, D.add(ws, 6)), kinds = days.map(dayKind);
      const prev = D.add(ws, -7), next = D.add(ws, 7);
      const nThin = kinds.filter(k => k.thin).length;
      const cols = `<colgroup><col class="c-name">${kinds.map(k => `<col class="${k.thin ? 'c-thin' : ''}">`).join('')}</colgroup>`;
      const head = days.map((d, i) => kinds[i].thin
        ? `<th class="thin" title="${esc(D.nice(d) + ': ' + kinds[i].label)}"><span class="vlabel">${D.DAYS[D.dow(d)].slice(0, 3)} ${D.day(d)} · ${esc(kinds[i].label)}</span></th>`
        : `<th class="${d === D.today() ? 'now' : ''} ${App.isPast(d) ? 'past' : ''}"><a href="#/today?date=${d}">${D.DAYS[D.dow(d)].slice(0, 3)} <b>${D.day(d)}</b> ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</a></th>`).join('');
      const rows = plan.people.map(person => `<tr><th class="rowhead">${App.who(person.id)}</th>${days.map((d, i) => {
        if (kinds[i].thin) return '<td class="thin"></td>';
        if (App.onLeave(person.id, d)) return '<td class="off leave"><span>On leave</span></td>';
        if (isOffDay(person.id, d)) return '<td class="off"><span>Day off</span></td>';
        return `<td class="${App.isPast(d) ? 'past' : ''} ${data.clashPD.has(person.id + '|' + d) ? 'clash' : ''}">${workOf(person.id, d).map(e => App.pill(e.o, person.id)).join('')}</td>`;
      }).join('')}</tr>`).join('');
      const list = days.map((d, i) => {
        if (kinds[i].thin) return `<div class="wl-thin">${esc(D.nice(d))} · ${esc(kinds[i].label)}</div>`;
        return `<article class="card wl-day ${App.isPast(d) ? 'past' : ''}"><h3><a href="#/today?date=${d}">${esc(D.nice(d, { long: true }))}</a></h3>${plan.people.map(person => {
          const what = App.onLeave(person.id, d) ? '<span class="offbar">On leave</span>' : isOffDay(person.id, d) ? '<span class="offbar">Day off</span>' : workOf(person.id, d).map(e => App.pill(e.o, person.id)).join('') || '<span class="offday">Free</span>';
          return `<div class="wl-row">${App.avatar(person.id, 'sm')}<div class="wl-what">${what}</div></div>`; }).join('')}</article>`;
      }).join('');
      return `<section>
        <header class="head"><h1>Week: ${listDates(days)} ${ws.slice(0, 4)}</h1>
          <div class="acts"><div class="nav-date noprint"><a class="round ${prev < D.weekStart(st.start) ? 'off' : ''}" href="${link('week', { w: prev })}" aria-label="Previous week">${icon('left')}</a>
          <a class="btn ghost" href="${link('week', { w: D.weekStart(App.defaultDate()) })}">This week</a>
          <a class="round ${next > st.end ? 'off' : ''}" href="${link('week', { w: next })}" aria-label="Next week">${icon('right')}</a></div>${printBtn('week')}</div></header>
        <div class="scroll week-table"><table class="week" style="min-width:${120 + (7 - nThin) * 130 + nThin * 40}px">${cols}<thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="week-list">${list}</div>
        <ul class="key">${Object.keys(App.TYPES).filter(k => k !== 'review').map(k => `<li><span style="background:${App.TYPES[k].color}"></span>${App.TYPES[k].label}</li>`).join('')}<li><span class="key-off"></span>Holiday, no work or day off</li></ul>
      </section>`;
    }
  };

  /* ---------------- Month (view only) ---------------- */
  V.month = {
    title: 'Month',
    desc: { what: 'Month: everyone\'s work for the whole month, one row for every day.',
      why: 'The monthly schedule to review or print. Holidays and days without work are thin dark-grey rows; days off are dark grey. ★ = high priority, ✓CF = clearance form done.' },
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p);
      const dates = data.gen.dates.filter(d => D.month(d) === m);
      const rows = dates.map(d => {
        const k = dayKind(d), past = App.isPast(d);
        if (k.thin) return `<tr class="thin"><th class="rowhead">${D.day(d)} ${D.DAYS[D.dow(d)].slice(0, 3)}</th><td colspan="${plan.people.length}">${esc(k.label)}</td></tr>`;
        return `<tr class="${past ? 'past' : ''}"><th class="rowhead"><a href="#/today?date=${d}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</a></th>${plan.people.map(x => {
          if (App.onLeave(x.id, d)) return '<td class="off leave"><span>On leave</span></td>';
          if (isOffDay(x.id, d)) return '<td class="off"><span>Day off</span></td>';
          const list = workOf(x.id, d);
          if (!list.length) return '<td><span class="offday">Free</span></td>';
          return `<td>${list.map(e => { const ty = App.TYPES[e.o.type] || App.TYPES.office; return `<div class="mline" style="--c:${ty.color}"><span class="tm">${esc(entryText(e))}</span> ${esc(App.personLabel(e.o, x.id))}${App.imp(e.o.key, x.id) === 'high' ? ' <b class="star" title="High priority">★</b>' : ''}${!App.isB(x.id) && plan.clear[e.o.key + '|' + x.id] ? ' <span class="clr-mini" title="Clearance form done">✓CF</span>' : ''}</div>`; }).join('')}</td>`;
        }).join('')}</tr>`;
      }).join('');
      return `<section><header class="head"><h1>Monthly schedule: ${monthName(m)}</h1>${printBtn('month')}</header>
        ${monthTabs('month', m)}
        <div class="scroll"><table class="week month"><thead><tr><th>Date</th>${plan.people.map(x => `<th>${App.who(x.id)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }
  };

  /* ---------------- Employees: everyone side by side ---------------- */
  V.employees = {
    title: 'Employees',
    desc: { what: 'Employees: all employees side by side.',
      why: 'Points, companies, outstation days with their companies, the 7-day target list and every day of the timetable in one chart. The print button above each name prints that employee only.' },
    render() {
      const plan = Store.plan, data = App.data, ppl = plan.people, st = plan.settings;
      const cell = (x, html, cls) => `<td data-emp="${esc(x.id)}" class="${cls || ''}">${html}</td>`;
      const comps = x => { const r = plan.responsibilities[x.id] || {}; return ['main', 'outstation', 'other'].map(g => (r[g] || []).length ? `<div class="ec-grp"><span class="muted small">${App.GROUPS[g]}</span>${(r[g] || []).map(c => `<div>${esc(App.cname(c))}</div>`).join('')}</div>` : '').join('') || '<span class="muted">–</span>'; };
      const trips = x => { const runs = App.outstationRuns(x.id); if (!runs.length) return '<span class="muted">–</span>';
        return runs.map(r => { const vs = data.gen.visits.filter(v => v.runKey === r.runKey && v.person === x.id);
          return `<div class="ec-trip ${r.going ? '' : 'stay'}"><b>${esc(listDates(r.days))}</b>${r.going ? (vs.length ? vs.map(v => `<div>${short(v.date)}: ${esc(App.cname(v.company))}</div>`).join('') : `<div class="muted small">${esc(((plan.responsibilities[x.id] || {}).outstation || []).map(c => App.cname(c)).join(', '))}</div>`) : '<div class="muted small">Stays in town</div>'}</div>`; }).join(''); };
      const targets = x => { const vs = data.gen.visits.filter(v => v.person === x.id && !v.repeat).sort((a, b) => a.date < b.date ? -1 : 1);
        if (!vs.length) return '<span class="muted">–</span>';
        return vs.map(v => { const s = App.targetState(v); return `<div class="ec-tg ${s}"><span>${s === 'done' || s === 'ticked' ? '✓' : s === 'missed' ? '✗' : '○'}</span>${esc(App.cname(v.company))} <small>${short(v.date)}, due ${short(v.due)}</small></div>`; }).join(''); };
      const day = (x, d) => {
        if (expired(d, x.id)) return cell(x, '<span class="muted small">Deleted after 45 days</span>');
        if (App.onLeave(x.id, d)) return cell(x, '<span>On leave</span>', 'off leave');
        if (isOffDay(x.id, d)) return cell(x, '<span>Day off</span>', 'off');
        const list = workOf(x.id, d);
        if (!list.length) return cell(x, '<span class="offday">Free</span>');
        return cell(x, list.map(e => { const ty = App.TYPES[e.o.type] || App.TYPES.office, r = plan.remarks[e.key + '|' + x.id] || {};
          return `<div class="mline" style="--c:${ty.color}"><span class="tm">${esc(entryText(e))}</span> ${esc(App.personLabel(e.o, x.id))}${App.imp(e.o.key, x.id) === 'high' ? ' <b class="star">★</b>' : ''}${!App.isB(x.id) && plan.clear[e.key + '|' + x.id] ? ' <span class="clr-mini">✓CF</span>' : ''}${r.s || r.t ? `<div class="small muted">${esc([App.REMARK_LABELS[r.s], r.t].filter(Boolean).join(': '))}</div>` : ''}</div>`; }).join(''));
      };
      const dayRows = data.gen.dates.map(d => { const k = dayKind(d);
        if (k.thin) return `<tr class="thin"><th class="rowhead">${D.day(d)} ${D.DAYS[D.dow(d)].slice(0, 3)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</th>${ppl.map(x => cell(x, ppl[0] === x ? esc(k.label) : '')).join('')}</tr>`;
        return `<tr class="${App.isPast(d) ? 'past' : ''}"><th class="rowhead"><a href="#/today?date=${d}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</a></th>${ppl.map(x => day(x, d)).join('')}</tr>`; }).join('');
      return `<section><header class="head"><h1>Employees</h1><div class="acts noprint">${printBtn('employees', 'Print all')}</div></header>
        <div class="scroll"><table class="week emp-chart" style="min-width:${110 + ppl.length * 190}px"><thead><tr><th></th>${ppl.map(x => `<th data-emp="${esc(x.id)}" style="--pc:${x.color}"><div class="eh">${App.avatar(x.id)}<div><b>${esc(x.name)}</b><small>${esc(x.role || '')}</small></div></div>
            <div class="eh-acts noprint"><button type="button" class="btn ghost sm" data-printemp="${esc(x.id)}" title="Print ${esc(x.name)} only">${icon('print')}Print</button><button type="button" class="btn ghost sm" data-ics="${esc(x.id)}" title="Add to phone calendar">${icon('calendar')}</button></div></th>`).join('')}</tr></thead>
          <tbody>
            <tr class="ec-sum"><th class="rowhead">Points</th>${ppl.map(x => cell(x, App.isB(x.id) ? '<span class="muted">–</span>' : `<b class="pts" style="color:${x.color}">${App.points(x.id)}</b> <span class="muted small">points</span>`)).join('')}</tr>
            <tr class="ec-sum"><th class="rowhead">Companies</th>${ppl.map(x => cell(x, comps(x))).join('')}</tr>
            <tr class="ec-sum"><th class="rowhead">Outstation</th>${ppl.map(x => cell(x, trips(x))).join('')}</tr>
            <tr class="ec-sum"><th class="rowhead">7-day targets<small>${st.targetDays || 7} days, ${st.targetPoints || 100} points each</small></th>${ppl.map(x => cell(x, App.isB(x.id) ? '<span class="muted">–</span>' : targets(x))).join('')}</tr>
            ${dayRows}
          </tbody></table></div></section>`;
    },
    mount(root) {
      $$('[data-printemp]', root).forEach(b => b.onclick = () => {
        const pid = b.dataset.printemp;
        $$('[data-emp]', root).forEach(el => el.classList.toggle('print-hide', el.dataset.emp !== pid));
        document.body.dataset.print = 'emp';
        const restore = () => { $$('[data-emp]', root).forEach(el => el.classList.remove('print-hide')); window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        window.print();
      });
      $$('[data-ics]', root).forEach(b => b.onclick = () => {
        const person = App.person(b.dataset.ics), evs = [];
        Object.keys(App.data.gen.sched).filter(k => k.startsWith(person.id + '|')).forEach(k => App.data.gen.sched[k].forEach(e => e.parts.forEach((pt, i) =>
          evs.push({ uid: e.key.replace(/[^a-z0-9]/gi, '') + person.id + i, date: e.date, start: T.s(pt[0]), end: T.s(pt[1]), title: App.personLabel(e.o, person.id), desc: e.o.details }))));
        IO.download(IO.ics(evs, `Timetable ${person.name}`), `timetable-${person.id}.ics`);
        toast(`Calendar file for ${person.name} downloaded. Open it on the phone to add it.`);
      });
    }
  };

  /* ---------------- Companies (view only) ---------------- */
  V.companies = {
    title: 'Companies',
    desc: { what: 'Companies: the three groups, who measures each company, and its site days.',
      why: 'To check that every company gets its site days in its own part of the month. Click a company for its monthly schedule. Who measures what is set in Settings.' },
    render() {
      const plan = Store.plan, data = App.data;
      const owners = c => plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      return `<section><header class="head"><h1>Companies</h1></header>
        ${Object.keys(App.GROUPS).map(gk => { const wd = Engine.windowDays(plan, gk); return `<h2 class="group">${App.GROUPS[gk]}<span class="grp-days">${wd ? 'days ' + wd.join(', ') : ''}</span></h2><div class="comp-grid">${plan.companies.filter(c => c.group === gk).map(c => {
          const vs = data.gen.visits.filter(v => v.company === c.id).sort((a, b) => a.date < b.date ? -1 : 1), ow = owners(c);
          return `<article class="card comp"><h3><a href="#/company?id=${encodeURIComponent(c.id)}">${esc(c.name)}</a></h3><p class="muted small">${ow.length ? ow.map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}${c.together && ow.length > 1 ? ', together on the same day' : ow.length > 1 ? ', on separate days' : ''}</p>
            <div class="chips">${vs.map(v => `<span class="dchip ${App.isPast(v.date) ? 'past' : ''}" style="--pc:${App.pcolor(v.person)}">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</span>`).join('') || '<span class="muted small">No site day in this timetable</span>'}</div></article>`;
        }).join('')}</div>`; }).join('')}</section>`;
    }
  };

  function companyEntries(cid, dates) {
    const data = App.data, set = new Set(dates), out = [];
    data.gen.visits.filter(v => v.company === cid && set.has(v.date)).forEach(v => {
      const e = (data.gen.sched[v.person + '|' + v.date] || []).find(x => x.o.runKey === v.runKey);
      out.push({ date: v.date, time: e ? entryText(e) : '', sort: e && e.parts.length ? e.parts[0][0] : 9999, work: `Site measurement ${v.cycle || ''}${v.repeat ? ' (continued)' : ''}`.trim(), type: e ? e.o.type : 'site', people: [v.person], key: e ? e.o.key : null });
    });
    data.gen.occs.filter(o => set.has(o.date) && !o.siteGroup && o.type !== 'review' && (o.companies || []).includes(cid)).forEach(o => {
      let time = App.timeText(o, o.people[0]), sort = T.m(o.start);
      if (o.type === 'billing' || o.type === 'advance') { const r = payRows(o).find(x => x.company === cid); if (!r) return; time = r.text; sort = r.segs.length ? r.segs[0][0] : sort; }
      out.push({ date: o.date, time, sort, work: o.title, type: o.type, people: o.people.slice(), key: o.key });
    });
    return out.sort((a, b) => a.date === b.date ? a.sort - b.sort : (a.date < b.date ? -1 : 1));
  }
  V.company = {
    title: 'Company schedule',
    desc: { what: 'Company schedule: one company\'s timetable for a month, every day listed, with priority and the 6 pm follow-up points.',
      why: 'To review the work of one company and print it as PDF. Follow-up points are written on Today.' },
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p);
      const c = plan.companies.find(x => x.id === p.id) || plan.companies[0];
      if (!c) return '<p class="free">No companies.</p>';
      const dates = data.gen.dates.filter(d => D.month(d) === m), ents = companyEntries(c.id, dates), fu = plan.followups;
      const owners = plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      const rows = dates.map(d => {
        const list = ents.filter(e => e.date === d), past = App.isPast(d), hol = data.gen.hol[d], k = c.id + '|' + d, rs = Math.max(1, list.length);
        const fuCell = `<td class="fu" rowspan="${rs}"><div class="fu-ro">${esc(fu[k] || '')}</div></td>`;
        const dateCell = `<th class="rowhead" rowspan="${rs}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</th>`;
        if (!list.length) return `<tr class="${past ? 'past' : ''} ${hol || D.dow(d) === 0 ? 'thin' : ''}">${dateCell}<td colspan="4" class="free">${hol ? esc(hol) : D.dow(d) === 0 ? 'Sunday' : 'No work planned'}</td>${fuCell}</tr>`;
        return list.map((e, i) => {
          const hi = e.key && e.people.some(pid => App.imp(e.key, pid) === 'high'), ty = App.TYPES[e.type] || App.TYPES.office;
          return `<tr class="${past ? 'past' : ''}">${i === 0 ? dateCell : ''}<td class="tm">${esc(e.time)}</td><td><span class="dot" style="background:${ty.color}"></span> ${esc(e.work)}</td><td>${e.people.map(x => esc(App.pname(x))).join(', ') || '–'}</td><td>${hi ? App.impBadge('high') : '<span class="muted">Normal</span>'}</td>${i === 0 ? fuCell : ''}</tr>`;
        }).join('');
      }).join('');
      const opts = Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(x => x.group === gk).map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
      return `<section><header class="head"><div><h1>${esc(c.name)}: ${monthName(m)}</h1><p class="muted">${esc(App.GROUPS[c.group])}. ${owners.length ? 'Measured by ' + owners.map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}.</p></div>
          <div class="acts noprint"><select id="co-pick" class="pick-sel" aria-label="Company">${opts}</select>${printBtn('company')}</div></header>
        ${monthTabs('company', m, { id: c.id })}
        <div class="scroll"><table class="tbl co-tbl"><thead><tr><th>Date</th><th>Time</th><th>Work</th><th>Who</th><th>Priority</th><th>6 pm follow-up points</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    },
    mount(root, p) { const pick = $('#co-pick', root); if (pick) pick.onchange = () => { location.hash = link('company', { id: pick.value, m: pickMonth(p) }); }; }
  };

  /* ---------------- Meetings: schedule and agenda, all editable ---------------- */
  V.meetings = {
    title: 'Meetings', editing: true,
    desc: { what: 'Meetings: the joint meetings, all editable.',
      why: 'Change the name, time, dates of the month, move or delete a single meeting day, and edit the agenda with minutes and who is responsible. People who are out of station that day do not attend.' },
    render() {
      const plan = Store.plan, data = App.data, st = plan.settings;
      const minD = D.today() > st.start ? D.today() : st.start;
      return `<section><header class="head"><h1>Meetings</h1>${printBtn('meetings')}</header>
        <div class="grid2 meet-grid">${plan.tasks.filter(t => t.type === 'meeting').map(t => {
          const occs = data.gen.occs.filter(o => o.taskId === t.id);
          const slot = T.m(t.end) - T.m(t.start), ag = t.agenda || [], used = ag.reduce((s, a) => s + (Number(a.minutes) || 0), 0);
          let cur = T.m(t.start);
          return `<article class="card meet" data-m="${esc(t.id)}">
            <input class="mt-title" data-mt="title" value="${esc(t.title)}" aria-label="Meeting name">
            <div class="mt-when"><label>From<input type="time" data-mt="start" value="${t.start}" step="300"></label><label>To<input type="time" data-mt="end" value="${t.end}" step="300"></label>
              <label class="mt-days">Every month on<input data-mdays value="${esc((t.days || []).join(', '))}" placeholder="e.g. 5, 24" aria-label="Dates of the month"></label></div>
            <ul class="mt-occ">${occs.map(o => App.isPast(o.date) ? `<li class="past"><span>${D.nice(o.date, { long: true })}</span><span class="muted small">held</span></li>`
              : `<li><input type="date" data-mocc="${esc(o.key)}" value="${o.date}" min="${minD}" max="${st.end}" aria-label="Meeting day"><span class="muted small">${o.away && o.away.length ? 'away: ' + o.away.map(x => esc(App.pname(x))).join(', ') : o.shifted ? 'moved from ' + short(o.planned) : ''}</span><button type="button" class="x" data-mdel="${esc(o.key)}" aria-label="Delete this meeting day">${icon('trash')}</button></li>`).join('') || '<li class="muted small">No day in this timetable</li>'}</ul>
            <div class="bar ${used > slot ? 'over' : ''}"><span style="width:${Math.min(100, slot ? used / slot * 100 : 0)}%"></span></div>
            <p class="small ${used > slot ? 'bad' : 'muted'}">Agenda: ${used} of ${slot} minutes${used > slot ? `, ${used - slot} too many` : ''}</p>
            <ol class="ag-edit">${ag.map((a, i) => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li data-i="${i}">
              <div class="ag-top"><span class="tm">${s}</span><input data-f="item" value="${esc(a.item)}" aria-label="Agenda item"><input data-f="minutes" type="number" min="0" max="240" value="${a.minutes}" aria-label="Minutes" class="min"><span class="small muted">min</span><button type="button" class="x" data-rm aria-label="Remove">${icon('x')}</button></div>
              <div class="ag-who">${plan.people.map(pp => `<label class="pick sm" style="--pc:${pp.color}"><input type="checkbox" data-owner="${esc(pp.id)}" ${(a.owners || []).includes(pp.id) ? 'checked' : ''}><span>${esc(pp.id)}</span></label>`).join('')}</div></li>`; }).join('')}</ol>
            <div class="row-btns noprint"><button type="button" class="btn ghost sm" data-addi>${icon('plus')}Add item</button><button type="button" class="btn ghost sm" data-fit>Fit to ${slot} minutes</button></div></article>`;
        }).join('')}</div></section>`;
    },
    mount(root) {
      $$('.meet', root).forEach(card => {
        const id = card.dataset.m;
        const save = (label, fn) => App.commit(label, p => { const t = p.tasks.find(x => x.id === id); t.agenda = t.agenda || []; fn(t.agenda, t); });
        $$('[data-mt]', card).forEach(inp => inp.onchange = () => {
          const f = inp.dataset.mt, t = App.task(id), v = inp.value;
          if (f !== 'title' && (f === 'start' ? T.m(t.end) <= T.m(v) : T.m(v) <= T.m(t.start))) { toast('The end time must be after the start time.'); App.render(); return; }
          save('Meeting saved', (ag, tt) => { tt[f] = f === 'title' ? (v || tt.title) : v; });
        });
        const dd = $('[data-mdays]', card); dd.onchange = () => {
          const days = [...new Set(dd.value.split(/[^0-9]+/).map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b);
          if (!days.length) { toast('Give at least one date of the month, for example 5.'); App.render(); return; }
          save(`Meeting on ${days.join(', ')} of each month`, (ag, t) => { t.days = days; });
        };
        $$('[data-mocc]', card).forEach(inp => inp.onchange = () => { if (inp.value) App.moveOcc(inp.dataset.mocc, inp.value); });
        $$('[data-mdel]', card).forEach(b => b.onclick = () => { const o = App.data.byKey[b.dataset.mdel];
          confirmBox('Delete this meeting day?', `${o.title} on ${D.nice(o.date, { long: true })} will be removed. You can undo this.`, 'Delete', () => App.commit(`Deleted ${o.title}, ${D.nice(o.date)}`, p => { p.overrides[o.key] = { deleted: true }; }), true); });
        $$('li[data-i]', card).forEach(li => {
          const i = +li.dataset.i;
          $$('[data-f]', li).forEach(inp => inp.onchange = () => save('Agenda saved', ag => { ag[i][inp.dataset.f] = inp.dataset.f === 'minutes' ? Number(inp.value) : inp.value; }));
          $$('[data-owner]', li).forEach(c => c.onchange = () => save('Agenda saved', ag => { const o = new Set(ag[i].owners || []); if (c.checked) o.add(c.dataset.owner); else o.delete(c.dataset.owner); ag[i].owners = Store.plan.people.map(x => x.id).filter(x => o.has(x)); }));
          $('[data-rm]', li).onclick = () => save('Agenda item removed', ag => ag.splice(i, 1));
        });
        $('[data-addi]', card).onclick = () => save('Agenda item added', ag => ag.push({ item: 'New item', minutes: 10, owners: ['B'] }));
        $('[data-fit]', card).onclick = () => save('Agenda fitted', (ag, t) => {
          const slot = T.m(t.end) - T.m(t.start), tot = ag.reduce((s, a) => s + (Number(a.minutes) || 0), 0) || 1;
          const raw = ag.map(a => (Number(a.minutes) || 0) / tot * slot), base = raw.map(r => Math.max(5, Math.floor(r / 5) * 5));
          let left = slot - base.reduce((s, x) => s + x, 0);
          const ord = raw.map((r, k) => [r - base[k], k]).sort((x, y) => y[0] - x[0]);
          for (let n = 0; left >= 5 && n < 200; n++) { base[ord[n % ord.length][1]] += 5; left -= 5; }
          for (let k = base.length - 1; left < 0 && k >= 0; k--) while (left < 0 && base[k] > 5) { base[k] -= 5; left += 5; }
          ag.forEach((a, k) => { a.minutes = base[k]; });
        });
      });
    }
  };

  /* ---------------- Advance & billing days: times, companies and tasks editable; days can be deleted ---------------- */
  V.billing = {
    title: 'Billing days', editing: true,
    desc: { what: 'Billing days: the timetable of P1 and B on each advance and billing day, all editable.',
      why: 'Change the time, company and tasks of every row, add or remove rows, tick each company when done, or delete a whole day (you are asked to confirm).' },
    render() {
      const plan = Store.plan, data = App.data, checks = plan.reviews.pay || {};
      const days = data.gen.occs.filter(o => o.type === 'advance' || o.type === 'billing');
      const coOpts = sel => `<option value="general" ${sel === 'general' ? 'selected' : ''}>All works</option>` + Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(c => c.group === gk).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
      return `<section><header class="head"><h1>Advance and billing days</h1>${printBtn('billing')}</header>
        ${days.map(o => {
          const rows = payRows(o), past = App.isPast(o.date), own = !!(plan.paySheets || {})[o.key];
          const done = rows.filter(r => checks[o.key + '|' + r.company]).length;
          const nm = r => esc(r.company === 'general' ? 'All works' : App.cname(r.company));
          return `<article class="card sheet ${past ? 'past' : ''}" data-o="${esc(o.key)}"><header class="sheet-h"><div><h2>${esc(o.title)}</h2><p class="muted">${D.nice(o.date, { long: true })}. ${o.people.map(x => esc(App.pname(x))).join(' and ')}.${o.shifted ? ` Moved from ${D.nice(o.planned)}.` : ''}${past ? ' Day over.' : ''}</p></div>
              <div class="row-btns"><span class="count">${done} of ${rows.length} done</span>${!past && own ? '<button type="button" class="btn ghost sm noprint" data-preset>Back to automatic</button>' : ''}${!past ? `<button type="button" class="btn ghost sm danger noprint" data-pdel>${icon('trash')}Delete this day</button>` : ''}</div></header>
            ${past ? `<ul class="slots">${rows.map(r => { const k = o.key + '|' + r.company; return `<li class="${checks[k] ? 'done' : ''}"><span class="tm">${esc(r.text)}</span><span class="check"><span class="ro-box ${checks[k] ? 'on' : ''}">${checks[k] ? '✓' : ''}</span><span>${nm(r)}</span></span><span class="muted small">${esc(r.steps)}</span></li>`; }).join('')}</ul>`
            : `<div class="scroll pay-scroll"><table class="pay-tbl"><thead><tr><th>From</th><th>To</th><th>Company</th><th>Tasks</th><th>Done</th><th></th></tr></thead><tbody>${rows.map((r, i) => { const k = o.key + '|' + r.company; return `<tr data-row="${i}">
                <td><input type="time" data-pf="start" value="${esc(r.start)}" step="300" aria-label="From"></td><td><input type="time" data-pf="end" value="${esc(r.end)}" step="300" aria-label="To"></td>
                <td><select data-pf="company" aria-label="Company">${coOpts(r.company)}</select></td><td><input data-pf="steps" value="${esc(r.steps)}" aria-label="Tasks"></td>
                <td><input type="checkbox" data-pay="${esc(k)}" ${checks[k] ? 'checked' : ''} aria-label="Done"></td><td><button type="button" class="x" data-prm="${i}" aria-label="Remove row">${icon('x')}</button></td></tr>`; }).join('')}</tbody></table></div>
              <button type="button" class="add-small noprint" data-padd>${icon('plus')}Add row</button>`}</article>`;
        }).join('') || '<p class="free">No advance or billing days in this timetable.</p>'}</section>`;
    },
    mount(root) {
      $$('[data-pay]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.pay = r.pay || {}; if (c.checked) r.pay[c.dataset.pay] = true; else delete r.pay[c.dataset.pay]; Store.save(true); App.keepScroll = true; App.render(); });
      $$('.sheet[data-o]', root).forEach(card => {
        const key = card.dataset.o, o = App.data.byKey[key]; if (!o) return;
        const read = () => $$('tr[data-row]', card).map(tr => { const g = f => $(`[data-pf="${f}"]`, tr).value; return { start: g('start'), end: g('end'), company: g('company'), steps: g('steps') }; });
        const put = (rows, label) => {
          if (rows.some(r => T.m(r.end) <= T.m(r.start))) { toast('Each row must end after it starts.'); App.render(); return; }
          App.commit(label, p => { p.paySheets = p.paySheets || {}; p.paySheets[key] = rows; });
        };
        $$('[data-pf]', card).forEach(el => el.onchange = () => put(read(), `${o.title}, ${D.nice(o.date)}: saved`));
        $$('[data-prm]', card).forEach(b => b.onclick = () => { const rows = read(); rows.splice(+b.dataset.prm, 1); if (!rows.length) { toast('Keep at least one row, or delete the whole day.'); return; } put(rows, 'Row removed'); });
        const add = $('[data-padd]', card); if (add) add.onclick = () => { const rows = read(), last = rows[rows.length - 1], a = last ? T.m(last.end) : App.data.gen.slots[0][0];
          rows.push({ start: T.s(a), end: T.s(a + 30), company: 'general', steps: (STEPS[o.type] || []).join(', ') }); put(rows, 'Row added'); };
        const rs = $('[data-preset]', card); if (rs) rs.onclick = () => App.commit(`${o.title}: back to the automatic timetable`, p => { delete p.paySheets[key]; });
        const del = $('[data-pdel]', card); if (del) del.onclick = () => confirmBox(`Delete ${o.title}?`, `${o.title} on ${D.nice(o.date, { long: true })} and its whole schedule will be deleted. Are you sure? You can undo straight after.`, 'Yes, delete this day', () => App.commit(`Deleted ${o.title}, ${D.nice(o.date)}`, p => { p.overrides[key] = { deleted: true }; if (p.paySheets) delete p.paySheets[key]; }), true);
      });
    }
  };

  Object.assign(App, { companyEntries, monthName, listDates, pickMonth, payRows, STEPS });
})();
