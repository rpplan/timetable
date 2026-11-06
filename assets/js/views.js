/* View pages: Today, Week, Month, Employees, Companies (+ company monthly schedule), Meetings, Billing days.
   They only show the timetable. When App.editing is true (inside the Edit area) the same pages show inputs. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast } = UI;
  const V = App.views;
  const RANK = { high: 3, medium: 2, low: 1, '': 0 };

  /* ---------- shared bits ---------- */
  /* Links stay inside the Edit area when the page is shown there */
  const EDIT_TAB = { today: 'day', week: 'week', company: 'company', meetings: 'meetings', billing: 'billing' };
  function link(view, params) {
    if (!App.editing) return `#/${view}${params ? '?' + new URLSearchParams(params).toString() : ''}`;
    return `#/edit?${new URLSearchParams(Object.assign({ tab: EDIT_TAB[view] || App.route.params.tab || 'day' }, params || {})).toString()}`;
  }
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
  /* Every date written out: "2, 3, 4, 5 Nov" (several months: "30 Nov; 1, 2 Dec") */
  function listDates(ds) {
    const by = {}; ds.slice().sort().forEach(d => { const m = d.slice(0, 7); (by[m] = by[m] || []).push(D.day(d)); });
    return Object.keys(by).map(m => `${by[m].join(', ')} ${D.MONTHS[+m.slice(5) - 1].slice(0, 3)}`).join('; ');
  }
  App.listDates = listDates;
  function expired(date, pid) { const keep = Number(Store.plan.settings.retentionDays) || 0; return keep && !App.isB(pid) && date < D.add(D.today(), -keep); }

  /* ---------- a person's day ---------- */
  function dayList(date, pid, opts) {
    const rows = App.dayRows(date, pid);
    if (expired(date, pid)) return `<p class="free">Record deleted (older than ${Store.plan.settings.retentionDays} days)</p>`;
    if (App.onLeave(pid, date)) return `<p class="free leave-note">On leave. The work of this day is moved to the next working day.</p>`;
    if (App.isPast(date)) return pastList(date, pid, rows, opts);
    if (!rows.length) return `<p class="free">${opts && opts.free ? opts.free : 'Nothing planned'}</p>`;
    const slots = App.data.gen.slots, items = rows.slice();
    slots.forEach((sl, i) => items.push({ head: i, a: sl[0] - 0.5 }));
    items.sort((x, y) => x.a - y.a);
    const out = [], seen = new Set();
    items.forEach((r, k) => {
      if (r.head != null) {
        out.push(`<li class="slot-h">${esc(App.slotLabel(r.head))}</li>`);
        const next = items[k + 1];
        if (!next || next.head != null || next.slot !== r.head) out.push(`<li class="freeslot"><span class="tm">${T.s(slots[r.head][0])}–${T.s(slots[r.head][1])}</span><span>Free</span></li>`);
        return;
      }
      const ty = App.TYPES[r.o.type] || App.TYPES.office;
      const clash = App.data.clashKeys.has(r.o.key) && App.data.clashPD.has(pid + '|' + date);
      const firstRow = !seen.has(r.o.key); seen.add(r.o.key);
      const extras = firstRow && r.o.type !== 'review' ? `${App.impControl(r.o.key, pid)}${r.o.type !== 'meeting' ? App.clearBox(r.o.key, pid, date) : ''}` : '';
      out.push(`<li class="${clash ? 'clash' : ''} ${r.noTime ? 'notime' : ''} ${r.o.carried ? 'carried' : ''}" style="--c:${ty.color}">
          <span class="tm">${r.noTime ? 'No free slot' : `${T.s(r.a)}–${T.s(r.b)}`}</span><button type="button" class="link" data-occ="${esc(r.o.key)}" ${App.editing ? `draggable="true" data-from="${esc(pid)}"` : ''}>${esc(App.personLabel(r.o, pid))}${r.o.carried ? ` <small class="muted">(from leave ${D.nice(r.o.carriedFrom, { short: true })})</small>` : ''}</button>${r.o.status === 'done' ? '<span class="ok">Done</span>' : ''}${extras ? `<span class="row-x">${extras}</span>` : ''}</li>`);
    });
    return `<ul class="day">${out.join('')}</ul>`;
  }
  function remarkControls(k) {
    const r = Store.plan.remarks[k] || {};
    if (!App.editing) return r.s || r.t ? `<div class="rmk-ro">${r.s ? `<b>${esc(App.REMARK_LABELS[r.s])}</b>` : ''}${r.t ? ` ${esc(r.t)}` : ''}</div>` : '';
    return `<div class="rmk"><select data-rs="${esc(k)}" aria-label="Status"><option value="">Status…</option>${Object.keys(App.REMARK_LABELS).map(x => `<option value="${x}" ${r.s === x ? 'selected' : ''}>${App.REMARK_LABELS[x]}</option>`).join('')}</select>
      <input data-rt="${esc(k)}" value="${esc(r.t || '')}" placeholder="Remarks: what was done"></div>`;
  }
  function pastList(date, pid, rows, opts) {
    const seen = new Set(), entries = [];
    rows.forEach(r => { if (!seen.has(r.o.key)) { seen.add(r.o.key); entries.push(r.e); } });
    const items = entries.map(e => `<li class="past ${(Store.plan.remarks[e.key + '|' + pid] || {}).s || ''}"><span class="tm">${e.noTime ? 'No free slot' : esc(Engine.partsText(e.parts))}</span><span class="pt-l">${esc(App.personLabel(e.o, pid))}</span>${e.o.type !== 'review' ? `<span class="row-x">${App.impControl(e.key, pid)}${e.o.type !== 'meeting' ? App.clearBox(e.key, pid, date) : ''}</span>` : ''}${remarkControls(e.key + '|' + pid)}</li>`).join('');
    return `<ul class="day pastday">${items || `<li class="past"><span class="free">${opts && opts.free ? opts.free : 'Nothing planned'}</span></li>`}
      ${App.editing || remarkControls(`day@${date}|${pid}`) ? `<li class="past dayrmk"><span class="tm">Day remark</span>${remarkControls(`day@${date}|${pid}`)}</li>` : ''}</ul>`;
  }
  function pointsStrip() {
    return `<div class="points">${Store.plan.people.filter(x => !App.isB(x.id)).map(x => `<a href="#/employees?id=${encodeURIComponent(x.id)}" class="pt-chip" style="--pc:${x.color}">${App.avatar(x.id, 'sm')}<b>${App.points(x.id)}</b><span>points</span></a>`).join('')}</div>`;
  }
  function tripSwitch(pid, date) {
    const r = App.outstationRuns(pid).find(x => x.days.includes(date)); if (!r) return '';
    if (!App.editing) return '';
    return `<label class="trip-sw"><span class="switch"><input type="checkbox" data-trip="${esc(r.runKey)}|${esc(pid)}" ${r.going ? 'checked' : ''}><span></span></span>Goes on the outstation trip (${esc(listDates(r.days))})</label>`;
  }

  /* ---------------- Today ---------------- */
  V.today = {
    title: 'Today',
    desc: { what: 'Today: every employee\'s work for one day, slot by slot, with the day\'s meetings and B\'s daily check.',
      why: 'To see at a glance where each person is (office, site, outstation, leave) and what they do in Slot 1 and Slot 2. Pick any day with the arrows.',
      edit: 'Leave, clearance forms, 7-day targets, importance and remarks are filled in under Edit → Daily entries.' },
    render(p) {
      const plan = Store.plan, data = App.data, date = validDate(p), dt = D.parse(date);
      const hol = data.gen.hol[date], past = App.isPast(date), ed = App.editing;
      const clashes = data.iss.filter(i => i.level === 'clash' && i.date === date);
      const meetings = (data.byDate[date] || []).filter(o => o.type === 'meeting');
      const cards = plan.people.map(person => {
        const w = App.whereLabel(date, person.id);
        const off = !hol && Engine.personOff(plan, person.id, date) && !(data.gen.sched[person.id + '|' + date] || []).length;
        const leave = App.onLeave(person.id, date), canLeave = ed && !App.isB(person.id) && !past && !hol && !off && !(D.dow(date) === 0 && !(data.gen.sched[person.id + '|' + date] || []).length);
        const tg = date === D.today() && !App.isB(person.id) ? App.openTargets(person.id) : [];
        return `<article class="card person ${past ? 'past' : ''}" style="--pc:${person.color}" ${ed && !past ? `data-drop="${date}" data-person="${esc(person.id)}"` : ''}>
          <header>${App.avatar(person.id, 'lg')}<div><a href="#/employees?id=${encodeURIComponent(person.id)}" class="name">${esc(person.name)}</a><span class="where w-${w.k}">${esc(w.text)}</span></div></header>
          ${hol ? '<p class="free">Holiday</p>' : off && !past ? '<p class="free">Weekly day off (personal work)</p>' : dayList(date, person.id, { free: off ? 'Weekly day off' : 'Free all day' })}
          ${!past ? tripSwitch(person.id, date) : ''}
          ${tg.length ? `<div class="tgts"><h3>Site measurement target</h3>${tg.map(v => App.targetRow(v)).join('')}</div>` : ''}
          ${ed ? `<div class="card-foot noprint">${!hol && !past && !leave ? `<button type="button" class="add-small" data-add="${date}" data-person="${esc(person.id)}">${icon('plus')}Add work</button>` : ''}
          ${canLeave ? `<button type="button" class="add-small leave-btn ${leave ? 'on' : ''}" data-leave="${esc(person.id)}|${date}|${leave ? '0' : '1'}">${leave ? 'Cancel leave' : 'On leave'}</button>` : ''}</div>` : ''}</article>`;
      }).join('');
      const meet = meetings.map(m => {
        const t = App.task(m.taskId) || {}; let cur = T.m(m.start);
        return `<article class="card ${past ? 'past' : ''}"><h2>${esc(m.title)}</h2><p class="muted">${m.start}–${m.end}. Attending: ${m.people.map(x => esc(App.pname(x))).join(', ') || 'nobody'}${m.away && m.away.length ? `. Out of station: ${m.away.map(x => esc(App.pname(x))).join(', ')}` : ''}</p>
          <ol class="agenda">${(t.agenda || []).map(a => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li><span class="tm">${s}</span><span>${esc(a.item)}</span><span class="avs">${(a.owners || []).map(o => App.avatar(o, 'sm')).join('')}</span></li>`; }).join('')}</ol></article>`;
      }).join('');
      return `<section>
        <header class="head">
          <div class="date-big"><b>${dt.getUTCDate()}</b><span>${D.DAYS[dt.getUTCDay()]}<br>${D.MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</span></div>
          <div class="acts">${dayNav('today', date)}${printBtn('day')}</div>
        </header>
        ${pointsStrip()}
        ${hol ? `<p class="banner">Holiday: ${esc(hol)}</p>` : ''}
        ${past ? `<p class="banner past-b">This day is over. The timetable is read only${ed ? '; write the status and remarks of each work below' : ''}.</p>` : ''}
        ${clashes.length ? `<p class="banner warn">${clashes.length === 1 ? 'One person is' : clashes.length + ' bookings are'} double-booked. ${clashes.map(c => esc(c.text)).join(' ')}</p>` : ''}
        <div class="people-grid">${cards}</div>
        ${meet ? `<div class="grid2">${meet}</div>` : ''}
        ${!hol ? reviewCard(date) : ''}
      </section>`;
    },
    mount(root, p) {
      bindNav(root);
      const date = validDate(p);
      $$('[data-rv]', root).forEach(c => c.onchange = () => {
        const r = Store.plan.reviews; r.days = r.days || {}; const b = (r.days[date] = r.days[date] || {});
        if (c.checked) b[c.dataset.rv] = true; else delete b[c.dataset.rv];
        Store.save(true); App.keepScroll = true; App.render();
      });
      $$('[data-trip]', root).forEach(c => c.onchange = () => { const [rk, pid] = c.dataset.trip.split('|'); App.setAway(rk, pid, c.checked); });
    }
  };

  function reviewItems(date) {
    const plan = Store.plan, items = [];
    plan.people.filter(x => !App.isB(x.id)).forEach(person => {
      (App.data.byDate[date] || []).filter(o => o.people.includes(person.id) && o.type !== 'review').forEach(o => {
        const vs = o.siteGroup ? App.visitsFor(o, person.id) : [];
        if (vs.length) vs.forEach(v => items.push({ id: `${person.id}|${v.key}`, pid: person.id, text: `Measurement sheet of ${App.cname(v.company)} received` }));
        else if (o.siteGroup) items.push({ id: `${person.id}|${o.key}`, pid: person.id, text: 'Sheets prepared, cement calculation updated' });
        else if (o.type !== 'meeting') items.push({ id: `${person.id}|${o.key}`, pid: person.id, text: `${o.title} done` });
      });
    });
    ['Asset names recorded', 'Status of estimation, advances, billing updated', 'Credit balance sheet updated', 'Payment recommendations sent', 'Timetable updated for tomorrow', 'Clearance forms of N, R, S, P/P1 checked']
      .forEach((t, i) => items.push({ id: `B|own|${i}`, pid: 'B', text: t }));
    return items;
  }
  function reviewCard(date) {
    const items = reviewItems(date), done = ((Store.plan.reviews.days || {})[date]) || {};
    const n = items.filter(i => done[i.id]).length;
    return `<article class="card review"><h2>B's daily check <span class="count">${n} of ${items.length}</span></h2>
      <div class="bar"><span style="width:${items.length ? n / items.length * 100 : 0}%"></span></div>
      <ul class="checks">${items.map(i => `<li><label class="check">${App.avatar(i.pid, 'sm')}${App.editing ? `<input type="checkbox" data-rv="${esc(i.id)}" ${done[i.id] ? 'checked' : ''}>` : `<span class="ro-box ${done[i.id] ? 'on' : ''}">${done[i.id] ? '✓' : ''}</span>`}<span class="${done[i.id] ? 'struck' : ''}">${esc(i.text)}</span></label></li>`).join('')}</ul></article>`;
  }

  /* ---------------- Week ---------------- */
  V.week = {
    title: 'Week',
    desc: { what: 'Week: everyone against the seven days of one week.',
      why: 'To compare people side by side and spot clashes, leave, days off and outstation trips in the week.',
      edit: 'To move work to another day or hand it to another person, use Edit → Week board.' },
    render(p) {
      const plan = Store.plan, st = plan.settings, data = App.data, ed = App.editing;
      const ws = D.weekStart(p.w || validDate(p));
      const days = D.range(ws, D.add(ws, 6));
      const prev = D.add(ws, -7), next = D.add(ws, 7);
      const head = days.map(d => `<th class="${data.gen.hol[d] ? 'hol' : ''} ${d === D.today() ? 'now' : ''} ${App.isPast(d) ? 'past' : ''}"><a href="#/today?date=${d}">${D.DAYS[D.dow(d)].slice(0, 3)} <b>${D.day(d)}</b> ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</a>${data.gen.hol[d] ? `<small>${esc(data.gen.hol[d])}</small>` : ''}</th>`).join('');
      const rows = plan.people.map(person => `<tr><th class="rowhead">${App.who(person.id)}</th>${days.map(d => {
        const inWin = d >= st.start && d <= st.end, past = App.isPast(d);
        const list = inWin ? (data.gen.sched[person.id + '|' + d] || []).filter(e => e.o.type !== 'review').map(e => e.o) : [];
        const off = inWin && !list.length && Engine.personOff(plan, person.id, d) && !data.gen.hol[d];
        return `<td class="${data.gen.hol[d] ? 'hol' : ''} ${inWin ? '' : 'out'} ${past ? 'past' : ''} ${data.clashPD.has(person.id + '|' + d) ? 'clash' : ''}" ${ed && inWin && !past ? `data-drop="${d}" data-person="${esc(person.id)}"` : ''}>${off ? '<span class="offday">Day off</span>' : ''}${inWin && App.onLeave(person.id, d) ? '<span class="offday leave">On leave</span>' : ''}${list.map(o => App.pill(o, person.id)).join('')}</td>`;
      }).join('')}</tr>`).join('');
      return `<section>
        <header class="head"><h1>${ed ? 'Week board' : 'Week'}: ${listDates(days)} ${ws.slice(0, 4)}</h1>
          <div class="acts"><div class="nav-date noprint"><a class="round ${prev < D.weekStart(st.start) ? 'off' : ''}" href="${link('week', { w: prev })}" aria-label="Previous week">${icon('left')}</a>
          <a class="btn ghost" href="${link('week', { w: D.weekStart(App.defaultDate()) })}">This week</a>
          <a class="round ${next > st.end ? 'off' : ''}" href="${link('week', { w: next })}" aria-label="Next week">${icon('right')}</a></div>${printBtn('week')}</div></header>
        ${ed ? `<p class="hint">Drag work to another day to move it, or onto another person on the same day to hand it over. Click work to change its time or people. Work is fitted into ${esc(App.slotsText())}; meetings are before ${esc(T.s(App.data.gen.slots[0][0]))}.</p>` : ''}
        <div class="scroll"><table class="week"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <ul class="key">${Object.keys(App.TYPES).filter(k => k !== 'review').map(k => `<li><span style="background:${App.TYPES[k].color}"></span>${App.TYPES[k].label}</li>`).join('')}</ul>
      </section>`;
    }
  };

  /* ---------------- Month ---------------- */
  V.month = {
    title: 'Month',
    desc: { what: 'Month: everyone\'s work for the whole month, one row for every day.',
      why: 'The monthly schedule to review or print: which company each person measures on each day, office work, importance and clearance forms (✓CF).' },
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p);
      const dates = data.gen.dates.filter(d => D.month(d) === m);
      const head = plan.people.map(x => `<th>${App.who(x.id)}</th>`).join('');
      const rows = dates.map(d => {
        const hol = data.gen.hol[d], past = App.isPast(d);
        const cells = plan.people.map(x => {
          if (hol) return `<td class="hol"><span class="offday">${esc(hol)}</span></td>`;
          if (App.onLeave(x.id, d)) return '<td><span class="offday leave">On leave</span></td>';
          const list = (data.gen.sched[x.id + '|' + d] || []).filter(e => e.o.type !== 'review');
          if (!list.length) return `<td><span class="offday">${Engine.personOff(plan, x.id, d) ? 'Day off' : D.dow(d) === 0 ? 'Sunday' : 'Free'}</span></td>`;
          return `<td>${list.map(e => { const ty = App.TYPES[e.o.type] || App.TYPES.office; return `<div class="mline" style="--c:${ty.color}"><span class="tm">${esc(entryText(e))}</span> ${esc(App.personLabel(e.o, x.id))} ${App.impBadge(App.imp(e.o.key, x.id))}${!App.isB(x.id) && Store.plan.clear[e.o.key + '|' + x.id] ? ' <span class="clr-mini" title="Clearance form done">✓CF</span>' : ''}</div>`; }).join('')}</td>`;
        }).join('');
        return `<tr class="${past ? 'past' : ''} ${hol ? 'hol' : ''}"><th class="rowhead"><a href="#/today?date=${d}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</a></th>${cells}</tr>`;
      }).join('');
      return `<section><header class="head"><h1>Monthly schedule: ${monthName(m)}</h1>${printBtn('month')}</header>
        ${monthTabs('month', m)}
        <div class="scroll"><table class="week month"><thead><tr><th>Date</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }
  };

  /* ---------------- Employees ---------------- */
  V.employees = {
    title: 'Employees',
    desc: { what: 'Employees: one person\'s companies, outstation trips, 7-day targets and points, and every day of the timetable.',
      why: 'The personal schedule of N, R, S, P/P1 or B, to check, print as PDF or add to a phone calendar.' },
    render(p) {
      const plan = Store.plan, data = App.data;
      const person = App.person(p.id) || plan.people[0];
      const s = data.stats.per[person.id];
      const trips = App.outstationRuns(person.id);
      const r = plan.responsibilities[person.id] || {};
      const comps = gk => (r[gk] || []).map(c => esc(App.cname(c))).join(', ') || '–';
      return `<section style="--pc:${person.color}">
        <nav class="tabs noprint">${plan.people.map(x => `<a href="#/employees?id=${encodeURIComponent(x.id)}" class="${x.id === person.id ? 'on' : ''}" style="--pc:${x.color}">${App.avatar(x.id, 'sm')}${esc(x.name)}</a>`).join('')}</nav>
        <header class="head"><div><h1>${esc(person.name)}</h1><p class="muted">${esc(person.role || '')}${(person.offDays || []).length ? ` · Weekly day off: ${person.offDays.map(x => D.DAYS[x]).join(' and ')}` : ''}</p></div>
          <div class="acts noprint"><button type="button" class="btn ghost" id="ics">${icon('calendar')}Add to phone calendar</button>${printBtn('person')}</div></header>
        <div class="stats"><div><b>${s.daysWorked}</b><span>days with work</span></div><div><b>${s.visits}</b><span>company site days</span></div>${App.isB(person.id) ? '' : `<div><b>${App.points(person.id)}</b><span>points (site work done in time)</span></div>`}</div>
        <article class="card"><h2>Companies</h2><dl class="dl"><dt>Main contractors</dt><dd>${comps('main')}</dd><dt>Outstation sites</dt><dd>${comps('outstation')}</dd><dt>Other contractors</dt><dd>${comps('other')}</dd>${r.duties ? `<dt>Other duties</dt><dd>${esc(r.duties)}</dd>` : ''}</dl>
          ${trips.length ? `<h2 class="mt">Outstation trips</h2><ul class="trips">${trips.map(tr => `<li><span class="trip-dot ${tr.going ? 'on' : ''}"></span><div><b>${esc(listDates(tr.days))}</b><small>${tr.going ? 'Going outstation. Skips meetings on these days.' : 'Staying in town.'}</small></div></li>`).join('')}</ul>` : ''}</article>
        ${App.isB(person.id) ? '' : targetsCard(person.id)}
        <article class="card"><h2>Day by day</h2><div class="days-list">${data.gen.dates.map(d => {
          const hol = data.gen.hol[d]; const rows = App.dayRows(d, person.id);
          const off = Engine.personOff(plan, person.id, d);
          if (!rows.length && (hol || D.dow(d) === 0 || off) && !App.onLeave(person.id, d)) return `<div class="dl-row off"><div class="dd"><b>${D.day(d)}</b>${D.DAYS[D.dow(d)].slice(0, 3)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</div><p class="free">${esc(hol || (off ? 'Weekly day off' : 'Sunday'))}</p></div>`;
          return `<div class="dl-row ${App.isPast(d) ? 'past' : ''} ${data.clashPD.has(person.id + '|' + d) ? 'clash' : ''}"><div class="dd"><b>${D.day(d)}</b>${D.DAYS[D.dow(d)].slice(0, 3)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</div>${dayList(d, person.id, { free: 'Free' })}</div>`;
        }).join('')}</div></article>
      </section>`;
    },
    mount(root, p) {
      const person = App.person(p.id) || Store.plan.people[0];
      const b = $('#ics', root); if (b) b.onclick = () => {
        const evs = [];
        Object.keys(App.data.gen.sched).filter(k => k.startsWith(person.id + '|')).forEach(k => App.data.gen.sched[k].forEach(e => e.parts.forEach((pt, i) =>
          evs.push({ uid: e.key.replace(/[^a-z0-9]/gi, '') + person.id + i, date: e.date, start: T.s(pt[0]), end: T.s(pt[1]), title: App.personLabel(e.o, person.id), desc: e.o.details }))));
        IO.download(IO.ics(evs, `Timetable ${person.name}`), `timetable-${person.id}.ics`);
        toast(`Calendar file for ${person.name} downloaded. Open it on the phone to add it.`);
      };
    }
  };
  function targetsCard(pid) {
    const vs = App.data.gen.visits.filter(v => v.person === pid && !v.repeat).sort((a, b) => a.date < b.date ? -1 : 1);
    if (!vs.length) return '';
    const st = Store.plan.settings;
    return `<article class="card"><h2>Site measurement targets <span class="count">${App.points(pid)} points</span></h2>
      <p class="muted small">Each site measurement must be done within ${st.targetDays || 7} days from the start of the run. The tick box (in Edit → Daily entries) is there for ${st.targetDays || 7} days and then disappears. One tick = ${st.targetPoints || 100} points.</p>
      <div class="tgt-list">${vs.map(v => `<div class="tgt-row"><span class="dd"><b>${D.day(v.date)}</b>${D.MONTHS[D.parse(v.date).getUTCMonth()].slice(0, 3)}</span>${App.targetRow(v)}</div>`).join('')}</div></article>`;
  }

  /* ---------------- Companies ---------------- */
  V.companies = {
    title: 'Companies',
    desc: { what: 'Companies: the three groups (main contractors, outstation sites, other contractors), who measures each one, and its site days.',
      why: 'To check that every company gets its site days in its own part of the month. Click a company name for its monthly schedule with importance and 6 pm follow-up points.',
      edit: 'Site days are moved in Edit → Company schedules; who measures what is set in Edit → Who does which company.' },
    render() {
      const plan = Store.plan, data = App.data, ed = App.editing;
      const owners = c => plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      return `<section><header class="head"><h1>Companies</h1></header>
        ${Object.keys(App.GROUPS).map(gk => { const wd = Engine.windowDays(plan, gk); return `<h2 class="group">${App.GROUPS[gk]}<span class="grp-days">${wd ? 'days ' + wd.join(', ') : ''}</span></h2><div class="comp-grid">${plan.companies.filter(c => c.group === gk).map(c => {
          const vs = data.gen.visits.filter(v => v.company === c.id).sort((a, b) => a.date < b.date ? -1 : 1);
          const ow = owners(c);
          return `<article class="card comp"><h3><a href="${ed ? link('company', { id: c.id }) : `#/company?id=${encodeURIComponent(c.id)}`}">${esc(c.name)}</a></h3><p class="muted small">${ow.length ? ow.map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}${c.together && ow.length > 1 ? ', together on the same day' : ow.length > 1 ? ', on separate days' : ''}</p>
            <div class="chips">${vs.map(v => !ed || App.isPast(v.date) ? `<span class="dchip ${App.isPast(v.date) ? 'past' : ''}" style="--pc:${App.pcolor(v.person)}">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</span>` : `<button type="button" class="dchip" data-visit="${esc(v.key)}" style="--pc:${App.pcolor(v.person)}">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</button>`).join('') || '<span class="muted small">No site day in this timetable</span>'}</div></article>`;
        }).join('')}</div>`; }).join('')}</section>`;
    }
  };

  /* ---------------- Company monthly schedule ---------------- */
  function companyEntries(cid, dates) {
    const data = App.data, plan = Store.plan, set = new Set(dates), out = [];
    data.gen.visits.filter(v => v.company === cid && set.has(v.date)).forEach(v => {
      const e = (data.gen.sched[v.person + '|' + v.date] || []).find(x => x.o.runKey === v.runKey);
      out.push({ date: v.date, time: e ? entryText(e) : '', sort: e && e.parts.length ? e.parts[0][0] : 9999, work: `Site measurement ${v.cycle || ''}${v.repeat ? ' (continued)' : ''}`.trim(), type: e ? e.o.type : 'site', people: [v.person], key: e ? e.o.key : null, visit: v.key });
    });
    data.gen.occs.filter(o => set.has(o.date) && !o.siteGroup && o.type !== 'review' && (o.companies || []).includes(cid)).forEach(o => {
      let time = App.timeText(o, o.people[0]), sort = T.m(o.start);
      if (o.type === 'billing' || o.type === 'advance') { const r = Engine.slotPlan(plan, o, [], data.gen).find(x => x.company === cid); if (r) { time = r.text; sort = r.segs.length ? r.segs[0][0] : sort; } }
      out.push({ date: o.date, time, sort, work: o.title, type: o.type, people: o.people.slice(), key: o.key });
    });
    return out.sort((a, b) => a.date === b.date ? a.sort - b.sort : (a.date < b.date ? -1 : 1));
  }
  V.company = {
    title: 'Company schedule',
    desc: { what: 'Company schedule: one company\'s timetable for a month, every day listed, with importance and the 6 pm follow-up points.',
      why: 'To plan and review the work of one company, and print it as PDF.',
      edit: 'Follow-up points, importance and site days are filled in under Edit → Company schedules.' },
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p), ed = App.editing;
      const c = plan.companies.find(x => x.id === p.id) || plan.companies[0];
      const dates = data.gen.dates.filter(d => D.month(d) === m);
      const ents = companyEntries(c.id, dates), fu = plan.followups;
      const owners = plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      const rows = dates.map(d => {
        const list = ents.filter(e => e.date === d), past = App.isPast(d), hol = data.gen.hol[d];
        const k = c.id + '|' + d, rs = Math.max(1, list.length);
        const fuCell = `<td class="fu" rowspan="${rs}">${ed ? `<textarea data-fu="${esc(k)}" rows="2" placeholder="6 pm follow-up points">${esc(fu[k] || '')}</textarea>` : `<div class="fu-ro">${esc(fu[k] || '')}</div>`}</td>`;
        const dateCell = `<th class="rowhead" rowspan="${rs}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</th>`;
        if (!list.length) return `<tr class="${past ? 'past' : ''} ${hol ? 'hol' : ''}">${dateCell}<td colspan="4" class="free">${hol ? esc(hol) : D.dow(d) === 0 ? 'Sunday' : 'No work planned'}</td>${fuCell}</tr>`;
        return list.map((e, i) => {
          const lv = e.key ? e.people.reduce((best, pid) => RANK[App.imp(e.key, pid)] > RANK[best] ? App.imp(e.key, pid) : best, '') : '';
          const ty = App.TYPES[e.type] || App.TYPES.office;
          const impCell = ed && e.key && !past ? `<select class="imp-sel ${lv ? App.IMP[lv].cls : ''}" data-impall="${esc(e.key)}|${esc(e.people.join(','))}" aria-label="Importance"><option value="">–</option>${Object.keys(App.IMP).map(x => `<option value="${x}" ${lv === x ? 'selected' : ''}>${App.IMP[x].label}</option>`).join('')}</select>` : (App.impBadge(lv) || '<span class="muted">–</span>');
          const work = ed && e.visit && !past ? `<button type="button" class="link" data-visit="${esc(e.visit)}">${esc(e.work)}</button>` : esc(e.work);
          return `<tr class="${past ? 'past' : ''}">${i === 0 ? dateCell : ''}<td class="tm">${esc(e.time)}</td><td><span class="dot" style="background:${ty.color}"></span> ${work}</td><td>${e.people.map(x => esc(App.pname(x))).join(', ') || '–'}</td><td>${impCell}</td>${i === 0 ? fuCell : ''}</tr>`;
        }).join('');
      }).join('');
      const opts = Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(x => x.group === gk).map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
      return `<section><header class="head"><div><h1>${esc(c.name)}: ${monthName(m)}</h1><p class="muted">${esc(App.GROUPS[c.group])}. ${owners.length ? 'Measured by ' + owners.map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}.</p></div>
          <div class="acts noprint"><select id="co-pick" class="pick-sel" aria-label="Company">${opts}</select>${printBtn('company')}</div></header>
        ${monthTabs('company', m, { id: c.id })}
        ${ed ? '<p class="hint">Click a site measurement to move it to another day of its run. Follow-up points are saved when you leave the box.</p>' : ''}
        <div class="scroll"><table class="tbl co-tbl"><thead><tr><th>Date</th><th>Time</th><th>Work</th><th>Who</th><th>Importance</th><th>6 pm follow-up points</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    },
    mount(root, p) {
      const pick = $('#co-pick', root); if (pick) pick.onchange = () => { location.hash = link('company', { id: pick.value, m: pickMonth(p) }); };
      $$('[data-fu]', root).forEach(t => t.onchange = () => { const k = t.dataset.fu; if (t.value.trim()) Store.plan.followups[k] = t.value; else delete Store.plan.followups[k]; Store.save(true); toast('Follow-up saved.'); });
      $$('[data-impall]', root).forEach(s => s.onchange = () => {
        const raw = s.dataset.impall, i = raw.lastIndexOf('|'), key = raw.slice(0, i), ppl = raw.slice(i + 1).split(',').filter(Boolean);
        App.keepScroll = true;
        Store.change('Importance set', pl => ppl.forEach(pid => { if (s.value) pl.importance[key + '|' + pid] = s.value; else delete pl.importance[key + '|' + pid]; }));
      });
    }
  };

  /* ---------------- Meetings ---------------- */
  V.meetings = {
    title: 'Meetings',
    desc: { what: 'Meetings: the joint meetings with their dates, who attends and the agenda with minutes for each item.',
      why: 'To come prepared: each item shows who is responsible. People who are out of station that day do not attend.',
      edit: 'Agendas are changed in Edit → Meeting agendas.' },
    render() {
      const plan = Store.plan, data = App.data, ed = App.editing;
      return `<section><header class="head"><h1>${ed ? 'Meeting agendas' : 'Meetings'}</h1>${printBtn('meetings')}</header>
        <div class="grid2 meet-grid">${plan.tasks.filter(t => t.type === 'meeting').map(t => {
          const occs = data.gen.occs.filter(o => o.taskId === t.id);
          const slot = T.m(t.end) - T.m(t.start), ag = t.agenda || [], used = ag.reduce((s, a) => s + (Number(a.minutes) || 0), 0);
          let cur = T.m(t.start);
          const when = occs.map(o => `${D.nice(o.date)}${o.away && o.away.length ? ` <span class="small">(away: ${o.away.map(x => esc(App.pname(x))).join(', ')})</span>` : ''}`).join(', ') || 'no day in this timetable';
          if (!ed) return `<article class="card"><h2>${esc(t.title)}</h2><p class="muted">${t.start}–${t.end} on ${when}</p>
            <ol class="agenda">${ag.map(a => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li><span class="tm">${s}</span><span>${esc(a.item)} <small class="muted">${a.minutes} min</small></span><span class="avs">${(a.owners || []).map(o => App.avatar(o, 'sm')).join('')}</span></li>`; }).join('')}</ol>
            <p class="small ${used > slot ? 'bad' : 'muted'}">${used} of ${slot} minutes</p></article>`;
          return `<article class="card meet" data-m="${esc(t.id)}"><h2>${esc(t.title)}</h2>
            <p class="muted">${t.start}–${t.end} on ${when}</p>
            <div class="bar ${used > slot ? 'over' : ''}"><span style="width:${Math.min(100, used / slot * 100)}%"></span></div>
            <p class="small ${used > slot ? 'bad' : 'muted'}">${used} of ${slot} minutes${used > slot ? `: ${used - slot} too many` : ''}</p>
            <ol class="ag-edit">${ag.map((a, i) => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li data-i="${i}">
              <div class="ag-top"><span class="tm">${s}</span><input data-f="item" value="${esc(a.item)}" aria-label="Agenda item"><input data-f="minutes" type="number" min="0" max="240" value="${a.minutes}" aria-label="Minutes" class="min"><span class="small muted">min</span><button type="button" class="x" data-rm aria-label="Remove">${icon('x')}</button></div>
              <div class="ag-who">${plan.people.map(pp => `<label class="pick sm" style="--pc:${pp.color}"><input type="checkbox" data-owner="${esc(pp.id)}" ${(a.owners || []).includes(pp.id) ? 'checked' : ''}><span>${esc(pp.id)}</span></label>`).join('')}</div></li>`; }).join('')}</ol>
            <div class="row-btns"><button type="button" class="btn ghost sm" data-addi>${icon('plus')}Add item</button><button type="button" class="btn ghost sm" data-fit>Fit to ${slot} minutes</button></div></article>`;
        }).join('')}</div></section>`;
    },
    mount(root) {
      $$('.meet', root).forEach(card => {
        const id = card.dataset.m;
        const save = (label, fn) => App.commit(label, p => { const t = p.tasks.find(x => x.id === id); t.agenda = t.agenda || []; fn(t.agenda, t); });
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

  /* ---------------- Advance & billing days ---------------- */
  const STEPS = {
    advance: ['Measurement checking', 'Rate check', 'Linking to PO file', 'Advances filling', 'Asset codes checking', 'Emailing'],
    billing: ['Bill checking', 'Rate check', 'Formatting', 'Advances', 'Asset codes', 'Tally billing by P1', 'B checks the billing sheet']
  };
  App.STEPS = STEPS;
  V.billing = {
    title: 'Billing days',
    desc: { what: 'Billing days: the timetable of P1 and B on each advance payment day and billing day, one time slot per company.',
      why: 'So every company\'s bills and advances get their own time, and nothing is forgotten.',
      edit: 'Companies are ticked off in Edit → Billing days.' },
    render() {
      const plan = Store.plan, data = App.data, checks = plan.reviews.pay || {}, ed = App.editing;
      const days = data.gen.occs.filter(o => o.type === 'advance' || o.type === 'billing');
      return `<section><header class="head"><h1>Advance and billing days</h1>${printBtn('billing')}</header>
        ${days.map(o => {
          const rows = Engine.slotPlan(plan, o, STEPS[o.type], data.gen), past = App.isPast(o.date);
          const done = rows.filter(r => checks[o.key + '|' + r.company]).length;
          return `<article class="card sheet ${past ? 'past' : ''}"><header class="sheet-h"><div><h2>${esc(o.title)}</h2><p class="muted">${D.nice(o.date, { long: true })}, ${esc(App.timeText(o, o.people[0]))}. ${o.people.map(x => esc(App.pname(x))).join(' and ')}.${o.shifted ? ` Moved from ${D.nice(o.planned)}.` : ''}${past ? ' Day over.' : ''}</p></div><span class="count">${done} of ${rows.length}</span></header>
            <p class="muted small">${STEPS[o.type].join(', ')}.</p>
            <ul class="slots">${rows.map(r => {
              const k = o.key + '|' + r.company, nm = esc(r.company === 'general' ? 'All works' : App.cname(r.company));
              return `<li class="${checks[k] ? 'done' : ''}"><span class="tm">${esc(r.text)}</span>${ed ? `<label class="check"><input type="checkbox" data-pay="${esc(k)}" ${checks[k] ? 'checked' : ''}><span>${nm}</span></label>` : `<span class="check"><span class="ro-box ${checks[k] ? 'on' : ''}">${checks[k] ? '✓' : ''}</span><span>${nm}</span></span>`}</li>`;
            }).join('')}</ul></article>`;
        }).join('') || '<p class="free">No advance or billing days in this timetable.</p>'}</section>`;
    },
    mount(root) {
      $$('[data-pay]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.pay = r.pay || {}; if (c.checked) r.pay[c.dataset.pay] = true; else delete r.pay[c.dataset.pay]; Store.save(true); App.keepScroll = true; App.render(); });
    }
  };

  Object.assign(App, { companyEntries, monthName, listDates, pickMonth });
})();
