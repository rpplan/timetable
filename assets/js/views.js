/* The pages. Today, Meetings, Billing days and the Month marks are where things are changed; the others show.
   B is not on the timetable pages: his own schedule is in B admin. Everything reads and writes the same plan. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, confirmBox, modal, closeModal } = UI;
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
  function listDates(ds) {
    const by = {}; ds.slice().sort().forEach(d => { const m = d.slice(0, 7); (by[m] = by[m] || []).push(D.day(d)); });
    return Object.keys(by).map(m => `${by[m].join(', ')} ${D.MONTHS[+m.slice(5) - 1].slice(0, 3)}`).join('; ');
  }
  function expired(date, pid) { const keep = Number(Store.plan.settings.retentionDays) || 0; return keep && !App.isB(pid) && date < D.add(D.today(), -keep); }
  const workOf = (pid, d) => (App.data.gen.sched[pid + '|' + d] || []).filter(e => e.o.type !== 'review');
  const workOnDay = (pid, d) => !!(Store.plan.workOn || {})[pid + '|' + d];
  /* Why this person has no normal working day (holiday, Sunday, weekly day off), unless they chose to work */
  function restOf(pid, d) {
    if (workOnDay(pid, d)) return null;
    const hol = App.data.gen.hol[d]; if (hol) return 'Holiday: ' + hol;
    if (D.dow(d) === 0) return 'Sunday';
    if (Engine.personOff(Store.plan, pid, d)) return 'Day off';
    return null;
  }
  function dayKind(d) {
    const st = Store.plan.settings;
    if (d < st.start || d > st.end) return { thin: true, label: 'Outside' };
    const busy = App.staff().some(x => !restOf(x.id, d) && workOf(x.id, d).length);
    if (busy) return { thin: false };
    const hol = App.data.gen.hol[d];
    return { thin: true, label: hol || (D.dow(d) === 0 ? 'Sunday' : 'No work') };
  }
  /* small lines shown under a person's day: commitments from meetings, action points from yesterday's follow-up */
  function fineLines(pid, d, edit) {
    const cm = App.commitsFor(pid, d).map(c => `<div class="fine cm">◷ ${esc(c.task || 'Commitment')} · ${c.days === 0 ? 'same day' : `${c.days} day${c.days === 1 ? '' : 's'}, due ${short(c.due)}`}</div>`);
    const ac = App.actionsFor(d).filter(a => App.companyOwners(a.company.id).includes(pid)).map(a => `<div class="fine ac">↳ <b>${esc(a.company.name)}</b>: ${a.items.map(x => `${x.done ? '✓ ' : ''}${esc(x.t)}`).join('; ')}</div>`);
    const ed = edit && cm.length ? `<button type="button" class="ced noprint" data-cedit="${esc(pid)}|${d}" title="Edit commitments">✎ edit</button>` : '';
    return cm.join('') + ed + ac.join('');
  }
  /* Meetings: one agenda per meeting day (copied from the repeating meeting the first time it is changed) */
  const meetRec = key => (Store.plan.meetDays || {})[key] || {};
  function meetAgenda(o) { const r = meetRec(o.key); if (Array.isArray(r.agenda)) return r.agenda; const t = App.task(o.taskId); return (t && t.agenda) || []; }
  const meetTitle = o => meetRec(o.key).title || o.title;
  const meetings = () => App.data.gen.occs.filter(o => o.type === 'meeting').sort((a, b) => a.date === b.date ? T.m(a.start) - T.m(b.start) : (a.date < b.date ? -1 : 1));
  const typeStyle = o => { const ty = App.TYPES[o.type] || App.TYPES.office; return `--c:${ty.color}`; };
  function line(e, pid) {
    return `<div class="mline ${e.o.type === 'meeting' && meetRec(e.o.key).cancelled ? 'm-cancel' : ''}" style="${typeStyle(e.o)}" ${e.o.type === 'meeting' && meetRec(e.o.key).cancelled ? 'title="Meeting cancelled"' : ''}><span class="tm">${esc(entryText(e))}</span> ${App.labelHtml(e.o, pid)}${App.imp(e.o.key, pid) === 'high' ? ' <b class="star" title="High priority">★</b>' : ''}${Store.plan.clear[e.key + '|' + pid] ? ' <span class="clr-mini" title="Clearance form done">✓CF</span>' : ''}${App.notesHtml(e.o)}</div>`;
  }

  /* Billing / advance day rows (B may have changed times, companies or tasks) */
  const STEPS = {
    advance: ['Measurement checking', 'Rate check', 'Linking to PO file', 'Advances filling', 'Asset codes checking', 'Emailing'],
    billing: ['Bill checking', 'Rate check', 'Formatting', 'Advances', 'Asset codes', 'Tally billing by P', 'B checks the billing sheet']
  };
  function payRows(o) {
    const st = Store.plan.settings, own = (Store.plan.paySheets || {})[o.key];
    if (Array.isArray(own) && own.length) return own.map(r => { const segs = Engine.minusGaps(T.m(r.start), T.m(r.end), st); return { company: r.company, start: r.start, end: r.end, steps: r.steps || (STEPS[o.type] || []).join(', '), tasks: Array.isArray(r.tasks) ? r.tasks : [], segs, text: segs.length ? Engine.partsText(segs) : `${r.start}–${r.end}` }; });
    return Engine.slotPlan(Store.plan, o, STEPS[o.type], App.data.gen).map(r => Object.assign(r, { steps: (STEPS[o.type] || []).join(', '), tasks: [] }));
  }

  /* ---------------- Today ---------------- */
  V.today = {
    title: 'Today', editing: true,
    desc: { what: 'Today: the daily timetable. See and fill in one day.',
      why: 'Each employee\'s work in Slot 1 and Slot 2 with priority, clearance form, notes, remarks and a space to add a task. On a holiday or Sunday tick "Works today" to switch that person\'s schedule on. Below: yesterday\'s action points, meetings, billing ticks, 6 pm follow-ups and B\'s daily check.' },
    render(p) {
      const plan = Store.plan, data = App.data, date = validDate(p), dt = D.parse(date);
      const hol = data.gen.hol[date], past = App.isPast(date);
      const clashes = data.iss.filter(i => i.level === 'clash' && i.date === date && i.person !== 'B');
      const meetsToday = (data.byDate[date] || []).filter(o => o.type === 'meeting');
      const pays = (data.byDate[date] || []).filter(o => o.type === 'advance' || o.type === 'billing');
      const dotT = t => t.replace(/^0/, '').replace(':', '.');
      const meet = meetsToday.map(m => { const c = meetRec(m.key).cancelled, nm = meetTitle(m).replace(/^joint (meet|meeting)\s*:?\s*/i, '');
        return `<a class="meet-line ${c ? 'cancelled' : ''}" href="#/meetings?occ=${encodeURIComponent(m.key)}">${date === D.today() ? 'TODAY' : esc(D.nice(date).toUpperCase())} JOINT MEETING ${dotT(m.start)} TO ${dotT(m.end)}${c ? ' · CANCELLED' : ''}${nm ? ` <small>${esc(nm)}</small>` : ''}</a>`; }).join('');
      const payCards = pays.map(o => { const rows = payRows(o), checks = plan.reviews.pay || {};
        return `<article class="card" style="${typeStyle(o)}"><h2>${esc(o.title)} <span class="count">${rows.filter(r => checks[o.key + '|' + r.company]).length} of ${rows.length} done</span> <a class="small noprint" href="#/billing">change times and tasks</a></h2>
          <div class="chipset">${rows.map(r => { const k = o.key + '|' + r.company; return `<label class="tchip ${checks[k] ? 'on' : ''}"><input type="checkbox" data-pay="${esc(k)}" ${checks[k] ? 'checked' : ''}><span>${esc(r.company === 'general' ? 'All works' : App.cname(r.company))}</span><small>${esc(r.text)}</small></label>`; }).join('')}</div></article>`; }).join('');
      const acts = App.actionsFor(date);
      return `<section>
        <header class="head">
          <div class="date-big"><b>${dt.getUTCDate()}</b><span>${D.DAYS[dt.getUTCDay()]}<br>${D.MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</span></div>
          <div class="acts">${dayNav('today', date)}${printBtn('day')}</div>
        </header>
        ${hol ? `<p class="banner off-banner">Holiday: ${esc(hol)}</p>` : D.dow(date) === 0 ? '<p class="banner off-banner">Sunday: a day off for everyone</p>' : ''}
        ${past ? '<p class="banner past-b">This day is over. The timetable is closed; the status, remarks and B\'s daily check can still be filled in.</p>' : ''}
        ${clashes.map(c => `<p class="banner warn">${esc(c.text)}</p>`).join('')}
        ${meet}
        ${acts.length ? `<article class="card acts-card"><h2>Action points from the 6 pm follow-up of ${esc(D.nice(acts[0].from))}</h2>${acts.map(a => `<div class="act-co"><b>${esc(a.company.name)}</b><ul>${a.items.map((x, i) => `<li><label class="check"><input type="checkbox" data-actdone="${esc(a.key)}|${Store.plan.actions[a.key].indexOf(x)}" ${x.done ? 'checked' : ''}><span class="${x.done ? 'struck' : ''}">${esc(x.t)}</span></label></li>`).join('')}</ul></div>`).join('')}</article>` : ''}
        <div class="people-grid">${App.staff().map(x => personCard(x, date, past)).join('')}</div>
        ${payCards}
        ${followCard(date, past)}
        ${!hol && D.dow(date) !== 0 ? `<label class="check dc-tom noprint"><input type="checkbox" data-dctom ${(((plan.reviews.days || {})[date]) || {}).tomorrow ? 'checked' : ''}> Timetable updated for tomorrow</label>` : ''}
      </section>`;
    },
    mount(root, p) {
      bindNav(root);
      const date = validDate(p), slots = App.data.gen.slots;
      $$('[data-trip]', root).forEach(c => c.onchange = () => { const [rk, pid] = c.dataset.trip.split('|'); App.setAway(rk, pid, c.checked); });
      $$('[data-workon]', root).forEach(c => c.onchange = () => { const pid = c.dataset.workon;
        App.commit(c.checked ? `${App.pname(pid)} works on ${D.nice(date)}: schedule switched on` : `${App.pname(pid)} does not work on ${D.nice(date)}`, pl => { pl.workOn = pl.workOn || {}; if (c.checked) pl.workOn[pid + '|' + date] = true; else delete pl.workOn[pid + '|' + date]; }); });
      $$('[data-pay]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.pay = r.pay || {}; if (c.checked) r.pay[c.dataset.pay] = true; else delete r.pay[c.dataset.pay]; Store.save(true); App.keepScroll = true; App.render(); });
      bindFollow(root);
      $$('form[data-addtask]', root).forEach(f => f.onsubmit = e => {
        e.preventDefault(); const pid = f.dataset.addtask, fd = new FormData(f), w = fd.get('w'), cid = fd.get('c') && fd.get('c') !== '-office' ? fd.get('c') : '';
        const co = Store.plan.companies.find(c => c.id === cid), typed = String(fd.get('t') || '').trim();
        if (!typed && !co) { toast('Choose a company or type the task.'); return; }
        const kind = !co ? 'office' : co.group === 'outstation' ? 'outstation' : co.id === 'ppv-works' ? 'office' : 'site';
        const title = typed ? (co && !typed.toLowerCase().includes(co.name.toLowerCase()) ? `${co.name}: ${typed}` : typed) : (kind === 'office' ? co.name : `Site measurement: ${co.name}`);
        const wm = co && kind !== 'office' ? Engine.windowProblem(Store.plan, co.id, date) : null; if (wm) toast(wm);
        const a = w === 'day' ? slots[0][0] : slots[+w][0], b = w === 'day' ? slots[slots.length - 1][1] : slots[+w][1];
        const x = { id: 'e' + Date.now().toString(36), title, date, start: T.s(a), end: T.s(b), type: kind, people: [pid], companies: co ? [co.id] : [], details: 'Added on the daily timetable.', importance: fd.get('hp') ? 'high' : '' };
        App.commit(`Added "${title}" for ${App.pname(pid)}. Other work that day moved around it.`, pl => pl.extra.push(x));
      });
      const rec = () => { const r = Store.plan.reviews; r.days = r.days || {}; const d = (r.days[date] = r.days[date] && r.days[date].emp ? r.days[date] : Object.assign(r.days[date] || {}, { emp: {} })); return d; };
      const emp = pid => { const d = rec(); return (d.emp[pid] = d.emp[pid] || {}); };
      $$('[data-dcleave]', root).forEach(c => c.onchange = () => App.setLeave(c.dataset.dcleave, date, c.checked));
      $$('[data-dcw]', root).forEach(t => { autoGrow(t); t.onchange = () => { const e = emp(t.dataset.dcw); if (t.value.trim()) e.works = t.value; else delete e.works; Store.save(true); toast('Saved.'); }; });
      $$('[data-dcok]', root).forEach(c => c.onchange = () => { const [pid, v] = c.dataset.dcok.split('|'), e = emp(pid); if (c.checked) e.ok = v; else delete e.ok; Store.save(true); App.keepScroll = true; App.render(); });
      $$('[data-dct]', root).forEach(c => c.onchange = () => { const e = emp(c.dataset.dct); if (c.checked) e.timely = true; else delete e.timely; Store.save(true); App.keepScroll = true; App.render(); });
      $$('[data-dctom]', root).forEach(c => c.onchange = () => { const d = rec(); if (c.checked) d.tomorrow = true; else delete d.tomorrow; Store.save(true); App.keepScroll = true; App.render(); });
    }
  };
  function autoGrow(t) { const grow = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }; grow(); t.addEventListener('input', grow); }

  function personCard(x, date, past) {
    const pid = x.id, list = workOf(pid, date).filter(e => e.o.type !== 'meeting');
    const w = App.whereLabel(date, pid), leave = App.onLeave(pid, date), rest = restOf(pid, date), chose = workOnDay(pid, date);
    const restDay = App.data.gen.hol[date] || D.dow(date) === 0 || Engine.personOff(Store.plan, pid, date);
    const trip = App.outstationRuns(pid).find(r => r.days.includes(date));
    const slots = App.data.gen.slots;
    const workSwitch = restDay && !past ? `<label class="tchip sm workon ${chose ? 'on' : ''}"><input type="checkbox" data-workon="${esc(pid)}" ${chose ? 'checked' : ''}><span>${chose ? '✓ Works today' : 'Works today'}</span></label>` : '';
    let body;
    if (expired(date, pid)) body = `<p class="free">Record deleted (older than ${Store.plan.settings.retentionDays} days)</p>`;
    else if (rest) body = `<div class="offblock">${esc(rest)}</div>`;
    else if (leave) body = '<p class="free leave-note">On leave. The work of this day is moved to the next working day.</p>';
    else if (!list.length) body = '<p class="free">Nothing planned</p>';
    else {
      const freeSlots = slots.map((s, i) => i).filter(i => !list.some(e => e.parts.some(pt => pt[0] < slots[i][1] && pt[1] > slots[i][0])));
      body = `<ul class="ed-rows">${list.map(e => {
        const k = e.key + '|' + pid, r = Store.plan.remarks[k] || {};
        const cf = e.o.type !== 'meeting' && date <= D.today();
        const clash = App.data.clashKeys.has(e.key) && App.data.clashPD.has(pid + '|' + date);
        return `<li class="${clash ? 'clash' : ''} ${e.o.carried ? 'carried' : ''}" style="${typeStyle(e.o)}"><div class="ed-top"><span class="tm">${esc(entryText(e))}</span>${past ? `<span class="ed-name">${App.labelHtml(e.o, pid)}</span>` : `<button type="button" class="link ed-name" data-occ="${esc(e.key)}" title="Change time, people or notes">${App.labelHtml(e.o, pid)}</button>`}${e.o.carried ? ` <small class="muted">from leave ${short(e.o.carriedFrom)}</small>` : ''}</div>
          ${App.notesHtml(e.o)}
          ${e.o.type !== 'meeting' || cf ? `<div class="ed-ctl">${e.o.type !== 'meeting' ? App.impControl(e.key, pid) : ''}${cf ? `<button type="button" class="tchip sm ${Store.plan.clear[k] ? 'on' : ''}" data-cf="${esc(k)}">${Store.plan.clear[k] ? '✓ ' : ''}Clearance form</button>` : ''}</div>` : ''}
          ${date <= D.today() ? `<div class="rmk"><select data-rs="${esc(k)}" aria-label="Status"><option value="">Status…</option>${Object.keys(App.REMARK_LABELS).map(s => `<option value="${s}" ${r.s === s ? 'selected' : ''}>${App.REMARK_LABELS[s]}</option>`).join('')}</select><input data-rt="${esc(k)}" value="${esc(r.t || '')}" placeholder="Remark"></div>` : ''}</li>`;
      }).join('')}${freeSlots.map(i => `<li class="freeslot"><span class="tm">${esc(App.slotLabel(i))}</span><span>Free</span></li>`).join('')}</ul>`;
    }
    const fine = rest || leave ? '' : fineLines(pid, date, false);
    const canAdd = !past && !rest && !leave;
    const ok = ((((Store.plan.reviews.days || {})[date] || {}).emp || {})[pid] || {}).ok;
    const restDay2 = rest && !chose;
    const leaveTick = !restDay2 && !expired(date, pid) ? `<label class="tchip sm leave-t ${leave ? 'on' : ''}"><input type="checkbox" data-dcleave="${esc(pid)}" ${leave ? 'checked' : ''} ${past ? 'disabled' : ''}><span>On leave</span></label>` : '';
    const suff = !rest && !leave && date <= D.today() && !expired(date, pid) ? `<div class="suff"><span class="small muted">Works completed today:</span><label class="tchip sm ${ok === 'yes' ? 'on' : ''}"><input type="checkbox" data-dcok="${esc(pid)}|yes" ${ok === 'yes' ? 'checked' : ''}><span>Sufficient</span></label><label class="tchip sm bad ${ok === 'no' ? 'on' : ''}"><input type="checkbox" data-dcok="${esc(pid)}|no" ${ok === 'no' ? 'checked' : ''}><span>Not sufficient</span></label></div>` : '';
    return `<article class="card person tcard ${past ? 'past' : ''} ${rest ? 'resting' : ''}" style="--pc:${x.color}">
      <header>${App.avatar(pid, 'lg')}<div><a href="#/employees" class="name">${esc(x.name)}</a>${rest ? '' : `<span class="where w-${w.k}">${esc(w.text)}</span>`}</div>
        <span class="hd-chips">${workSwitch}${leaveTick}${trip && !past && !rest ? `<label class="tchip sm ${trip.going ? 'on' : ''}" title="Goes on the outstation trip ${esc(listDates(trip.days))}"><input type="checkbox" data-trip="${esc(trip.runKey)}|${esc(pid)}" ${trip.going ? 'checked' : ''}><span>Outstation</span></label>` : ''}</span></header>
      ${body}
      ${fine ? `<div class="fines">${fine}</div>` : ''}
      ${suff}
      ${canAdd ? `<form class="addtask noprint" data-addtask="${esc(pid)}"><select name="c" class="at-co" aria-label="Company">${companyOptions()}</select><input name="t" placeholder="New task for ${esc(x.name)}" aria-label="New task">
        <select name="w" aria-label="When">${slots.map((s, i) => `<option value="${i}">Slot ${i + 1}</option>`).join('')}<option value="day">Whole day</option></select>
        <label class="tchip sm hp-pick"><input type="checkbox" name="hp"><span>★ High</span></label><button class="btn ghost sm" type="submit">${icon('plus')}Add</button></form>` : ''}
    </article>`;
  }

  /* All companies, by group, for the new-task menu */
  function companyOptions() {
    const plan = Store.plan;
    return `<option value="">Company (optional)…</option><option value="-office">Office work, no company</option>` + Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(c => c.group === gk).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
  }
  /* 6 pm follow-up: company engineers, discussion, action points for the next day */
  const engHtml = c => (c.engineers || []).filter(e => e.name).map(e => `<span class="eng">${esc(e.name)}${e.phone ? ` <a href="tel:${esc(e.phone.replace(/\s/g, ''))}">${esc(e.phone)}</a>` : ''}</span>`).join('') || '<span class="muted small">No engineer names yet (Settings → Company engineers)</span>';
  function followCard(date, past) {
    const data = App.data, set = new Set();
    data.gen.visits.filter(v => v.date === date).forEach(v => set.add(v.company));
    (data.byDate[date] || []).filter(o => !o.siteGroup && o.type !== 'meeting' && o.type !== 'billing' && o.type !== 'advance' && o.type !== 'review').forEach(o => (o.companies || []).forEach(c => set.add(c)));
    const cos = Store.plan.companies.filter(c => set.has(c.id));
    if (!cos.length) return '';
    return `<article class="card"><h2>6 pm follow-up</h2><div class="fu-cos">${cos.map(c => { const k = c.id + '|' + date, acts = Store.plan.actions[k] || [];
      return `<div class="fu-co"><div class="fu-h"><b>${esc(c.name)}</b><span class="engs">${engHtml(c)}</span></div>
        <div class="fu-l">Action points for the next day<ul class="act-ed">${acts.map((a, i) => `<li><input data-act="${esc(k)}|${i}" value="${esc(a.t)}" placeholder="Action point"><button type="button" class="x" data-actrm="${esc(k)}|${i}" aria-label="Remove">${icon('x')}</button></li>`).join('')}</ul>
          <button type="button" class="add-small" data-actadd="${esc(k)}">${icon('plus')}Add action point</button></div></div>`; }).join('')}</div>
      <p class="muted small">Action points appear the next working day on Today, in the monthly schedule, on the Employees page, in the next meeting and on the company's schedule.</p></article>`;
  }
  function bindFollow(root) {
    $$('[data-fu]', root).forEach(t => { autoGrow(t); t.onchange = () => { const k = t.dataset.fu; if (t.value.trim()) Store.plan.followups[k] = t.value; else delete Store.plan.followups[k]; Store.save(true); toast('Follow-up saved.'); }; });
    const acts = k => (Store.plan.actions[k] = Store.plan.actions[k] || []);
    $$('[data-act]', root).forEach(i => i.onchange = () => { const [k, n] = splitLast(i.dataset.act); acts(k)[+n].t = i.value; Store.save(true); toast('Action point saved.'); });
    $$('[data-actrm]', root).forEach(b => b.onclick = () => { const [k, n] = splitLast(b.dataset.actrm); App.commit('Action point removed', p => { p.actions[k].splice(+n, 1); if (!p.actions[k].length) delete p.actions[k]; }); });
    $$('[data-actadd]', root).forEach(b => b.onclick = () => { const k = b.dataset.actadd; App.keepScroll = true; Store.change('Action point added', p => { (p.actions[k] = p.actions[k] || []).push({ t: '', done: false }); }); setTimeout(() => { const l = $$(`[data-act^="${k}|"]`); if (l.length) l[l.length - 1].focus(); }, 60); });
    $$('[data-actdone]', root).forEach(c => c.onchange = () => { const [k, n] = splitLast(c.dataset.actdone); const a = (Store.plan.actions[k] || [])[+n]; if (!a) return; a.done = c.checked; Store.save(true); App.keepScroll = true; App.render(); });
  }
  const splitLast = s => { const i = s.lastIndexOf('|'); return [s.slice(0, i), s.slice(i + 1)]; };

  /* ---------------- Month (with a Week tab), marks for target completion ---------------- */
  const mk = { mode: false, sel: new Set() };
  const marksOf = (pid, d) => (Store.plan.marks || []).filter(m => m.cells.some(c => c.pid === pid && c.date === d));
  function cellCls(pid, d) { const ms = marksOf(pid, d); if (!ms.length) return ''; return ms[ms.length - 1].tone === 'neg' ? 'mk-neg' : 'mk-pos'; }
  const cellTip = (pid, d) => marksOf(pid, d).map(m => `${m.tone === 'neg' ? '✗' : '✓'} ${m.text}`).join('\n');
  function cellsText(cells) { const by = {}; cells.forEach(c => { (by[c.pid] = by[c.pid] || []).push(c.date); }); return Object.keys(by).map(pid => `${App.pname(pid)}: ${listDates(by[pid])}`).join(' · '); }
  V.month = {
    title: 'Month', editing: true,
    desc: { what: 'Month: the monthly schedule, one row for every day (or the Week tab, in the same layout).',
      why: 'Select any cells and mark them for target completion with a remark: positive remarks turn the cells green and give points, negative remarks turn them orange. Point at a marked cell to read the remark. ◷ lines are commitments from meetings (✎ to edit), ↳ lines are action points from the 6 pm follow-up. "+ Meeting" under a date adds a meeting on that day.' },
    render(p) {
      const plan = Store.plan, data = App.data, st = plan.settings, staff = App.staff(), week = p.view === 'week';
      const m = pickMonth(p), ws = D.weekStart(p.w || App.defaultDate());
      const dates = week ? D.range(ws, D.add(ws, 6)) : data.gen.dates.filter(d => D.month(d) === m);
      const tabs = `<nav class="tabs plain noprint view-tabs"><a href="${link('month', { m })}" class="${!week ? 'on' : ''}">Month</a><a href="${link('month', { view: 'week', w: D.weekStart(App.defaultDate()) })}" class="${week ? 'on' : ''}">Week</a></nav>`;
      const meetOn = d => (data.byDate[d] || []).filter(o => o.type === 'meeting');
      const meetBtn = d => { if (App.isPast(d) || d < st.start || d > st.end) return ''; const ms = meetOn(d);
        return ms.length ? ms.map(o => `<a class="mt-chip noprint ${meetRec(o.key).cancelled ? 'cancelled' : ''}" href="#/meetings?occ=${encodeURIComponent(o.key)}" title="${esc(meetTitle(o))}">◉ Meeting</a>`).join('') : `<button type="button" class="mt-add noprint" data-newmeet="${d}" title="Add a meeting on this day">+ Meeting</button>`; };
      const rows = dates.map(d => {
        const k = dayKind(d), past = App.isPast(d);
        const head = `<th class="rowhead"><a href="#/today?date=${d}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}${week ? ' ' + D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3) : ''}</a>${k.thin && (App.data.gen.hol[d] || D.dow(d) === 0) ? '' : meetBtn(d)}</th>`;
        if (k.thin) return `<tr class="thin"><th class="rowhead">${D.day(d)} ${D.DAYS[D.dow(d)].slice(0, 3)}${App.data.gen.hol[d] || D.dow(d) === 0 ? '' : meetBtn(d)}</th><td colspan="${staff.length}">${esc(k.label)}</td></tr>`;
        return `<tr class="${past ? 'past' : ''}">${head}${staff.map(x => {
          const ck = x.id + '|' + d, sel = mk.sel.has(ck) ? 'sel' : '', tip = cellTip(x.id, d);
          const rest = restOf(x.id, d);
          if (rest) return `<td class="off" data-cell="${ck}"><span>${esc(rest.replace(/^Holiday: /, ''))}</span></td>`;
          if (App.onLeave(x.id, d)) return `<td class="off leave" data-cell="${ck}"><span>On leave</span></td>`;
          const list = workOf(x.id, d);
          return `<td class="mc ${cellCls(x.id, d)} ${sel}" data-cell="${ck}" ${tip ? `title="${esc(tip)}"` : ''}>${list.map(e => line(e, x.id)).join('') || '<span class="offday">Free</span>'}${fineLines(x.id, d, true)}${tip ? `<div class="mk-note noprint">${esc(marksOf(x.id, d).slice(-1)[0].text)}</div>` : ''}</td>`;
        }).join('')}</tr>`;
      }).join('');
      const ds = new Set(dates), marks = (plan.marks || []).filter(mm => mm.cells.some(c => ds.has(c.date)));
      const prev = D.add(ws, -7), next = D.add(ws, 7);
      const top = week ? `<header class="head"><h1>Week: ${listDates(dates)} ${ws.slice(0, 4)}</h1>
          <div class="acts"><div class="nav-date noprint"><a class="round ${prev < D.weekStart(st.start) ? 'off' : ''}" href="${link('month', { view: 'week', w: prev })}" aria-label="Previous week">${icon('left')}</a>
          <a class="btn ghost" href="${link('month', { view: 'week', w: D.weekStart(App.defaultDate()) })}">This week</a>
          <a class="round ${next > st.end ? 'off' : ''}" href="${link('month', { view: 'week', w: next })}" aria-label="Next week">${icon('right')}</a></div>${printBtn('month')}</div></header>`
        : `<header class="head"><h1>Monthly schedule: ${monthName(m)}</h1>${printBtn('month')}</header>${monthTabs('month', m)}`;
      return `<section>${tabs}${top}
        <div class="mk-bar noprint ${mk.mode ? 'on' : ''}"><button type="button" class="btn ${mk.mode ? 'primary' : 'ghost'} sm" id="mk-mode">${mk.mode ? '✓ Selecting cells: click cells to select' : 'Select cells to mark for target completion'}</button>
          ${mk.mode ? `<span class="count">${mk.sel.size} selected</span><button type="button" class="btn primary sm" id="mk-go" ${mk.sel.size ? '' : 'disabled'}>Mark selected…</button><button type="button" class="btn ghost sm" id="mk-clear">Clear</button>` : ''}</div>
        <div class="scroll"><table class="week month ${mk.mode ? 'selecting' : ''}" id="mt"><thead><tr><th>Date</th>${staff.map(x => `<th>${App.who(x.id)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        ${legend()}
        ${marks.length ? `<article class="card"><h2>Marks ${week ? 'this week' : 'this month'}</h2><ul class="mk-list">${marks.map(mm => `<li class="${mm.tone === 'neg' ? 'neg' : 'pos'}"><span class="mk-tone">${mm.tone === 'neg' ? 'Negative' : 'Positive'}</span><span><b>${esc(mm.text)}</b><small>${esc(cellsText(mm.cells))}</small></span><button type="button" class="btn ghost sm" data-mkedit="${esc(mm.id)}">Edit</button></li>`).join('')}</ul></article>` : ''}
      </section>`;
    },
    mount(root, p) {
      const b = $('#mk-mode', root); if (b) b.onclick = () => { mk.mode = !mk.mode; if (!mk.mode) mk.sel.clear(); App.keepScroll = true; App.render(); };
      const c = $('#mk-clear', root); if (c) c.onclick = () => { mk.sel.clear(); App.keepScroll = true; App.render(); };
      const g = $('#mk-go', root); if (g) g.onclick = () => markDialog(null, [...mk.sel].map(s => { const [pid, date] = s.split('|'); return { pid, date }; }));
      const t = $('#mt', root);
      if (t) t.addEventListener('click', e => {
        const ce = e.target.closest('[data-cedit]'); if (ce) { e.stopPropagation(); const [pid, d] = ce.dataset.cedit.split('|'); commitDialog(pid, d); return; }
        const cell = e.target.closest('td[data-cell]'); if (!cell || e.target.closest('a')) return;
        const [pid, date] = cell.dataset.cell.split('|');
        if (mk.mode) { if (mk.sel.has(cell.dataset.cell)) mk.sel.delete(cell.dataset.cell); else mk.sel.add(cell.dataset.cell); App.keepScroll = true; App.render(); return; }
        const ms = marksOf(pid, date); if (ms.length) markDialog(ms[ms.length - 1]);
      });
      $$('[data-mkedit]', root).forEach(x => x.onclick = () => markDialog((Store.plan.marks || []).find(mm => mm.id === x.dataset.mkedit)));
      $$('[data-newmeet]', root).forEach(x => x.onclick = e => { e.stopPropagation(); newMeeting(x.dataset.newmeet); });
    }
  };
  /* A new meeting on a day: same time slot as the repeating meetings; the details are filled in on the Meetings page */
  function newMeeting(d) {
    const t = Store.plan.tasks.find(x => x.type === 'meeting') || { start: '09:15', end: '10:30' };
    const id = 'm' + Date.now().toString(36);
    App.commit(`New meeting on ${D.nice(d)}`, p => { p.extra.push({ id, title: 'Joint meeting', date: d, start: t.start, end: t.end, type: 'meeting', people: p.people.map(x => x.id), companies: [], details: 'Added from the monthly schedule.' }); (p.meetDays = p.meetDays || {})['x:' + id] = { agenda: [] }; });
    location.hash = '#/meetings?occ=' + encodeURIComponent('x:' + id);
  }
  const legend = () => `<ul class="key">${Object.keys(App.TYPES).filter(k => k !== 'review').map(k => `<li><span style="background:color-mix(in srgb, ${App.TYPES[k].color} 30%, #fff)"></span>${App.TYPES[k].label}</li>`).join('')}<li><span class="key-off"></span>Holiday, Sunday or day off</li><li><span class="key-pos"></span>Target done (positive)</li><li><span class="key-neg"></span>Negative remark</li><li><b class="star">★</b> High priority</li></ul>`;
  function markDialog(mark, cells) {
    cells = mark ? mark.cells : cells;
    modal({ title: mark ? 'Edit mark' : 'Mark for target completion',
      body: `<form id="mkf" class="form"><p class="muted">${esc(cellsText(cells))}</p>
        <label>Remark (shown when the mouse is on these cells)<textarea name="t" rows="3" required>${esc(mark ? mark.text : '')}</textarea></label>
        <fieldset><legend>This remark is</legend><label class="check"><input type="radio" name="tone" value="pos" ${!mark || mark.tone !== 'neg' ? 'checked' : ''}> Positive: target completed (green, gives ${Store.plan.settings.targetPoints || 100} points to each employee in it)</label>
        <label class="check"><input type="radio" name="tone" value="neg" ${mark && mark.tone === 'neg' ? 'checked' : ''}> Negative (orange, no points)</label></fieldset></form>`,
      foot: `${mark ? '<button type="button" class="btn ghost danger" id="mk-del">Delete mark</button>' : ''}<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="mkf" class="btn primary">Save</button>`,
      onOpen: m => {
        $('#mkf', m).onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target), text = String(fd.get('t')).trim(), tone = fd.get('tone'); if (!text) return; closeModal();
          App.commit(tone === 'pos' ? 'Marked: target completed' : 'Marked with a negative remark', p => {
            p.marks = p.marks || [];
            if (mark) Object.assign(p.marks.find(x => x.id === mark.id), { text, tone });
            else p.marks.push({ id: 'm' + Date.now().toString(36), cells, text, tone, at: D.today() });
          });
          mk.sel.clear(); mk.mode = false; };
        const d = $('#mk-del', m); if (d) d.onclick = () => { closeModal(); App.commit('Mark deleted', p => { p.marks = p.marks.filter(x => x.id !== mark.id); }); };
      } });
  }
  function commitDialog(pid, d) {
    const list = App.commitsFor(pid, d);
    modal({ title: `Commitments of ${App.pname(pid)}`,
      body: `<form id="cmf" class="form">${list.map(c => `<fieldset data-cid="${esc(c.id)}"><legend>From the meeting on ${esc(D.nice(c.start))}</legend>
        <label>Task<input name="task" value="${esc(c.task)}"></label><div class="row2"><label>Days committed<input type="number" name="days" min="0" max="90" value="${c.days}"></label><label>Due<input type="date" name="due" value="${c.due}"></label></div>
        <label class="check small"><input type="checkbox" name="del"> Delete this commitment</label></fieldset>`).join('')}</form>`,
      foot: '<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="cmf" class="btn primary">Save</button>',
      onOpen: m => $('#cmf', m).onsubmit = e => { e.preventDefault(); const edits = $$('fieldset[data-cid]', m).map(f => ({ id: f.dataset.cid, task: $('[name=task]', f).value, days: Math.max(0, Number($('[name=days]', f).value) || 0), due: $('[name=due]', f).value, del: $('[name=del]', f).checked })); closeModal();
        App.commit('Commitments saved', p => { edits.forEach(x => { const c = p.commits.find(y => y.id === x.id); if (!c) return; if (x.del) { p.commits = p.commits.filter(y => y.id !== x.id); return; }
          const daysChanged = x.days !== c.days; c.task = x.task; c.days = x.days; c.due = daysChanged ? D.add(c.start, x.days) : (x.due || c.due); }); }); } });
  }

  /* ---------------- Employees: everyone side by side (without B) ---------------- */
  V.employees = {
    title: 'Employees',
    desc: { what: 'Employees: all employees side by side.',
      why: 'Points for target completion (from positive marks in the monthly schedule), companies, outstation days with their companies, and every day of the timetable with commitments and action points. The print button above a name prints that employee only.' },
    render() {
      const plan = Store.plan, data = App.data, ppl = App.staff();
      const cell = (x, html, cls) => `<td data-emp="${esc(x.id)}" class="${cls || ''}">${html}</td>`;
      const comps = x => { const r = plan.responsibilities[x.id] || {}; return ['main', 'outstation', 'other'].map(g => (r[g] || []).length ? `<div class="ec-grp"><span class="muted small">${App.GROUPS[g]}</span>${(r[g] || []).map(c => `<div><b class="co">${esc(App.cname(c))}</b></div>`).join('')}</div>` : '').join('') || '<span class="muted">–</span>'; };
      const trips = x => { const runs = App.outstationRuns(x.id); if (!runs.length) return '<span class="muted">–</span>';
        return runs.map(r => { const vs = data.gen.visits.filter(v => v.runKey === r.runKey && v.person === x.id);
          return `<div class="ec-trip ${r.going ? '' : 'stay'}"><b>${esc(listDates(r.days))}</b>${r.going ? (vs.length ? vs.map(v => `<div>${short(v.date)}: <b class="co">${esc(App.cname(v.company))}</b></div>`).join('') : `<div class="muted small">${esc(((plan.responsibilities[x.id] || {}).outstation || []).map(c => App.cname(c)).join(', '))}</div>`) : '<div class="muted small">Stays in town</div>'}</div>`; }).join(''); };
      const day = (x, d) => {
        if (expired(d, x.id)) return cell(x, '<span class="muted small">Deleted after 45 days</span>');
        const rest = restOf(x.id, d); if (rest) return cell(x, `<span>${esc(rest.replace(/^Holiday: /, ''))}</span>`, 'off');
        if (App.onLeave(x.id, d)) return cell(x, '<span>On leave</span>', 'off leave');
        const list = workOf(x.id, d);
        return cell(x, (list.map(e => { const r = plan.remarks[e.key + '|' + x.id] || {}; return line(e, x.id) + (r.s || r.t ? `<div class="small muted">${esc([App.REMARK_LABELS[r.s], r.t].filter(Boolean).join(': '))}</div>` : ''); }).join('') || '<span class="offday">Free</span>') + fineLines(x.id, d, false), cellCls(x.id, d));
      };
      const dayRows = data.gen.dates.map(d => { const k = dayKind(d);
        if (k.thin) return `<tr class="thin"><th class="rowhead">${D.day(d)} ${D.DAYS[D.dow(d)].slice(0, 3)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</th>${ppl.map((x, i) => cell(x, i === 0 ? esc(k.label) : '')).join('')}</tr>`;
        return `<tr class="${App.isPast(d) ? 'past' : ''}"><th class="rowhead"><a href="#/today?date=${d}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</a></th>${ppl.map(x => day(x, d)).join('')}</tr>`; }).join('');
      return `<section><header class="head"><h1>Employees</h1><div class="acts noprint">${printBtn('employees', 'Print all')}</div></header>
        <div class="scroll"><table class="week emp-chart" style="min-width:${110 + ppl.length * 200}px"><thead><tr><th></th>${ppl.map(x => `<th data-emp="${esc(x.id)}" style="--pc:${x.color}"><div class="eh">${App.avatar(x.id)}<div><b>${esc(x.name)}</b><small>${esc(x.role || '')}</small></div></div>
            <div class="eh-acts noprint"><button type="button" class="btn ghost sm" data-printemp="${esc(x.id)}" title="Print ${esc(x.name)} only">${icon('print')}Print</button><button type="button" class="btn ghost sm" data-ics="${esc(x.id)}" title="Add to phone calendar">${icon('calendar')}</button></div></th>`).join('')}</tr></thead>
          <tbody>
            <tr class="ec-sum"><th class="rowhead">Points for target completion<small>positive marks × ${plan.settings.targetPoints || 100}</small></th>${ppl.map(x => cell(x, `<b class="pts" style="color:${x.color}">${App.points(x.id)}</b> <span class="muted small">points</span>`)).join('')}</tr>
            <tr class="ec-sum"><th class="rowhead">Companies</th>${ppl.map(x => cell(x, comps(x))).join('')}</tr>
            <tr class="ec-sum"><th class="rowhead">Outstation</th>${ppl.map(x => cell(x, trips(x))).join('')}</tr>
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

  /* ---------------- Companies: each company has its own billing list and rate lists, and a search box ---------------- */
  const FILES = [['bill', 'Billing list'], ['r2526', 'Rate list 2025-26'], ['r2627', 'Rate list 2026-27']];
  const filesOf = cid => (Store.plan.files || {})[cid] || {};
  function fileSearch(q, cid) {
    if (!q || q.trim().length < 2) return null;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean), out = [];
    const srcs = FILES.map(([k, l]) => ({ k, l, f: filesOf(cid)[k] })).concat([{ k: 'bill', l: 'Billing list (all companies)', f: filesOf('all').bill }]).filter(x => x.f);
    srcs.forEach(src => { const hits = []; src.f.sheets.forEach(sh => sh.rows.forEach((r, i) => { if (words.every(w => r.join(' ').toLowerCase().includes(w))) hits.push({ sheet: sh.name, row: i + 1, cells: r }); })); out.push({ src, hits: hits.slice(0, 10), more: Math.max(0, hits.length - 10) }); });
    return out;
  }
  V.companies = {
    title: 'Companies', editing: true,
    desc: { what: 'Companies: the three groups, who measures each company, its engineers and site days, and its own billing list and rate lists.',
      why: 'In each company, upload its latest billing list and the rate lists 2025-26 and 2026-27 (Excel or CSV). Then type a work or file name in that company\'s search box: it shows straight away whether it is already billed and where it is in the rate lists. Click a company name for its monthly schedule and 6 pm follow-ups.' },
    render() {
      const plan = Store.plan, data = App.data;
      const owners = c => plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      const fileRow = (c, k, l) => { const f = filesOf(c.id)[k];
        return `<div class="cf-row"><span class="cf-l">${l}</span>${f ? `<span class="cf-n" title="Uploaded ${esc(D.nice(f.at, { long: true }))}">${esc(f.name)}</span>` : '<span class="muted small">not uploaded</span>'}
          <label class="btn ghost sm noprint">${icon('upload')}${f ? 'Newer' : 'Upload'}<input type="file" data-cfile="${esc(c.id)}|${k}" accept=".xlsx,.csv" hidden></label>${f ? `<button type="button" class="x noprint" data-cfrm="${esc(c.id)}|${k}" aria-label="Remove ${l}">${icon('x')}</button>` : ''}</div>`; };
      return `<section><header class="head"><h1>Companies</h1></header>
        ${filesOf('all').bill ? `<p class="banner">An older billing list for all companies (${esc(filesOf('all').bill.name)}) is still searched in every company. <button type="button" class="link" data-cfrm="all|bill">Remove it</button></p>` : ''}
        ${Object.keys(App.GROUPS).map(gk => { const wd = Engine.windowDays(plan, gk); return `<h2 class="group">${App.GROUPS[gk]}<span class="grp-days">${wd ? 'days ' + wd.join(', ') : ''}</span></h2><div class="comp-grid">${plan.companies.filter(c => c.group === gk).map(c => {
          const vs = data.gen.visits.filter(v => v.company === c.id).sort((a, b) => a.date < b.date ? -1 : 1), ow = owners(c);
          const any = FILES.some(([k]) => filesOf(c.id)[k]) || filesOf('all').bill;
          return `<article class="card comp comp-${gk}"><h3><a href="#/company?id=${encodeURIComponent(c.id)}">${esc(c.name)}</a></h3><p class="muted small">${ow.length ? ow.filter(x => !App.isB(x.id)).map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}</p>
            ${(c.engineers || []).some(e => e.name) ? `<p class="small">Engineers: ${engHtml(c)}</p>` : ''}
            <div class="chips">${vs.map(v => `<span class="dchip ${App.isPast(v.date) ? 'past' : ''}" style="--pc:${App.pcolor(v.person)}">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</span>`).join('') || '<span class="muted small">No site day in this timetable</span>'}</div>
            ${App.runsOfCompany(c.id).filter(rk => App.runDates(rk).dates.some(d => !App.isPast(d))).map(rk => { const R = App.runDates(rk); return `<button type="button" class="btn ghost sm run-btn noprint" data-run="${esc(rk)}" title="Add or take out a day for this month only">${icon('calendar')}${esc(D.MONTHS[+rk.split('@')[1].slice(5) - 1].slice(0, 3))}: ${esc(listDates(R.dates))}</button>`; }).join('')}
            <div class="cfiles">${FILES.map(([k, l]) => fileRow(c, k, l)).join('')}</div>
            ${any ? `<input class="bl-q noprint" data-blq="${esc(c.id)}" placeholder="Search: work or file name" aria-label="Search the lists of ${esc(c.name)}"><div class="bl-res" data-blr="${esc(c.id)}"></div>` : ''}</article>`;
        }).join('')}</div>`; }).join('')}</section>`;
    },
    mount(root) {
      $$('[data-run]', root).forEach(b => b.onclick = () => App.openRun(b.dataset.run));
      $$('[data-cfile]', root).forEach(f => f.onchange = async () => {
        const file = f.files[0]; if (!file) return; const [cid, k] = f.dataset.cfile.split('|'), lab = FILES.find(x => x[0] === k)[1];
        try {
          const sheets = await IO.readTable(file);
          if (JSON.stringify(sheets).length > 900000) { toast('That file is too big to keep (more than about 900 KB of text). Remove unused sheets or columns and try again.'); return; }
          App.commit(`${App.cname(cid)}: ${lab} "${file.name}" uploaded`, p => { p.files = p.files || {}; p.files[cid] = Object.assign({}, p.files[cid], { [k]: { name: file.name, at: D.today(), sheets } }); });
        } catch (e) { toast(e.message || 'That file could not be read.'); }
      });
      $$('[data-cfrm]', root).forEach(b => b.onclick = () => { const [cid, k] = b.dataset.cfrm.split('|');
        confirmBox('Remove this file?', 'The uploaded list is removed. You can undo this.', 'Remove', () => App.commit('List removed', p => { if (p.files && p.files[cid]) { delete p.files[cid][k]; if (!Object.keys(p.files[cid]).length) delete p.files[cid]; } }), true); });
      $$('[data-blq]', root).forEach(i => i.oninput = () => {
        const cid = i.dataset.blq, res = $(`[data-blr="${cid}"]`, root), r = fileSearch(i.value, cid);
        if (!r) { res.innerHTML = ''; return; }
        res.innerHTML = r.map(({ src, hits, more }) => {
          const head = hits.length ? (src.k === 'bill' ? `<p class="bl-yes">✓ Already billed: in ${esc(src.f.name)}</p>` : `<p class="bl-yes rate">Found in ${esc(src.l)} (${esc(src.f.name)})</p>`)
            : (src.k === 'bill' ? `<p class="bl-no">Not in ${esc(src.f.name)}: not billed yet.</p>` : `<p class="muted small">Not in ${esc(src.l)}.</p>`);
          return head + (hits.length ? `<ul>${hits.map(x => `<li><small>${esc(x.sheet)}, row ${x.row}</small> ${x.cells.filter(v => v !== '').map(esc).join(' · ')}</li>`).join('')}${more ? `<li class="muted">and ${more} more</li>` : ''}</ul>` : '');
        }).join('');
      });
    }
  };

  function companyEntries(cid, dates) {
    const data = App.data, set = new Set(dates), out = [];
    data.gen.visits.filter(v => v.company === cid && set.has(v.date) && v.person !== 'B').forEach(v => {
      const e = (data.gen.sched[v.person + '|' + v.date] || []).find(x => x.o.runKey === v.runKey);
      out.push({ date: v.date, time: e ? entryText(e) : '', sort: e && e.parts.length ? e.parts[0][0] : 9999, work: `Site measurement ${v.cycle || ''}${v.repeat ? ' (continued)' : ''}`.trim(), type: e ? e.o.type : 'site', people: [v.person], key: e ? e.o.key : null, o: e ? e.o : null });
    });
    data.gen.occs.filter(o => set.has(o.date) && !o.siteGroup && o.type !== 'review' && (o.companies || []).includes(cid)).forEach(o => {
      let time = App.timeText(o, o.people[0]), sort = T.m(o.start);
      if (o.type === 'billing' || o.type === 'advance') { const r = payRows(o).find(x => x.company === cid); if (!r) return; time = r.text; sort = r.segs.length ? r.segs[0][0] : sort; }
      out.push({ date: o.date, time, sort, work: o.title, type: o.type, people: o.people.filter(x => x !== 'B'), key: o.key, o });
    });
    return out.sort((a, b) => a.date === b.date ? a.sort - b.sort : (a.date < b.date ? -1 : 1));
  }
  V.company = {
    title: 'Company schedule',
    desc: { what: 'Company schedule: one company\'s timetable for a month, every day listed.',
      why: 'Each day\'s work with its notes and priority, and the 6 pm follow-up points of that day, one point per line, with a tick when done. The same points show on Today, in the next meeting and in the monthly schedule.' },
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p);
      const c = plan.companies.find(x => x.id === p.id) || plan.companies[0];
      if (!c) return '<p class="free">No companies.</p>';
      const dates = data.gen.dates.filter(d => D.month(d) === m), ents = companyEntries(c.id, dates), fu = plan.followups;
      const owners = plan.people.filter(x => x.id !== 'B' && ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      const rows = dates.map(d => {
        const list = ents.filter(e => e.date === d), past = App.isPast(d), hol = data.gen.hol[d], k = c.id + '|' + d, rs = Math.max(1, list.length);
        const acts = plan.actions[k] || [];
        const fuCell = `<td class="fu" rowspan="${rs}"><ul class="act-ed">${acts.map((a, i) => `<li><input type="checkbox" data-actdone="${esc(k)}|${i}" ${a.done ? 'checked' : ''} aria-label="Done"><input data-act="${esc(k)}|${i}" value="${esc(a.t)}" placeholder="Follow-up point"><button type="button" class="x noprint" data-actrm="${esc(k)}|${i}" aria-label="Remove">${icon('x')}</button></li>`).join('')}</ul><button type="button" class="add-small noprint" data-actadd="${esc(k)}">${icon('plus')}Point</button></td>`;
        const dateCell = `<th class="rowhead" rowspan="${rs}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</th>`;
        if (!list.length) return `<tr class="${past ? 'past' : ''} ${hol || D.dow(d) === 0 ? 'thin' : ''}">${dateCell}<td colspan="4" class="free">${hol ? esc(hol) : D.dow(d) === 0 ? 'Sunday' : 'No work planned'}</td>${fuCell}</tr>`;
        return list.map((e, i) => {
          const hi = e.key && e.people.some(pid => App.imp(e.key, pid) === 'high');
          return `<tr class="${past ? 'past' : ''}">${i === 0 ? dateCell : ''}<td class="tm">${esc(e.time)}</td><td><div class="mline" style="${typeStyle(e)}">${esc(e.work)}${e.o ? App.notesHtml(e.o) : ''}</div></td><td>${e.people.map(x => esc(App.pname(x))).join(', ') || '–'}</td><td>${hi ? App.impBadge('high') : '<span class="muted">Normal</span>'}</td>${i === 0 ? fuCell : ''}</tr>`;
        }).join('');
      }).join('');
      const opts = Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(x => x.group === gk).map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
      return `<section><header class="head"><div><h1>${esc(c.name)}: ${monthName(m)}</h1><p class="muted">${esc(App.GROUPS[c.group])}. ${owners.length ? 'Measured by ' + owners.map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}. Engineers: ${engHtml(c)}</p></div>
          <div class="acts noprint"><select id="co-pick" class="pick-sel" aria-label="Company">${opts}</select>${printBtn('company')}</div></header>
        ${monthTabs('company', m, { id: c.id })}
        <div class="scroll"><table class="tbl co-tbl"><thead><tr><th>Date</th><th>Time</th><th>Work and notes</th><th>Who</th><th>Priority</th><th>6 pm follow-up points</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    },
    mount(root, p) { bindFollow(root); const pick = $('#co-pick', root); if (pick) pick.onchange = () => { location.hash = link('company', { id: pick.value, m: pickMonth(p) }); }; }
  };

  /* ---------------- Meetings: a list of every meeting by date; click one to open it and change it ---------------- */
  /* Open 6 pm action points for a meeting: everything not done from before this meeting, and what was done since the previous meeting */
  function meetPoints(o) {
    const plan = Store.plan, ms = meetings().filter(m => !meetRec(m.key).cancelled), i = ms.findIndex(m => m.key === o.key);
    const prev = i > 0 ? ms[i - 1].date : plan.settings.start, out = [];
    Object.keys(plan.actions || {}).forEach(k => { const [c, d] = splitLast(k); if (d >= o.date) return;
      plan.actions[k].forEach((a, n) => { if (a.t && (!a.done || d >= prev)) out.push({ k, n, a, c, d }); }); });
    return out.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : App.cname(x.c).localeCompare(App.cname(y.c)));
  }
  const meetCommits = o => (Store.plan.commits || []).filter(c => c.occ === o.key);
  V.meetings = {
    title: 'Meetings', editing: true,
    desc: { what: 'Meetings: every meeting, date by date.',
      why: 'Click a meeting to open it. In the opened meeting: its name and day, the agenda (move items up or down; the times follow), the days each employee commits to for each work given to him, the 6 pm follow-up points to discuss, and "Meeting cancelled". The time slot of every meeting stays the same. New meetings are added from the monthly schedule ("+ Meeting"). The dates of the repeating meetings are set in Settings → Repeating work.' },
    render(p) {
      const o = p.occ && App.data.byKey[p.occ];
      if (o && o.type === 'meeting') return openMeeting(o, p);
      const list = meetings(), byM = {};
      list.forEach(m => { (byM[D.month(m.date)] = byM[D.month(m.date)] || []).push(m); });
      return `<section><header class="head"><h1>Meetings</h1>${printBtn('meetings')}</header>
        ${Object.keys(byM).map(mo => `<h2 class="group">${monthName(mo)}</h2><ul class="meet-list">${byM[mo].map(m => { const r = meetRec(m.key), ag = meetAgenda(m), cm = meetCommits(m).length;
          const st = r.cancelled ? '<span class="ml-st cancel">Cancelled</span>' : m.date === D.today() ? '<span class="ml-st today">Today</span>' : App.isPast(m.date) ? '<span class="ml-st held">Held</span>' : '';
          return `<li class="${r.cancelled ? 'cancelled' : ''} ${App.isPast(m.date) ? 'past' : ''}"><a href="${link('meetings', { occ: m.key })}"><span class="ml-d"><b>${D.day(m.date)}</b><small>${D.DAYS[D.dow(m.date)].slice(0, 3)}</small></span>
            <span class="ml-t"><b>${esc(meetTitle(m))}</b><small>${esc(D.nice(m.date, { long: true }))} · ${m.start}–${m.end} · ${ag.length} agenda item${ag.length === 1 ? '' : 's'}${cm ? ` · ${cm} commitment${cm === 1 ? '' : 's'}` : ''}</small></span>${st}<span class="ml-go">${icon('right')}</span></a></li>`; }).join('')}</ul>`).join('') || '<p class="free">No meetings in this timetable.</p>'}</section>`;
    },
    mount(root, p) {
      const o = p.occ && App.data.byKey[p.occ]; if (!o || o.type !== 'meeting') return;
      mountMeeting(root, o, p);
    }
  };
  function openMeeting(o, p) {
    const plan = Store.plan, st = plan.settings, r = meetRec(o.key), ag = meetAgenda(o), past = App.isPast(o.date);
    const tab = ['agenda', 'commit', 'fu'].includes(p.tab) ? p.tab : 'agenda', pts = meetPoints(o), cms = meetCommits(o);
    const slot = T.m(o.end) - T.m(o.start), used = ag.reduce((s, a) => s + (Number(a.minutes) || 0), 0);
    const minD = D.today() > st.start ? D.today() : st.start;
    const tabs = `<nav class="tabs mt-tabs noprint">${[['agenda', 'Agenda'], ['commit', `Commitments (${cms.length})`], ['fu', `6 pm follow-up points (${pts.filter(x => !x.a.done).length})`]].map(([k, l]) => `<a href="${link('meetings', { occ: o.key, tab: k })}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
    let body;
    if (tab === 'agenda') { let cur = T.m(o.start);
      body = `<div class="bar ${used > slot ? 'over' : ''}"><span style="width:${Math.min(100, slot ? used / slot * 100 : 0)}%"></span></div>
        <p class="small ${used > slot ? 'bad' : 'muted'}">Agenda: ${used} of ${slot} minutes${used > slot ? `, ${used - slot} too many` : ''}</p>
        <ol class="ag-edit">${ag.map((a, i) => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li data-i="${i}">
          <div class="ag-top"><span class="tm">${s}–${T.s(cur)}</span><input data-f="item" value="${esc(a.item)}" aria-label="Agenda item"><input data-f="minutes" type="number" min="0" max="240" value="${a.minutes}" aria-label="Minutes" class="min"><span class="small muted">min</span>
            <span class="ag-mv noprint"><button type="button" class="round sm" data-up ${i === 0 ? 'disabled' : ''} aria-label="Move up" title="Move up">↑</button><button type="button" class="round sm" data-down ${i === ag.length - 1 ? 'disabled' : ''} aria-label="Move down" title="Move down">↓</button></span>
            <button type="button" class="x" data-rm aria-label="Remove">${icon('x')}</button></div>
          <div class="ag-who">${App.staff().concat(plan.people.filter(x => App.isB(x.id))).map(pp => `<label class="pick sm" style="--pc:${pp.color}"><input type="checkbox" data-owner="${esc(pp.id)}" ${(a.owners || []).includes(pp.id) ? 'checked' : ''}><span>${esc(pp.id)}</span></label>`).join('')}</div></li>`; }).join('')}</ol>
        <div class="row-btns noprint"><button type="button" class="btn ghost sm" data-addi>${icon('plus')}Add item</button>${ag.length ? `<button type="button" class="btn ghost sm" data-fit>Fit to ${slot} minutes</button>` : ''}</div>`; }
    else if (tab === 'commit') {
      const staff = App.staff().filter(x => ag.some(a => (a.owners || []).includes(x.id)));
      const opt = (v, sel) => `<option value="${v}" ${String(sel) === String(v) ? 'selected' : ''}>${v === '' ? '–' : v === 0 ? '0 (same day)' : v + ' day' + (v === 1 ? '' : 's')}</option>`;
      const orphans = cms.filter(c => !ag.some(a => a.item === c.task && (a.owners || []).includes(c.pid)));
      body = `<p class="muted small">For each employee, only the work given to him in this meeting. Choose the days he commits to: 0 = to be completed the same day. Shown in fine text on Today and in the monthly schedule until the due date.</p>
        ${staff.map(x => `<div class="cm-emp" style="--pc:${x.color}"><div class="cm-who">${App.avatar(x.id, 'sm')}<b>${esc(x.name)}</b></div><table class="cm-tbl2"><tbody>${ag.filter(a => (a.owners || []).includes(x.id)).map(a => { const c = cms.find(y => y.pid === x.id && y.task === a.item);
          return `<tr><td>${esc(a.item)}</td><td><select data-cm="${esc(x.id)}" data-task="${esc(a.item)}" aria-label="Days committed">${['', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 21, 25, 30].map(v => opt(v, c ? c.days : '')).join('')}${c && ![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 21, 25, 30].includes(c.days) ? opt(c.days, c.days) : ''}</select></td><td class="small muted">${c ? 'due ' + esc(D.nice(c.due)) : ''}</td></tr>`; }).join('')}</tbody></table></div>`).join('') || '<p class="free">No work is given to any employee in the agenda yet. Tick the employees under each agenda item first.</p>'}
        ${orphans.length ? `<p class="small muted">Older commitments whose agenda item was changed: ${orphans.map(c => `${esc(App.pname(c.pid))}: ${esc(c.task)} <button type="button" class="link" data-cmrm="${esc(c.id)}">delete</button>`).join('; ')}</p>` : ''}`;
    } else body = pts.length ? `<ul class="mt-fu">${pts.map(x => `<li><label class="check"><input type="checkbox" data-actdone="${esc(x.k)}|${x.n}" ${x.a.done ? 'checked' : ''}><span class="${x.a.done ? 'struck' : ''}"><b class="co">${esc(App.cname(x.c))}</b> <small class="muted">${short(x.d)}</small> ${esc(x.a.t)}</span></label></li>`).join('')}</ul>` : '<p class="free">No 6 pm follow-up points to discuss.</p>';
    return `<section class="meet-open"><a class="back noprint" href="#/meetings">${icon('left')}All meetings</a>
      <article class="card meet ${r.cancelled ? 'cancelled' : ''}" style="--c:${App.TYPES.meeting.color}">
        <div class="mo-h"><input class="mt-title" data-mtitle value="${esc(meetTitle(o))}" aria-label="Meeting name">
          <label class="tchip cancel-t ${r.cancelled ? 'on' : ''}"><input type="checkbox" data-mcancel ${r.cancelled ? 'checked' : ''}><span>${r.cancelled ? '✕ Meeting cancelled' : 'Meeting cancelled'}</span></label></div>
        <div class="mt-when"><label>Day<input type="date" data-mdate value="${o.date}" min="${minD}" max="${st.end}" ${past ? 'disabled' : ''}></label><span class="muted">${o.start}–${o.end} (same time slot for every meeting)</span>
          ${o.extra && !past ? `<button type="button" class="btn ghost sm danger" data-mdelx>${icon('trash')}Delete this meeting</button>` : ''}</div>
        <p class="muted small">Attending: ${o.people.map(x => esc(App.pname(x))).join(', ') || 'nobody'}${o.away && o.away.length ? `. Out of station: ${o.away.map(x => esc(App.pname(x))).join(', ')}` : ''}</p>
        ${tabs}${body}</article></section>`;
  }
  function mountMeeting(root, o, p) {
    bindFollow(root);
    const key = o.key, card = $('.meet', root);
    const saveAg = (label, fn) => App.commit(label, pl => { pl.meetDays = pl.meetDays || {}; const r = pl.meetDays[key] = pl.meetDays[key] || {};
      if (!Array.isArray(r.agenda)) r.agenda = JSON.parse(JSON.stringify(meetAgenda(o))); fn(r.agenda); });
    $('[data-mtitle]', card).onchange = e => { const v = e.target.value.trim(); App.commit('Meeting name saved', pl => { pl.meetDays = pl.meetDays || {}; const r = pl.meetDays[key] = pl.meetDays[key] || {}; if (v && v !== o.title) r.title = v; else delete r.title; if (o.extra) { const x = pl.extra.find(y => 'x:' + y.id === key); if (x && v) { x.title = v; delete r.title; } } }); };
    $('[data-mcancel]', card).onchange = e => { const on = e.target.checked; App.commit(on ? `Meeting of ${D.nice(o.date)} cancelled` : `Meeting of ${D.nice(o.date)} not cancelled`, pl => { pl.meetDays = pl.meetDays || {}; const r = pl.meetDays[key] = pl.meetDays[key] || {}; if (on) r.cancelled = true; else delete r.cancelled; }); };
    const md = $('[data-mdate]', card); if (md) md.onchange = () => { if (md.value) App.moveOcc(key, md.value); };
    const dx = $('[data-mdelx]', card); if (dx) dx.onclick = () => confirmBox('Delete this meeting?', `${meetTitle(o)} on ${D.nice(o.date, { long: true })} is removed. You can undo this.`, 'Delete', () => { App.commit('Meeting deleted', pl => { pl.extra = pl.extra.filter(x => 'x:' + x.id !== key); if (pl.meetDays) delete pl.meetDays[key]; pl.commits = (pl.commits || []).filter(c => c.occ !== key); }); location.hash = '#/meetings'; }, true);
    $$('li[data-i]', card).forEach(li => {
      const i = +li.dataset.i;
      $$('[data-f]', li).forEach(inp => inp.onchange = () => { const f = inp.dataset.f, old = (meetAgenda(o)[i] || {}).item;
        saveAg('Agenda saved', ag => { ag[i][f] = f === 'minutes' ? Number(inp.value) : inp.value; });
        if (f === 'item') App.commit('Commitments follow the new name', pl => { (pl.commits || []).forEach(c => { if (c.occ === key && c.task === old) c.task = inp.value; }); }); });
      $$('[data-owner]', li).forEach(c => c.onchange = () => saveAg('Agenda saved', ag => { const s2 = new Set(ag[i].owners || []); if (c.checked) s2.add(c.dataset.owner); else s2.delete(c.dataset.owner); ag[i].owners = Store.plan.people.map(x => x.id).filter(x => s2.has(x)); }));
      $('[data-rm]', li).onclick = () => saveAg('Agenda item removed', ag => ag.splice(i, 1));
      const up = $('[data-up]', li), dn = $('[data-down]', li);
      if (up) up.onclick = () => { App.keepScroll = true; saveAg('Agenda item moved up', ag => { const [x] = ag.splice(i, 1); ag.splice(i - 1, 0, x); }); };
      if (dn) dn.onclick = () => { App.keepScroll = true; saveAg('Agenda item moved down', ag => { const [x] = ag.splice(i, 1); ag.splice(i + 1, 0, x); }); };
    });
    const ai = $('[data-addi]', card); if (ai) ai.onclick = () => saveAg('Agenda item added', ag => ag.push({ item: 'New item', minutes: 10, owners: ['B'] }));
    const fit = $('[data-fit]', card); if (fit) fit.onclick = () => saveAg('Agenda fitted', ag => {
      const slot = T.m(o.end) - T.m(o.start), tot = ag.reduce((s2, a) => s2 + (Number(a.minutes) || 0), 0) || 1;
      const raw = ag.map(a => (Number(a.minutes) || 0) / tot * slot), base = raw.map(r2 => Math.max(5, Math.floor(r2 / 5) * 5));
      let left = slot - base.reduce((s2, x) => s2 + x, 0);
      const ord = raw.map((r2, k) => [r2 - base[k], k]).sort((x, y) => y[0] - x[0]);
      for (let n = 0; left >= 5 && n < 200; n++) { base[ord[n % ord.length][1]] += 5; left -= 5; }
      for (let k = base.length - 1; left < 0 && k >= 0; k--) while (left < 0 && base[k] > 5) { base[k] -= 5; left += 5; }
      ag.forEach((a, k) => { a.minutes = base[k]; });
    });
    $$('[data-cm]', card).forEach(sel => sel.onchange = () => { const pid = sel.dataset.cm, task = sel.dataset.task, v = sel.value;
      App.keepScroll = true;
      App.commit(v === '' ? 'Commitment removed' : `${App.pname(pid)} commits ${v} day${v === '1' ? '' : 's'}: ${task}`, pl => { pl.commits = pl.commits || [];
        const c = pl.commits.find(y => y.occ === key && y.pid === pid && y.task === task);
        if (v === '') { if (c) pl.commits = pl.commits.filter(y => y !== c); return; }
        const days = Number(v), due = D.add(o.date, days);
        if (c) Object.assign(c, { days, due, start: o.date }); else pl.commits.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), occ: key, meet: o.taskId, start: o.date, pid, task, days, due });
      }); });
    $$('[data-cmrm]', card).forEach(b => b.onclick = () => App.commit('Commitment deleted', pl => { pl.commits = pl.commits.filter(x => x.id !== b.dataset.cmrm); }));
  }

  /* ---------------- Advance & billing days: everything editable, tasks point by point ---------------- */
  V.billing = {
    title: 'Billing days', editing: true,
    desc: { what: 'Billing days: the timetable of P and B on each advance and billing day, all editable.',
      why: 'Change the time and company of every row, write the tasks point by point (the earlier task text shows in grey until you type) and tick each task when done, add or remove rows, or delete a whole day (you are asked to confirm).' },
    render() {
      const plan = Store.plan, data = App.data, checks = plan.reviews.pay || {};
      const days = data.gen.occs.filter(o => o.type === 'advance' || o.type === 'billing');
      const coOpts = sel => `<option value="general" ${sel === 'general' ? 'selected' : ''}>All works</option>` + Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(c => c.group === gk).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
      return `<section><header class="head"><h1>Advance and billing days</h1>${printBtn('billing')}</header>
        ${days.map(o => {
          const rows = payRows(o), past = App.isPast(o.date), own = !!(plan.paySheets || {})[o.key];
          const done = rows.filter(r => checks[o.key + '|' + r.company]).length;
          const nm = r => esc(r.company === 'general' ? 'All works' : App.cname(r.company));
          const tasksRO = r => r.tasks.length ? `<ul class="pts-notes">${r.tasks.filter(x => x.t).map(x => `<li>${x.done ? '✓ ' : ''}${esc(x.t)}</li>`).join('')}</ul>` : `<span class="muted small">${esc(r.steps)}</span>`;
          return `<article class="card sheet ${past ? 'past' : ''}" data-o="${esc(o.key)}" style="${typeStyle(o)}"><header class="sheet-h"><div><h2>${esc(o.title)}</h2><p class="muted">${D.nice(o.date, { long: true })}. ${o.people.map(x => esc(App.pname(x))).join(' and ')}.${o.shifted ? ` Moved from ${D.nice(o.planned)}.` : ''}${past ? ' Day over.' : ''}</p></div>
              <div class="row-btns"><span class="count">${done} of ${rows.length} done</span>${!past && own ? '<button type="button" class="btn ghost sm noprint" data-preset>Back to automatic</button>' : ''}${!past ? `<button type="button" class="btn ghost sm danger noprint" data-pdel>${icon('trash')}Delete this day</button>` : ''}</div></header>
            ${past ? `<ul class="slots">${rows.map(r => { const k = o.key + '|' + r.company; return `<li class="${checks[k] ? 'done' : ''}"><span class="tm">${esc(r.text)}</span><span class="check"><span class="ro-box ${checks[k] ? 'on' : ''}">${checks[k] ? '✓' : ''}</span><b class="co">${nm(r)}</b></span>${tasksRO(r)}</li>`; }).join('')}</ul>`
            : `<div class="scroll pay-scroll"><table class="pay-tbl"><thead><tr><th>From</th><th>To</th><th>Company</th><th>Tasks, point by point</th><th>Done</th><th></th></tr></thead><tbody>${rows.map((r, i) => { const k = o.key + '|' + r.company, tasks = r.tasks.length ? r.tasks : [{ t: '', done: false }]; return `<tr data-row="${i}" data-steps="${esc(r.steps)}">
                <td><input type="time" data-pf="start" value="${esc(r.start)}" step="300" aria-label="From"></td><td><input type="time" data-pf="end" value="${esc(r.end)}" step="300" aria-label="To"></td>
                <td><select data-pf="company" aria-label="Company">${coOpts(r.company)}</select></td>
                <td><div class="ptasks">${tasks.map((tk, j) => `<div class="ptask"><input type="checkbox" data-ptd="${j}" ${tk.done ? 'checked' : ''} aria-label="Task done"><input data-pt="${j}" value="${esc(tk.t)}" placeholder="${esc(j === 0 ? r.steps : 'Next task')}" aria-label="Task"><button type="button" class="x" data-ptrm="${j}" aria-label="Remove task">${icon('x')}</button></div>`).join('')}<button type="button" class="add-small" data-ptadd>${icon('plus')}Task</button></div></td>
                <td><input type="checkbox" data-pay="${esc(k)}" ${checks[k] ? 'checked' : ''} aria-label="Company done"></td><td><button type="button" class="x" data-prm="${i}" aria-label="Remove row">${icon('x')}</button></td></tr>`; }).join('')}</tbody></table></div>
              <button type="button" class="add-small noprint" data-padd>${icon('plus')}Add row</button>`}</article>`;
        }).join('') || '<p class="free">No advance or billing days in this timetable.</p>'}</section>`;
    },
    mount(root) {
      $$('[data-pay]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.pay = r.pay || {}; if (c.checked) r.pay[c.dataset.pay] = true; else delete r.pay[c.dataset.pay]; Store.save(true); App.keepScroll = true; App.render(); });
      $$('.sheet[data-o]', root).forEach(card => {
        const key = card.dataset.o, o = App.data.byKey[key]; if (!o) return;
        const read = () => $$('tr[data-row]', card).map(tr => { const g = f => $(`[data-pf="${f}"]`, tr).value;
          const tasks = $$('.ptask', tr).map(pt => ({ t: $('[data-pt]', pt).value, done: $('[data-ptd]', pt).checked }));
          return { start: g('start'), end: g('end'), company: g('company'), steps: tr.dataset.steps, tasks: tasks.length === 1 && !tasks[0].t && !tasks[0].done ? [] : tasks }; });
        const put = (rows, label) => {
          if (rows.some(r => T.m(r.end) <= T.m(r.start))) { toast('Each row must end after it starts.'); App.render(); return; }
          App.keepScroll = true; Store.change(label, p => { p.paySheets = p.paySheets || {}; p.paySheets[key] = rows; });
        };
        $$('[data-pf], [data-pt], [data-ptd]', card).forEach(el => el.onchange = () => put(read(), `${o.title}, ${D.nice(o.date)}: saved`));
        $$('[data-ptrm]', card).forEach(b => b.onclick = () => { const tr = b.closest('tr'), i = +tr.dataset.row, rows = read(); rows[i].tasks.splice(+b.dataset.ptrm, 1); put(rows, 'Task removed'); });
        $$('[data-ptadd]', card).forEach(b => b.onclick = () => { const tr = b.closest('tr'), i = +tr.dataset.row, rows = read(); if (!rows[i].tasks.length) rows[i].tasks.push({ t: '', done: false }); rows[i].tasks.push({ t: '', done: false }); put(rows, 'Task added');
          setTimeout(() => { const t2 = $$(`.sheet[data-o="${key}"] tr[data-row="${i}"] [data-pt]`); if (t2.length) t2[t2.length - 1].focus(); }, 60); });
        $$('[data-prm]', card).forEach(b => b.onclick = () => { const rows = read(); rows.splice(+b.dataset.prm, 1); if (!rows.length) { toast('Keep at least one row, or delete the whole day.'); return; } put(rows, 'Row removed'); });
        const add = $('[data-padd]', card); if (add) add.onclick = () => { const rows = read(), last = rows[rows.length - 1], a = last ? T.m(last.end) : App.data.gen.slots[0][0];
          rows.push({ start: T.s(a), end: T.s(a + 30), company: 'general', steps: (STEPS[o.type] || []).join(', '), tasks: [] }); put(rows, 'Row added'); };
        const rs = $('[data-preset]', card); if (rs) rs.onclick = () => App.commit(`${o.title}: back to the automatic timetable`, p => { delete p.paySheets[key]; });
        const del = $('[data-pdel]', card); if (del) del.onclick = () => confirmBox(`Delete ${o.title}?`, `${o.title} on ${D.nice(o.date, { long: true })} and its whole schedule will be deleted. Are you sure? You can undo straight after.`, 'Yes, delete this day', () => App.commit(`Deleted ${o.title}, ${D.nice(o.date)}`, p => { p.overrides[key] = { deleted: true }; if (p.paySheets) delete p.paySheets[key]; }), true);
      });
    }
  };

  Object.assign(App, { meetAgenda, meetTitle, meetRec, companyEntries, monthName, listDates, pickMonth, payRows, STEPS, typeStyle, restOf, workOf });
})();
