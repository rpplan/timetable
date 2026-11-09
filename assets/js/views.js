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
    const cm = App.commitsFor(pid, d).map(c => `<div class="fine cm">◷ ${esc(c.task || 'Commitment')} · ${c.days} day${c.days === 1 ? '' : 's'}, due ${short(c.due)}</div>`);
    const ac = App.actionsFor(d).filter(a => App.companyOwners(a.company.id).includes(pid)).map(a => `<div class="fine ac">↳ <b>${esc(a.company.name)}</b>: ${a.items.map(x => `${x.done ? '✓ ' : ''}${esc(x.t)}`).join('; ')}</div>`);
    const ed = edit && cm.length ? `<button type="button" class="ced noprint" data-cedit="${esc(pid)}|${d}" title="Edit commitments">✎ edit</button>` : '';
    return cm.join('') + ed + ac.join('');
  }
  const typeStyle = o => { const ty = App.TYPES[o.type] || App.TYPES.office; return `--c:${ty.color}`; };
  function line(e, pid) {
    return `<div class="mline" style="${typeStyle(e.o)}"><span class="tm">${esc(entryText(e))}</span> ${App.labelHtml(e.o, pid)}${App.imp(e.o.key, pid) === 'high' ? ' <b class="star" title="High priority">★</b>' : ''}${Store.plan.clear[e.key + '|' + pid] ? ' <span class="clr-mini" title="Clearance form done">✓CF</span>' : ''}${App.notesHtml(e.o)}</div>`;
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
      const meetings = (data.byDate[date] || []).filter(o => o.type === 'meeting');
      const pays = (data.byDate[date] || []).filter(o => o.type === 'advance' || o.type === 'billing');
      const meet = meetings.map(m => {
        const t = App.task(m.taskId) || {}; let cur = T.m(m.start);
        return `<article class="card ${past ? 'past' : ''}"><h2>${esc(m.title)} <a class="small noprint" href="#/meetings">change</a></h2><p class="muted">${m.start}–${m.end}. Attending: ${m.people.map(x => esc(App.pname(x))).join(', ') || 'nobody'}${m.away && m.away.length ? `. Out of station: ${m.away.map(x => esc(App.pname(x))).join(', ')}` : ''}</p>
          <ol class="agenda">${(t.agenda || []).map(a => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li><span class="tm">${s}</span><span>${esc(a.item)}</span><span class="avs">${(a.owners || []).map(o => App.avatar(o, 'sm')).join('')}</span></li>`; }).join('')}</ol></article>`;
      }).join('');
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
        ${acts.length ? `<article class="card acts-card"><h2>Action points from the 6 pm follow-up of ${esc(D.nice(acts[0].from))}</h2>${acts.map(a => `<div class="act-co"><b>${esc(a.company.name)}</b><ul>${a.items.map((x, i) => `<li><label class="check"><input type="checkbox" data-actdone="${esc(a.key)}|${Store.plan.actions[a.key].indexOf(x)}" ${x.done ? 'checked' : ''}><span class="${x.done ? 'struck' : ''}">${esc(x.t)}</span></label></li>`).join('')}</ul></div>`).join('')}</article>` : ''}
        <div class="people-grid">${App.staff().map(x => personCard(x, date, past)).join('')}</div>
        ${meet ? `<div class="grid2">${meet}</div>` : ''}
        ${payCards}
        ${followCard(date, past)}
        ${!hol && D.dow(date) !== 0 ? checkCard(date, past) : ''}
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
        e.preventDefault(); const pid = f.dataset.addtask, fd = new FormData(f), w = fd.get('w'), title = String(fd.get('t') || '').trim(); if (!title) return;
        const a = w === 'day' ? slots[0][0] : slots[+w][0], b = w === 'day' ? slots[slots.length - 1][1] : slots[+w][1];
        const x = { id: 'e' + Date.now().toString(36), title, date, start: T.s(a), end: T.s(b), type: 'office', people: [pid], companies: [], details: 'Added on the daily timetable.', importance: fd.get('hp') ? 'high' : '' };
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
    const pid = x.id, list = workOf(pid, date);
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
    return `<article class="card person tcard ${past ? 'past' : ''} ${rest ? 'resting' : ''}" style="--pc:${x.color}">
      <header>${App.avatar(pid, 'lg')}<div><a href="#/employees" class="name">${esc(x.name)}</a>${rest ? '' : `<span class="where w-${w.k}">${esc(w.text)}</span>`}</div>
        <span class="hd-chips">${workSwitch}${trip && !past && !rest ? `<label class="tchip sm ${trip.going ? 'on' : ''}" title="Goes on the outstation trip ${esc(listDates(trip.days))}"><input type="checkbox" data-trip="${esc(trip.runKey)}|${esc(pid)}" ${trip.going ? 'checked' : ''}><span>Outstation</span></label>` : ''}</span></header>
      ${body}
      ${fine ? `<div class="fines">${fine}</div>` : ''}
      ${canAdd ? `<form class="addtask noprint" data-addtask="${esc(pid)}"><input name="t" placeholder="New task for ${esc(x.name)}" aria-label="New task" required>
        <select name="w" aria-label="When">${slots.map((s, i) => `<option value="${i}">Slot ${i + 1}</option>`).join('')}<option value="day">Whole day</option></select>
        <label class="tchip sm hp-pick"><input type="checkbox" name="hp"><span>★ High</span></label><button class="btn ghost sm" type="submit">${icon('plus')}Add</button></form>` : ''}
    </article>`;
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
        <label class="fu-l">Discussion<textarea data-fu="${esc(k)}" rows="1" placeholder="What was discussed">${esc(Store.plan.followups[k] || '')}</textarea></label>
        <div class="fu-l">Action points for the next day<ul class="act-ed">${acts.map((a, i) => `<li><input data-act="${esc(k)}|${i}" value="${esc(a.t)}" placeholder="Action point"><button type="button" class="x" data-actrm="${esc(k)}|${i}" aria-label="Remove">${icon('x')}</button></li>`).join('')}</ul>
          <button type="button" class="add-small" data-actadd="${esc(k)}">${icon('plus')}Add action point</button></div></div>`; }).join('')}</div>
      <p class="muted small">Action points appear the next working day on Today, in the monthly schedule, on the Employees page, and in the next meeting of that company.</p></article>`;
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

  function checkCard(date, past) {
    const plan = Store.plan, d = ((plan.reviews.days || {})[date]) || {}, e = d.emp || {};
    const ppl = App.staff();
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

  /* ---------------- Month (with a Week tab), marks for target completion ---------------- */
  const mk = { mode: false, sel: new Set() };
  const marksOf = (pid, d) => (Store.plan.marks || []).filter(m => m.cells.some(c => c.pid === pid && c.date === d));
  function cellCls(pid, d) { const ms = marksOf(pid, d); if (!ms.length) return ''; return ms[ms.length - 1].tone === 'neg' ? 'mk-neg' : 'mk-pos'; }
  const cellTip = (pid, d) => marksOf(pid, d).map(m => `${m.tone === 'neg' ? '✗' : '✓'} ${m.text}`).join('\n');
  function cellsText(cells) { const by = {}; cells.forEach(c => { (by[c.pid] = by[c.pid] || []).push(c.date); }); return Object.keys(by).map(pid => `${App.pname(pid)}: ${listDates(by[pid])}`).join(' · '); }
  function weekHtml(p) {
    const plan = Store.plan, st = plan.settings, data = App.data, staff = App.staff();
    const ws = D.weekStart(p.w || validDate(p)), days = D.range(ws, D.add(ws, 6)), kinds = days.map(dayKind);
    const prev = D.add(ws, -7), next = D.add(ws, 7), nThin = kinds.filter(k => k.thin).length;
    const cols = `<colgroup><col class="c-name">${kinds.map(k => `<col class="${k.thin ? 'c-thin' : ''}">`).join('')}</colgroup>`;
    const head = days.map((d, i) => kinds[i].thin ? `<th class="thin" title="${esc(D.nice(d) + ': ' + kinds[i].label)}"><span class="vlabel">${D.DAYS[D.dow(d)].slice(0, 3)} ${D.day(d)} · ${esc(kinds[i].label)}</span></th>`
      : `<th class="${d === D.today() ? 'now' : ''} ${App.isPast(d) ? 'past' : ''}"><a href="#/today?date=${d}">${D.DAYS[D.dow(d)].slice(0, 3)} <b>${D.day(d)}</b> ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</a></th>`).join('');
    const rows = staff.map(x => `<tr><th class="rowhead">${App.who(x.id)}</th>${days.map((d, i) => {
      if (kinds[i].thin) return '<td class="thin"></td>';
      const rest = restOf(x.id, d); if (rest) return `<td class="off"><span>${esc(rest.replace(/^Holiday: /, ''))}</span></td>`;
      if (App.onLeave(x.id, d)) return '<td class="off leave"><span>On leave</span></td>';
      return `<td class="${App.isPast(d) ? 'past' : ''} ${data.clashPD.has(x.id + '|' + d) ? 'clash' : ''}">${workOf(x.id, d).map(e => line(e, x.id)).join('')}${fineLines(x.id, d, false)}</td>`;
    }).join('')}</tr>`).join('');
    const list = days.map((d, i) => kinds[i].thin ? `<div class="wl-thin">${esc(D.nice(d))} · ${esc(kinds[i].label)}</div>`
      : `<article class="card wl-day ${App.isPast(d) ? 'past' : ''}"><h3><a href="#/today?date=${d}">${esc(D.nice(d, { long: true }))}</a></h3>${staff.map(x => {
        const rest = restOf(x.id, d); const what = rest ? `<span class="offbar">${esc(rest)}</span>` : App.onLeave(x.id, d) ? '<span class="offbar">On leave</span>' : workOf(x.id, d).map(e => line(e, x.id)).join('') || '<span class="offday">Free</span>';
        return `<div class="wl-row">${App.avatar(x.id, 'sm')}<div class="wl-what">${what}</div></div>`; }).join('')}</article>`).join('');
    return `<header class="head"><h2 class="h1">Week: ${listDates(days)} ${ws.slice(0, 4)}</h2>
        <div class="acts"><div class="nav-date noprint"><a class="round ${prev < D.weekStart(st.start) ? 'off' : ''}" href="${link('month', { view: 'week', w: prev })}" aria-label="Previous week">${icon('left')}</a>
        <a class="btn ghost" href="${link('month', { view: 'week', w: D.weekStart(App.defaultDate()) })}">This week</a>
        <a class="round ${next > st.end ? 'off' : ''}" href="${link('month', { view: 'week', w: next })}" aria-label="Next week">${icon('right')}</a></div>${printBtn('week')}</div></header>
      <div class="scroll week-table"><table class="week" style="min-width:${120 + (7 - nThin) * 140 + nThin * 40}px">${cols}<thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="week-list">${list}</div>`;
  }
  V.month = {
    title: 'Month', editing: true,
    desc: { what: 'Month: the monthly schedule, one row for every day (or the Week tab).',
      why: 'Select any cells and mark them for target completion with a remark: positive remarks turn the cells green and give points, negative remarks turn them orange. Point at a marked cell to read the remark. ◷ lines are commitments from meetings (✎ to edit), ↳ lines are action points from the 6 pm follow-up.' },
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p), staff = App.staff();
      const tabs = `<nav class="tabs plain noprint view-tabs"><a href="${link('month', { m })}" class="${p.view !== 'week' ? 'on' : ''}">Month</a><a href="${link('month', { view: 'week', w: D.weekStart(App.defaultDate()) })}" class="${p.view === 'week' ? 'on' : ''}">Week</a></nav>`;
      if (p.view === 'week') return `<section>${tabs}${weekHtml(p)}${legend()}</section>`;
      const dates = data.gen.dates.filter(d => D.month(d) === m);
      const rows = dates.map(d => {
        const k = dayKind(d), past = App.isPast(d);
        if (k.thin) return `<tr class="thin"><th class="rowhead">${D.day(d)} ${D.DAYS[D.dow(d)].slice(0, 3)}</th><td colspan="${staff.length}">${esc(k.label)}</td></tr>`;
        return `<tr class="${past ? 'past' : ''}"><th class="rowhead"><a href="#/today?date=${d}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</a></th>${staff.map(x => {
          const ck = x.id + '|' + d, sel = mk.sel.has(ck) ? 'sel' : '', tip = cellTip(x.id, d);
          const rest = restOf(x.id, d);
          if (rest) return `<td class="off" data-cell="${ck}"><span>${esc(rest.replace(/^Holiday: /, ''))}</span></td>`;
          if (App.onLeave(x.id, d)) return `<td class="off leave" data-cell="${ck}"><span>On leave</span></td>`;
          const list = workOf(x.id, d);
          return `<td class="mc ${cellCls(x.id, d)} ${sel}" data-cell="${ck}" ${tip ? `title="${esc(tip)}"` : ''}>${list.map(e => line(e, x.id)).join('') || '<span class="offday">Free</span>'}${fineLines(x.id, d, true)}${tip ? `<div class="mk-note noprint">${esc(marksOf(x.id, d).slice(-1)[0].text)}</div>` : ''}</td>`;
        }).join('')}</tr>`;
      }).join('');
      const marks = (plan.marks || []).filter(mm => mm.cells.some(c => D.month(c.date) === m));
      return `<section>${tabs}<header class="head"><h1>Monthly schedule: ${monthName(m)}</h1>${printBtn('month')}</header>
        ${monthTabs('month', m)}
        <div class="mk-bar noprint ${mk.mode ? 'on' : ''}"><button type="button" class="btn ${mk.mode ? 'primary' : 'ghost'} sm" id="mk-mode">${mk.mode ? '✓ Selecting cells: click cells to select' : 'Select cells to mark for target completion'}</button>
          ${mk.mode ? `<span class="count">${mk.sel.size} selected</span><button type="button" class="btn primary sm" id="mk-go" ${mk.sel.size ? '' : 'disabled'}>Mark selected…</button><button type="button" class="btn ghost sm" id="mk-clear">Clear</button>` : ''}</div>
        <div class="scroll"><table class="week month ${mk.mode ? 'selecting' : ''}" id="mt"><thead><tr><th>Date</th>${staff.map(x => `<th>${App.who(x.id)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        ${legend()}
        ${marks.length ? `<article class="card"><h2>Marks this month</h2><ul class="mk-list">${marks.map(mm => `<li class="${mm.tone === 'neg' ? 'neg' : 'pos'}"><span class="mk-tone">${mm.tone === 'neg' ? 'Negative' : 'Positive'}</span><span><b>${esc(mm.text)}</b><small>${esc(cellsText(mm.cells))}</small></span><button type="button" class="btn ghost sm" data-mkedit="${esc(mm.id)}">Edit</button></li>`).join('')}</ul></article>` : ''}
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
    }
  };
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
        <label>Task<input name="task" value="${esc(c.task)}"></label><div class="row2"><label>Days committed<input type="number" name="days" min="1" max="90" value="${c.days}"></label><label>Due<input type="date" name="due" value="${c.due}"></label></div>
        <label class="check small"><input type="checkbox" name="del"> Delete this commitment</label></fieldset>`).join('')}</form>`,
      foot: '<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="submit" form="cmf" class="btn primary">Save</button>',
      onOpen: m => $('#cmf', m).onsubmit = e => { e.preventDefault(); const edits = $$('fieldset[data-cid]', m).map(f => ({ id: f.dataset.cid, task: $('[name=task]', f).value, days: Number($('[name=days]', f).value) || 1, due: $('[name=due]', f).value, del: $('[name=del]', f).checked })); closeModal();
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

  /* ---------------- Companies, with the billing Excel list and search ---------------- */
  function billSearch(q, cname) {
    const bl = Store.plan.billList; if (!bl || !q || q.trim().length < 2) return null;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean), out = [];
    bl.sheets.forEach(sh => sh.rows.forEach((r, i) => { const txt = r.join(' ').toLowerCase(); if (words.every(w => txt.includes(w))) out.push({ sheet: sh.name, row: i + 1, cells: r, mine: cname && txt.includes(cname.toLowerCase()) }); }));
    return out.sort((a, b) => (b.mine - a.mine)).slice(0, 12);
  }
  V.companies = {
    title: 'Companies', editing: true,
    desc: { what: 'Companies: the three groups, who measures each company, its engineers and site days, and the billing list.',
      why: 'Upload the latest billing Excel list once; then type a work or file name in a company\'s search box to see straight away whether it is already billed. Click a company for its monthly schedule.' },
    render() {
      const plan = Store.plan, data = App.data, bl = plan.billList;
      const owners = c => plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      return `<section><header class="head"><h1>Companies</h1></header>
        <article class="card bl-card"><h2>Billing list (Excel)</h2>
          ${bl ? `<p><b>${esc(bl.name)}</b> <span class="muted small">uploaded ${esc(D.nice(bl.at, { long: true }))} · ${bl.sheets.reduce((s, x) => s + x.rows.length, 0)} rows in ${bl.sheets.length} sheet${bl.sheets.length > 1 ? 's' : ''}</span></p>` : '<p class="muted">No billing list yet. Upload the latest billing Excel (.xlsx) or CSV file.</p>'}
          <div class="row-btns noprint"><label class="btn ${bl ? 'ghost' : 'primary'}">${icon('upload')}${bl ? 'Upload a newer list' : 'Upload billing list'}<input type="file" id="bl-file" accept=".xlsx,.csv" hidden></label>${bl ? '<button type="button" class="btn ghost danger" id="bl-rm">Remove list</button>' : ''}</div></article>
        ${Object.keys(App.GROUPS).map(gk => { const wd = Engine.windowDays(plan, gk); return `<h2 class="group">${App.GROUPS[gk]}<span class="grp-days">${wd ? 'days ' + wd.join(', ') : ''}</span></h2><div class="comp-grid">${plan.companies.filter(c => c.group === gk).map(c => {
          const vs = data.gen.visits.filter(v => v.company === c.id).sort((a, b) => a.date < b.date ? -1 : 1), ow = owners(c);
          return `<article class="card comp comp-${gk}"><h3><a href="#/company?id=${encodeURIComponent(c.id)}">${esc(c.name)}</a></h3><p class="muted small">${ow.length ? ow.filter(x => !App.isB(x.id)).map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}</p>
            ${(c.engineers || []).some(e => e.name) ? `<p class="small">Engineers: ${engHtml(c)}</p>` : ''}
            <div class="chips">${vs.map(v => `<span class="dchip ${App.isPast(v.date) ? 'past' : ''}" style="--pc:${App.pcolor(v.person)}">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</span>`).join('') || '<span class="muted small">No site day in this timetable</span>'}</div>
            ${bl ? `<input class="bl-q noprint" data-blq="${esc(c.id)}" placeholder="Is it billed? Type a work or file name" aria-label="Search the billing list"><div class="bl-res" data-blr="${esc(c.id)}"></div>` : ''}</article>`;
        }).join('')}</div>`; }).join('')}</section>`;
    },
    mount(root) {
      const f = $('#bl-file', root); if (f) f.onchange = async () => {
        const file = f.files[0]; if (!file) return;
        try {
          const sheets = await IO.readTable(file);
          const size = JSON.stringify(sheets).length;
          if (size > 900000) { toast('That file is too big to keep (more than about 900 KB of text). Remove unused sheets or columns and try again.'); return; }
          App.commit(`Billing list "${file.name}" uploaded`, p => { p.billList = { name: file.name, at: D.today(), sheets }; });
        } catch (e) { toast(e.message || 'That file could not be read.'); }
      };
      const rm = $('#bl-rm', root); if (rm) rm.onclick = () => confirmBox('Remove the billing list?', 'The uploaded list is removed. You can undo this.', 'Remove', () => App.commit('Billing list removed', p => { p.billList = null; }), true);
      $$('[data-blq]', root).forEach(i => i.oninput = () => {
        const c = Store.plan.companies.find(x => x.id === i.dataset.blq), res = $(`[data-blr="${i.dataset.blq}"]`, root), r = billSearch(i.value, c && c.name);
        if (!r) { res.innerHTML = ''; return; }
        res.innerHTML = r.length ? `<p class="bl-yes">✓ Already billed: found in ${esc(Store.plan.billList.name)}</p><ul>${r.map(x => `<li><small>${esc(x.sheet)}, row ${x.row}</small> ${x.cells.filter(Boolean).map(esc).join(' · ')}</li>`).join('')}</ul>`
          : `<p class="bl-no">Not found in ${esc(Store.plan.billList.name)}: not billed yet.</p>`;
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
      why: 'Each day\'s work with its notes, priority, and the 6 pm follow-up: the company engineers, the discussion, and the action points for the next day (written on Today).' },
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p);
      const c = plan.companies.find(x => x.id === p.id) || plan.companies[0];
      if (!c) return '<p class="free">No companies.</p>';
      const dates = data.gen.dates.filter(d => D.month(d) === m), ents = companyEntries(c.id, dates), fu = plan.followups;
      const owners = plan.people.filter(x => x.id !== 'B' && ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      const rows = dates.map(d => {
        const list = ents.filter(e => e.date === d), past = App.isPast(d), hol = data.gen.hol[d], k = c.id + '|' + d, rs = Math.max(1, list.length);
        const acts = (plan.actions[k] || []).filter(a => a.t);
        const fuCell = `<td class="fu" rowspan="${rs}">${fu[k] ? `<div class="fu-ro">${esc(fu[k])}</div>` : ''}${acts.length ? `<div class="small"><b>Action points:</b><ul class="pts-notes">${acts.map(a => `<li>${a.done ? '✓ ' : ''}${esc(a.t)}</li>`).join('')}</ul></div>` : ''}</td>`;
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
        <div class="scroll"><table class="tbl co-tbl"><thead><tr><th>Date</th><th>Time</th><th>Work and notes</th><th>Who</th><th>Priority</th><th>6 pm follow-up</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    },
    mount(root, p) { const pick = $('#co-pick', root); if (pick) pick.onchange = () => { location.hash = link('company', { id: pick.value, m: pickMonth(p) }); }; }
  };

  /* ---------------- Meetings: schedule, agenda, commitments, follow-up points ---------------- */
  V.meetings = {
    title: 'Meetings', editing: true,
    desc: { what: 'Meetings: the joint meetings, all editable.',
      why: 'Name, time, dates of the month, move or delete a meeting day, the agenda, the days each employee commits to for a task (shown in fine text on Today and in the monthly schedule), and the open action points from the 6 pm follow-ups to discuss.' },
    render(p) {
      const plan = Store.plan, data = App.data, st = plan.settings;
      const minD = D.today() > st.start ? D.today() : st.start;
      return `<section><header class="head"><h1>Meetings</h1>${printBtn('meetings')}</header>
        <div class="grid2 meet-grid">${plan.tasks.filter(t => t.type === 'meeting').map(t => {
          const occs = data.gen.occs.filter(o => o.taskId === t.id);
          const slot = T.m(t.end) - T.m(t.start), ag = t.agenda || [], used = ag.reduce((s, a) => s + (Number(a.minutes) || 0), 0);
          let cur = T.m(t.start);
          const tab = (p['t_' + t.id] || 'agenda');
          const cms = (plan.commits || []).filter(c => c.meet === t.id);
          const lastHeld = occs.filter(o => App.isPast(o.date)).map(o => o.date).pop() || st.start;
          const open = []; (t.companies || []).forEach(cid => Object.keys(plan.actions).forEach(k => { const [c, d] = k.split('|'); if (c === cid && d >= lastHeld) plan.actions[k].forEach((a, i) => { if (a.t && !a.done) open.push({ k, i, a, c, d }); }); }));
          const tabs = `<nav class="tabs plain mt-tabs noprint">${[['agenda', 'Agenda'], ['commit', `Commitments (${cms.length})`], ['fu', `Follow-up points (${open.length})`]].map(([k, l]) => `<a href="${link('meetings', Object.assign({}, p, { ['t_' + t.id]: k }))}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
          let body = '';
          if (tab === 'agenda') body = `<div class="bar ${used > slot ? 'over' : ''}"><span style="width:${Math.min(100, slot ? used / slot * 100 : 0)}%"></span></div>
            <p class="small ${used > slot ? 'bad' : 'muted'}">Agenda: ${used} of ${slot} minutes${used > slot ? `, ${used - slot} too many` : ''}</p>
            <ol class="ag-edit">${ag.map((a, i) => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li data-i="${i}">
              <div class="ag-top"><span class="tm">${s}</span><input data-f="item" value="${esc(a.item)}" aria-label="Agenda item"><input data-f="minutes" type="number" min="0" max="240" value="${a.minutes}" aria-label="Minutes" class="min"><span class="small muted">min</span><button type="button" class="x" data-rm aria-label="Remove">${icon('x')}</button></div>
              <div class="ag-who">${App.staff().concat(plan.people.filter(x => App.isB(x.id))).map(pp => `<label class="pick sm" style="--pc:${pp.color}"><input type="checkbox" data-owner="${esc(pp.id)}" ${(a.owners || []).includes(pp.id) ? 'checked' : ''}><span>${esc(pp.id)}</span></label>`).join('')}</div></li>`; }).join('')}</ol>
            <div class="row-btns noprint"><button type="button" class="btn ghost sm" data-addi>${icon('plus')}Add item</button><button type="button" class="btn ghost sm" data-fit>Fit to ${slot} minutes</button></div>`;
          else if (tab === 'commit') body = `<p class="muted small">How many days each employee commits to for a task. Shown in fine text on Today and in the monthly schedule until the due date.</p>
            <datalist id="ag-${esc(t.id)}">${ag.map(a => `<option value="${esc(a.item)}">`).join('')}</datalist>
            <div class="scroll pay-scroll"><table class="pay-tbl cm-tbl"><thead><tr><th>Meeting day</th><th>Employee</th><th>Task</th><th>Days</th><th>Due</th><th></th></tr></thead><tbody>${cms.map(c => `<tr data-cmid="${esc(c.id)}">
              <td><select data-cf2="start">${occs.map(o => `<option value="${o.date}" ${o.date === c.start ? 'selected' : ''}>${short(o.date)}</option>`).join('')}${occs.some(o => o.date === c.start) ? '' : `<option value="${c.start}" selected>${short(c.start)}</option>`}</select></td>
              <td><select data-cf2="pid">${App.staff().map(x => `<option value="${esc(x.id)}" ${x.id === c.pid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
              <td><input data-cf2="task" value="${esc(c.task)}" list="ag-${esc(t.id)}" placeholder="Task"></td><td><input type="number" min="1" max="90" data-cf2="days" value="${c.days}"></td>
              <td class="small">${short(c.due)}</td><td><button type="button" class="x" data-cmrm="${esc(c.id)}" aria-label="Delete">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div>
            <button type="button" class="add-small noprint" data-cmadd>${icon('plus')}Add commitment</button>`;
          else body = open.length ? `<ul class="mt-fu">${open.map(x => `<li><label class="check"><input type="checkbox" data-actdone="${esc(x.k)}|${x.i}"><span><b class="co">${esc(App.cname(x.c))}</b> <small class="muted">${short(x.d)}</small> ${esc(x.a.t)}</span></label></li>`).join('')}</ul>` : '<p class="free">No open action points from the 6 pm follow-ups since the last meeting.</p>';
          return `<article class="card meet" data-m="${esc(t.id)}" style="--c:${App.TYPES.meeting.color}">
            <input class="mt-title" data-mt="title" value="${esc(t.title)}" aria-label="Meeting name">
            <div class="mt-when"><label>From<input type="time" data-mt="start" value="${t.start}" step="300"></label><label>To<input type="time" data-mt="end" value="${t.end}" step="300"></label>
              <label class="mt-days">Every month on<input data-mdays value="${esc((t.days || []).join(', '))}" placeholder="e.g. 5, 24" aria-label="Dates of the month"></label></div>
            <ul class="mt-occ">${occs.map(o => App.isPast(o.date) ? `<li class="past"><span>${D.nice(o.date, { long: true })}</span><span class="muted small">held</span></li>`
              : `<li><input type="date" data-mocc="${esc(o.key)}" value="${o.date}" min="${minD}" max="${st.end}" aria-label="Meeting day"><span class="muted small">${o.away && o.away.length ? 'away: ' + o.away.map(x => esc(App.pname(x))).join(', ') : o.shifted ? 'moved from ' + short(o.planned) : ''}</span><button type="button" class="x" data-mdel="${esc(o.key)}" aria-label="Delete this meeting day">${icon('trash')}</button></li>`).join('') || '<li class="muted small">No day in this timetable</li>'}</ul>
            ${tabs}${body}</article>`;
        }).join('')}</div></section>`;
    },
    mount(root) {
      bindFollow(root);
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
        const ai = $('[data-addi]', card); if (ai) ai.onclick = () => save('Agenda item added', ag => ag.push({ item: 'New item', minutes: 10, owners: ['B'] }));
        const fit = $('[data-fit]', card); if (fit) fit.onclick = () => save('Agenda fitted', (ag, t) => {
          const slot = T.m(t.end) - T.m(t.start), tot = ag.reduce((s, a) => s + (Number(a.minutes) || 0), 0) || 1;
          const raw = ag.map(a => (Number(a.minutes) || 0) / tot * slot), base = raw.map(r => Math.max(5, Math.floor(r / 5) * 5));
          let left = slot - base.reduce((s, x) => s + x, 0);
          const ord = raw.map((r, k) => [r - base[k], k]).sort((x, y) => y[0] - x[0]);
          for (let n = 0; left >= 5 && n < 200; n++) { base[ord[n % ord.length][1]] += 5; left -= 5; }
          for (let k = base.length - 1; left < 0 && k >= 0; k--) while (left < 0 && base[k] > 5) { base[k] -= 5; left += 5; }
          ag.forEach((a, k) => { a.minutes = base[k]; });
        });
        /* commitments */
        const ca = $('[data-cmadd]', card); if (ca) ca.onclick = () => {
          const t = App.task(id), occs = App.data.gen.occs.filter(o => o.taskId === id), start = (occs.find(o => !App.isPast(o.date)) || occs[occs.length - 1] || { date: D.today() }).date;
          const owner = ((t.agenda || [])[0] || {}).owners || [];
          App.commit('Commitment added', p => { p.commits.push({ id: 'c' + Date.now().toString(36), meet: id, start, pid: (owner.find(x => x !== 'B') || App.staff()[0].id), task: ((t.agenda || [])[0] || {}).item || '', days: 3, due: D.add(start, 3) }); });
        };
        $$('tr[data-cmid]', card).forEach(tr => $$('[data-cf2]', tr).forEach(el => el.onchange = () => {
          const f = el.dataset.cf2, cid = tr.dataset.cmid;
          App.commit('Commitment saved', p => { const c = p.commits.find(x => x.id === cid); if (!c) return; c[f] = f === 'days' ? Math.max(1, Number(el.value) || 1) : el.value; c.due = D.add(c.start, c.days); });
        }));
        $$('[data-cmrm]', card).forEach(b => b.onclick = () => App.commit('Commitment deleted', p => { p.commits = p.commits.filter(x => x.id !== b.dataset.cmrm); }));
      });
    }
  };

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

  Object.assign(App, { companyEntries, monthName, listDates, pickMonth, payRows, STEPS, typeStyle, restOf, workOf });
})();
