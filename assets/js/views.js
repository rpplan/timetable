/* The seven pages: Today, Week, People, Companies, Meetings, Billing days, Setup. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, modal, closeModal } = UI;
  const V = App.views;

  function dayNav(view, date) {
    const st = Store.plan.settings, prev = D.add(date, -1), next = D.add(date, 1);
    return `<div class="nav-date">
      <button type="button" class="round" ${prev < st.start ? 'disabled' : ''} data-gov="${view}?date=${prev}" aria-label="Previous day">${icon('left')}</button>
      <input type="date" value="${date}" min="${st.start}" max="${st.end}" data-pick="${view}" aria-label="Choose a day">
      <button type="button" class="round" ${next > st.end ? 'disabled' : ''} data-gov="${view}?date=${next}" aria-label="Next day">${icon('right')}</button></div>`;
  }
  function bindNav(root) {
    $$('[data-gov]', root).forEach(b => b.onclick = () => { const [v, q] = b.dataset.gov.split('?'); App.go(v, Object.fromEntries(new URLSearchParams(q))); });
    $$('[data-pick]', root).forEach(i => i.onchange = () => i.value && App.go(i.dataset.pick, { date: i.value }));
  }
  function validDate(p) { const st = Store.plan.settings; return p.date && p.date >= st.start && p.date <= st.end ? p.date : App.defaultDate(); }

  function dayList(date, pid, opts) {
    const rows = App.dayRows(date, pid);
    if (!rows.length) return `<p class="free">${opts && opts.free ? opts.free : 'Nothing planned'}</p>`;
    const st = Store.plan.settings;
    return `<ul class="day">${rows.map(r => r.lunch
      ? `<li class="lunch"><span class="tm">${st.lunchStart}–${st.lunchEnd}</span><span>Lunch</span></li>`
      : `<li class="${App.data.clashKeys.has(r.o.key) && App.data.clashPD.has(pid + '|' + date) ? 'clash' : ''}" style="--c:${(App.TYPES[r.o.type] || App.TYPES.office).color}">
          <span class="tm">${r.o.start}–${r.o.end}</span><button type="button" class="link" data-occ="${esc(r.o.key)}" draggable="true" data-from="${esc(pid)}">${esc(App.personLabel(r.o, pid))}</button>${r.o.status === 'done' ? '<span class="ok">Done</span>' : ''}</li>`).join('')}</ul>`;
  }

  /* ---------------- Today ---------------- */
  V.today = {
    title: 'Today',
    render(p) {
      const plan = Store.plan, data = App.data, date = validDate(p), dt = D.parse(date);
      const hol = data.gen.hol[date];
      const clashes = data.iss.filter(i => i.level === 'clash' && i.date === date);
      const meetings = (data.byDate[date] || []).filter(o => o.type === 'meeting');
      const cards = plan.people.map(person => {
        const w = App.whereLabel(date, person.id);
        return `<article class="card person" style="--pc:${person.color}" data-drop="${date}" data-person="${esc(person.id)}">
          <header>${App.avatar(person.id, 'lg')}<div><a href="#/people?id=${encodeURIComponent(person.id)}" class="name">${esc(person.name)}</a><span class="where w-${w.k}">${esc(w.text)}</span></div></header>
          ${hol ? '<p class="free">Holiday</p>' : dayList(date, person.id, { free: 'Free all day' })}
          ${!hol ? `<button type="button" class="add-small" data-add="${date}" data-person="${esc(person.id)}">${icon('plus')}Add</button>` : ''}</article>`;
      }).join('');
      const meet = meetings.map(m => {
        const t = App.task(m.taskId) || {}; let cur = T.m(m.start);
        return `<article class="card"><h2>${esc(m.title)}</h2><p class="muted">${m.start}–${m.end}. Attending: ${m.people.map(x => esc(App.pname(x))).join(', ') || 'nobody'}${m.away && m.away.length ? `. Out of station: ${m.away.map(x => esc(App.pname(x))).join(', ')}` : ''}</p>
          <ol class="agenda">${(t.agenda || []).map(a => { const s = T.s(cur); cur += Number(a.minutes) || 0; return `<li><span class="tm">${s}</span><span>${esc(a.item)}</span><span class="avs">${(a.owners || []).map(o => App.avatar(o, 'sm')).join('')}</span></li>`; }).join('')}</ol></article>`;
      }).join('');
      return `<section>
        <header class="head">
          <div class="date-big"><b>${dt.getUTCDate()}</b><span>${D.DAYS[dt.getUTCDay()]}<br>${D.MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</span></div>
          ${dayNav('today', date)}
        </header>
        ${hol ? `<p class="banner">Holiday: ${esc(hol)}</p>` : ''}
        ${clashes.length ? `<p class="banner warn">${clashes.length === 1 ? 'One person is' : clashes.length + ' bookings are'} double-booked today. ${clashes.map(c => esc(c.text)).join(' ')}</p>` : ''}
        <div class="people-grid">${cards}</div>
        ${meet ? `<div class="grid2">${meet}</div>` : ''}
        ${!hol ? reviewCard(date) : ''}
      </section>`;
    },
    mount(root, p) { bindNav(root); bindReview(root, validDate(p)); }
  };

  /* B's daily check, shown on Today */
  function reviewItems(date) {
    const plan = Store.plan, items = [];
    plan.people.filter(x => x.id !== 'B').forEach(person => {
      (App.data.byDate[date] || []).filter(o => o.people.includes(person.id) && o.type !== 'review').forEach(o => {
        const vs = o.siteGroup ? App.visitsFor(o, person.id) : [];
        if (vs.length) vs.forEach(v => items.push({ id: `${person.id}|${v.key}`, pid: person.id, text: `Measurement sheet of ${App.cname(v.company)} received` }));
        else if (o.siteGroup) items.push({ id: `${person.id}|${o.key}`, pid: person.id, text: 'Sheets prepared, cement calculation updated' });
        else if (o.type !== 'meeting') items.push({ id: `${person.id}|${o.key}`, pid: person.id, text: `${o.title} done` });
      });
    });
    ['Asset names recorded', 'Status of estimation, advances, billing updated', 'Credit balance sheet updated', 'Payment recommendations sent', 'Timetable updated for tomorrow']
      .forEach((t, i) => items.push({ id: `B|own|${i}`, pid: 'B', text: t }));
    return items;
  }
  function reviewCard(date) {
    const items = reviewItems(date), done = ((Store.plan.reviews.days || {})[date]) || {};
    const n = items.filter(i => done[i.id]).length;
    return `<article class="card review"><h2>B's daily check <span class="count">${n} of ${items.length}</span></h2>
      <div class="bar"><span style="width:${items.length ? n / items.length * 100 : 0}%"></span></div>
      <ul class="checks">${items.map(i => `<li><label class="check">${App.avatar(i.pid, 'sm')}<input type="checkbox" data-rv="${esc(i.id)}" ${done[i.id] ? 'checked' : ''}><span>${esc(i.text)}</span></label></li>`).join('')}</ul></article>`;
  }
  function bindReview(root, date) {
    $$('[data-rv]', root).forEach(c => c.onchange = () => {
      const r = Store.plan.reviews; r.days = r.days || {}; const b = (r.days[date] = r.days[date] || {});
      if (c.checked) b[c.dataset.rv] = true; else delete b[c.dataset.rv];
      Store.save(true); App.keepScroll = true; App.render();
    });
  }

  /* ---------------- Week ---------------- */
  V.week = {
    title: 'Week',
    render(p) {
      const plan = Store.plan, st = plan.settings, data = App.data;
      const ws = D.weekStart(p.w || validDate(p));
      const days = D.range(ws, D.add(ws, 6));
      const prev = D.add(ws, -7), next = D.add(ws, 7);
      const head = days.map(d => `<th class="${data.gen.hol[d] ? 'hol' : ''} ${d === D.today() ? 'now' : ''}"><a href="#/today?date=${d}">${D.DAYS[D.dow(d)].slice(0, 3)} <b>${D.day(d)}</b></a>${data.gen.hol[d] ? `<small>${esc(data.gen.hol[d])}</small>` : ''}</th>`).join('');
      const rows = plan.people.map(person => `<tr><th class="rowhead">${App.who(person.id)}</th>${days.map(d => {
        const inWin = d >= st.start && d <= st.end;
        const list = inWin ? (data.byDate[d] || []).filter(o => o.people.includes(person.id) && o.type !== 'review') : [];
        return `<td class="${data.gen.hol[d] ? 'hol' : ''} ${inWin ? '' : 'out'} ${data.clashPD.has(person.id + '|' + d) ? 'clash' : ''}" ${inWin ? `data-drop="${d}" data-person="${esc(person.id)}"` : ''}>${list.map(o => App.pill(o, person.id)).join('')}</td>`;
      }).join('')}</tr>`).join('');
      return `<section>
        <header class="head"><h1>Week of ${D.nice(ws, { short: true })}</h1>
          <div class="nav-date"><button type="button" class="round" ${D.add(ws, 6) < st.start ? '' : ''} ${prev < D.weekStart(st.start) ? 'disabled' : ''} data-gov="week?w=${prev}" aria-label="Previous week">${icon('left')}</button>
          <button type="button" class="btn ghost" data-gov="week?w=${D.weekStart(App.defaultDate())}">This week</button>
          <button type="button" class="round" ${next > st.end ? 'disabled' : ''} data-gov="week?w=${next}" aria-label="Next week">${icon('right')}</button></div></header>
        <p class="hint">Drag work to another day to move it, or onto another person on the same day to hand it over. Lunch ${st.lunchStart}–${st.lunchEnd} is kept free every day.</p>
        <div class="scroll"><table class="week"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <ul class="key">${Object.keys(App.TYPES).filter(k => k !== 'review').map(k => `<li><span style="background:${App.TYPES[k].color}"></span>${App.TYPES[k].label}</li>`).join('')}</ul>
      </section>`;
    },
    mount(root) { bindNav(root); }
  };

  /* ---------------- People ---------------- */
  V.people = {
    title: 'People',
    render(p) {
      const plan = Store.plan, data = App.data, cap = data.stats.cap;
      const person = App.person(p.id) || plan.people[0];
      const s = data.stats.per[person.id];
      const weeks = [...new Set(data.gen.dates.map(D.weekStart))], months = [...new Set(data.gen.dates.map(D.month))];
      const sumBy = f => Object.keys(s.byDate).filter(f).reduce((a, d) => a + s.byDate[d], 0);
      const trips = App.outstationRuns(person.id);
      const r = plan.responsibilities[person.id] || {};
      const comps = gk => (r[gk] || []).map(c => esc(App.cname(c))).join(', ') || '–';
      return `<section style="--pc:${person.color}">
        <nav class="tabs">${plan.people.map(x => `<a href="#/people?id=${encodeURIComponent(x.id)}" class="${x.id === person.id ? 'on' : ''}" style="--pc:${x.color}">${App.avatar(x.id, 'sm')}${esc(x.name)}</a>`).join('')}</nav>
        <header class="head"><div><h1>${esc(person.name)}</h1><p class="muted">${esc(person.role || '')}</p></div>
          <div class="acts"><button type="button" class="btn ghost" id="ics">${icon('calendar')}Add to phone calendar</button><button type="button" class="btn ghost" onclick="window.print()">${icon('print')}Print</button></div></header>
        <div class="stats"><div><b>${T.hrs(s.booked)}</b><span>hours in this timetable</span></div><div><b>${s.daysWorked}</b><span>days with work</span></div><div><b>${s.visits}</b><span>company site days</span></div></div>
        <div class="grid2">
          <article class="card"><h2>Hours</h2><table class="tbl"><thead><tr><th>Week</th><th>Hours</th></tr></thead><tbody>
            ${weeks.map(w => `<tr><td>${D.nice(w, { short: true })} – ${D.nice(D.add(w, 6), { short: true })}</td><td>${T.hrs(sumBy(d => D.weekStart(d) === w))}</td></tr>`).join('')}</tbody>
            <tfoot>${months.map(m => `<tr><th>${D.MONTHS[+m.slice(5) - 1]}</th><td>${T.hrs(sumBy(d => D.month(d) === m))}</td></tr>`).join('')}<tr><th>Total</th><td>${T.hrs(s.booked)}</td></tr></tfoot></table>
            <p class="muted small">A full office day is ${T.hrs(cap)} hours (lunch not counted).</p></article>
          <article class="card"><h2>Companies</h2><dl class="dl"><dt>Main contractors</dt><dd>${comps('main')}</dd><dt>Outstation sites</dt><dd>${comps('outstation')}</dd><dt>Other contractors</dt><dd>${comps('other')}</dd>${r.duties ? `<dt>Other duties</dt><dd>${esc(r.duties)}</dd>` : ''}</dl>
            ${trips.length ? `<h2 class="mt">Outstation trips</h2><ul class="trips">${trips.map(tr => `<li><label class="switch"><input type="checkbox" data-trip="${esc(tr.runKey)}" ${tr.going ? 'checked' : ''}><span></span></label><div><b>${D.nice(tr.days[0], { short: true })} – ${D.nice(tr.days[tr.days.length - 1], { short: true })}</b><small>${tr.going ? 'Going outstation. Skips meetings on these days.' : 'Staying in town.'}</small></div></li>`).join('')}</ul>` : ''}</article>
        </div>
        <article class="card"><h2>Day by day</h2><div class="days-list">${data.gen.dates.map(d => {
          const hol = data.gen.hol[d]; const rows = App.dayRows(d, person.id);
          if (!rows.length && (hol || D.dow(d) === 0)) return `<div class="dl-row off"><div class="dd"><b>${D.day(d)}</b>${D.DAYS[D.dow(d)].slice(0, 3)}</div><p class="free">${esc(hol || 'Sunday')}</p></div>`;
          return `<div class="dl-row ${data.clashPD.has(person.id + '|' + d) ? 'clash' : ''}"><div class="dd"><b>${D.day(d)}</b>${D.DAYS[D.dow(d)].slice(0, 3)} ${D.MONTHS[D.parse(d).getUTCMonth()].slice(0, 3)}</div>${dayList(d, person.id, { free: 'Free' })}<div class="hh">${s.byDate[d] ? T.hrs(s.byDate[d]) + ' h' : ''}</div></div>`;
        }).join('')}</div></article>
      </section>`;
    },
    mount(root, p) {
      const person = App.person(p.id) || Store.plan.people[0];
      $$('[data-trip]', root).forEach(c => c.onchange = () => App.setAway(c.dataset.trip, person.id, c.checked));
      $('#ics', root).onclick = () => {
        const evs = App.data.gen.occs.filter(o => o.people.includes(person.id)).map(o => ({ uid: o.key.replace(/[^a-z0-9]/gi, '') + person.id, date: o.date, start: o.start, end: o.end, title: App.personLabel(o, person.id), desc: o.details }));
        IO.download(IO.ics(evs, `Timetable ${person.name}`), `timetable-${person.id}.ics`);
        toast(`Calendar file for ${person.name} downloaded. Open it on the phone to add it.`);
      };
    }
  };

  /* ---------------- Companies ---------------- */
  V.companies = {
    title: 'Companies',
    render() {
      const plan = Store.plan, data = App.data;
      const owners = c => plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      return `<section><header class="head"><h1>Companies</h1></header>
        <p class="hint">Every company has its own site days. Click a date to change it.</p>
        ${Object.keys(App.GROUPS).map(gk => `<h2 class="group">${App.GROUPS[gk]}</h2><div class="comp-grid">${plan.companies.filter(c => c.group === gk).map(c => {
          const vs = data.gen.visits.filter(v => v.company === c.id).sort((a, b) => a.date < b.date ? -1 : 1);
          const ow = owners(c);
          return `<article class="card comp"><h3>${esc(c.name)}</h3><p class="muted small">${ow.length ? ow.map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}${c.together && ow.length > 1 ? ', together on the same day' : ow.length > 1 ? ', on separate days' : ''}</p>
            <div class="chips">${vs.map(v => `<button type="button" class="dchip" data-visit="${esc(v.key)}" style="--pc:${App.pcolor(v.person)}">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</button>`).join('') || '<span class="muted small">No site day in this timetable</span>'}</div></article>`;
        }).join('')}</div>`).join('')}</section>`;
    }
  };

  /* ---------------- Meetings ---------------- */
  V.meetings = {
    title: 'Meetings',
    render() {
      const plan = Store.plan, data = App.data;
      return `<section><header class="head"><h1>Meetings</h1></header>
        <p class="hint">People who are out of station that day do not attend. Tick one or more people for each agenda item.</p>
        <div class="grid2 meet-grid">${plan.tasks.filter(t => t.type === 'meeting').map(t => {
          const occs = data.gen.occs.filter(o => o.taskId === t.id);
          const slot = T.m(t.end) - T.m(t.start), ag = t.agenda || [], used = ag.reduce((s, a) => s + (Number(a.minutes) || 0), 0);
          let cur = T.m(t.start);
          return `<article class="card meet" data-m="${esc(t.id)}"><h2>${esc(t.title)}</h2>
            <p class="muted">${t.start}–${t.end} on ${occs.map(o => `<button type="button" class="link" data-occ="${esc(o.key)}">${D.nice(o.date)}</button>${o.away && o.away.length ? ` <span class="small">(away: ${o.away.map(x => esc(App.pname(x))).join(', ')})</span>` : ''}`).join(', ') || 'no day in this timetable'}</p>
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
  V.billing = {
    title: 'Billing days',
    render() {
      const plan = Store.plan, data = App.data, st = plan.settings, checks = plan.reviews.pay || {};
      const days = data.gen.occs.filter(o => o.type === 'advance' || o.type === 'billing');
      return `<section><header class="head"><h1>Advance and billing days</h1></header>
        <p class="hint">Timetable for P1 and B on each advance payment day and billing day. Tick each company when it is done.</p>
        ${days.map(o => {
          const rows = Engine.slotPlan(plan, o, STEPS[o.type]);
          const done = rows.filter(r => checks[o.key + '|' + r.company]).length;
          let lunchDone = false;
          return `<article class="card sheet"><header class="sheet-h"><div><h2>${esc(o.title)}</h2><p class="muted">${D.nice(o.date, { long: true })}, ${esc(App.timeText(o))}. ${o.people.map(x => esc(App.pname(x))).join(' and ')}.${o.shifted ? ` Moved from ${D.nice(o.planned)} (holiday).` : ''}</p></div><span class="count">${done} of ${rows.length}</span></header>
            <p class="muted small">${STEPS[o.type].join(', ')}.</p>
            <ul class="slots">${rows.map(r => {
              let pre = '';
              if (!lunchDone && T.m(r.end) > T.m(st.lunchStart) && T.m(r.start) <= T.m(st.lunchStart) + 60) { lunchDone = true; if (T.m(r.start) >= T.m(st.lunchEnd)) pre = `<li class="lunch"><span class="tm">${st.lunchStart}–${st.lunchEnd}</span><span>Lunch</span></li>`; }
              const cross = T.m(r.start) < T.m(st.lunchStart) && T.m(r.end) > T.m(st.lunchEnd);
              const k = o.key + '|' + r.company;
              return pre + `<li class="${checks[k] ? 'done' : ''}"><span class="tm">${cross ? `${r.start}–${st.lunchStart}, ${st.lunchEnd}–${r.end}` : `${r.start}–${r.end}`}</span><label class="check"><input type="checkbox" data-pay="${esc(k)}" ${checks[k] ? 'checked' : ''}><span>${esc(r.company === 'general' ? 'All works' : App.cname(r.company))}</span></label></li>`;
            }).join('')}</ul></article>`;
        }).join('') || '<p class="free">No advance or billing days in this timetable.</p>'}</section>`;
    },
    mount(root) {
      $$('[data-pay]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.pay = r.pay || {}; if (c.checked) r.pay[c.dataset.pay] = true; else delete r.pay[c.dataset.pay]; Store.save(true); App.keepScroll = true; App.render(); });
    }
  };

  /* ---------------- Setup ---------------- */
  V.setup = {
    title: 'Setup',
    render(p) {
      const plan = Store.plan, st = plan.settings, data = App.data, tab = p.tab || 'work';
      const tabs = [['work', 'Repeating work'], ['who', 'Who does which company'], ['office', 'Office hours & holidays'], ['problems', `Problems (${data.iss.filter(i => i.level !== 'info').length})`], ['share', 'Share & Excel']];
      let body = '';
      if (tab === 'work') {
        body = `<div class="row-btns"><button type="button" class="btn primary" data-task="">${icon('plus')}New repeating work</button></div>
          <ul class="tasks">${plan.tasks.map(t => `<li><button type="button" data-task="${esc(t.id)}" style="--c:${(App.TYPES[t.type] || App.TYPES.office).color}">
            <b>${esc(t.title)}</b><span>${esc(repeatText(t))}, ${t.start}–${t.end}</span><span class="avs">${Engine.normPeople(plan, t.people).map(x => App.avatar(x, 'sm')).join('')}</span></button></li>`).join('')}</ul>`;
      } else if (tab === 'who') {
        body = `<p class="hint">Tick who measures each company. A company with two people gets separate days, unless "same day" is ticked.</p>
          ${Object.keys(App.GROUPS).map(gk => `<h2 class="group">${App.GROUPS[gk]}</h2><div class="card"><table class="tbl who-tbl"><tbody>${plan.companies.filter(c => c.group === gk).map(c => `<tr><th>${esc(c.name)}</th><td>${plan.people.map(x => `<label class="pick sm" style="--pc:${x.color}"><input type="checkbox" data-resp="${esc(c.id)}|${esc(x.id)}" ${((plan.responsibilities[x.id] || {})[gk] || []).includes(c.id) ? 'checked' : ''}><span>${esc(x.id)}</span></label>`).join('')}</td><td><label class="check small"><input type="checkbox" data-tog="${esc(c.id)}" ${c.together ? 'checked' : ''}> same day</label></td></tr>`).join('')}</tbody></table></div>`).join('')}
          <h2 class="group">Names</h2><div class="card"><table class="tbl"><tbody>${plan.people.map(x => `<tr><th>${App.avatar(x.id, 'sm')}</th><td><input data-pname="${esc(x.id)}" value="${esc(x.name)}" aria-label="Name"></td><td><input data-pfull="${esc(x.id)}" value="${esc(x.fullName || '')}" placeholder="Full name" aria-label="Full name"></td></tr>`).join('')}</tbody></table></div>`;
      } else if (tab === 'office') {
        body = `<div class="grid2"><article class="card"><h2>Office hours</h2><form id="hours" class="form">
            <label>Timetable from<input type="date" name="start" value="${st.start}"></label><label>to<input type="date" name="end" value="${st.end}"></label>
            <div class="row2"><label>Office opens<input type="time" name="workStart" value="${st.workStart}"></label><label>closes<input type="time" name="workEnd" value="${st.workEnd}"></label></div>
            <div class="row2"><label>Lunch from<input type="time" name="lunchStart" value="${st.lunchStart}"></label><label>to<input type="time" name="lunchEnd" value="${st.lunchEnd}"></label></div>
            <label class="check"><input type="checkbox" name="sundayStreak" ${st.sundayStreak ? 'checked' : ''}> Work on a Sunday inside a work streak</label>
            <button class="btn primary" type="submit">Save</button></form></article>
          <article class="card"><h2>Holidays</h2><ul class="list">${plan.holidays.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(h => `<li><span>${D.nice(h.date, { long: true })}</span><b>${esc(h.name)}</b><button type="button" class="x" data-rmhol="${h.date}" aria-label="Remove">${icon('x')}</button></li>`).join('')}</ul>
            <form id="hol" class="form"><div class="row2"><label>Date<input type="date" name="date" required></label><label>Name<input name="name" value="Holiday" required></label></div><button class="btn ghost" type="submit">${icon('plus')}Add holiday</button></form></article></div>`;
      } else if (tab === 'problems') {
        const list = data.iss.filter(i => i.level !== 'info');
        body = list.length ? `<ul class="problems">${list.map(i => `<li class="${i.level}">${i.date ? `<a href="#/today?date=${i.date}">${D.nice(i.date)}</a>` : ''}<span>${esc(i.text)}</span>${(i.keys || []).slice(0, 1).map(k => `<button type="button" class="btn ghost sm" data-occ="${esc(k)}">Fix</button>`).join('')}</li>`).join('')}</ul>` : '<p class="free">No problems. Nobody is booked twice.</p>';
      } else {
        body = `<div class="grid2">
          <article class="card"><h2>Excel</h2><p class="muted">Person-wise, company-wise, meetings, advance and billing days, all with filters for sorting.</p><button type="button" class="btn primary" id="xlsx">${icon('download')}Download Excel</button></article>
          <article class="card"><h2>Share with the office</h2><p class="muted">Changes are saved in this browser. Send a link, or publish <code>plan.json</code> in the website's <code>data</code> folder so everyone starts from it.</p>
            <div class="row-btns"><button type="button" class="btn ghost" id="share">${icon('share')}Copy share link</button><button type="button" class="btn ghost" id="office">${icon('download')}Download plan.json</button></div></article>
          <article class="card"><h2>Backup</h2><div class="row-btns"><button type="button" class="btn ghost" id="bk">${icon('download')}Save backup</button><label class="btn ghost">${icon('upload')}Load backup<input type="file" id="load" accept=".json" hidden></label></div></article>
          <article class="card"><h2>Start again</h2><p class="muted">Replace all changes with the plan from the Excel sheet.</p><button type="button" class="btn ghost danger" id="reset">Start again</button></article></div>`;
      }
      return `<section><header class="head"><h1>Setup</h1></header><nav class="tabs plain">${tabs.map(([k, l]) => `<a href="#/setup?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>${body}</section>`;
    },
    mount(root) {
      const on = (sel, fn) => { const el = $(sel, root); if (el) fn(el); };
      $$('[data-resp]', root).forEach(c => c.onchange = () => { const [cid, pid] = c.dataset.resp.split('|'); const co = Store.plan.companies.find(x => x.id === cid);
        App.commit(`${co.name}: ${App.pname(pid)} ${c.checked ? 'added' : 'removed'}`, p => { const r = p.responsibilities[pid]; r[co.group] = (r[co.group] || []).filter(x => x !== cid); if (c.checked) r[co.group].push(cid); }); });
      $$('[data-tog]', root).forEach(c => c.onchange = () => App.commit('Saved', p => { p.companies.find(x => x.id === c.dataset.tog).together = c.checked; }));
      $$('[data-pname]', root).forEach(i => i.onchange = () => App.commit('Name saved', p => { p.people.find(x => x.id === i.dataset.pname).name = i.value || i.dataset.pname; }));
      $$('[data-pfull]', root).forEach(i => i.onchange = () => App.commit('Name saved', p => { p.people.find(x => x.id === i.dataset.pfull).fullName = i.value; }));
      on('#hours', f => f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f); App.commit('Office hours saved', p => Object.assign(p.settings, { start: fd.get('start'), end: fd.get('end'), workStart: fd.get('workStart'), workEnd: fd.get('workEnd'), lunchStart: fd.get('lunchStart'), lunchEnd: fd.get('lunchEnd'), sundayStreak: !!fd.get('sundayStreak') })); });
      on('#hol', f => f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f); App.commit('Holiday added', p => { p.holidays = p.holidays.filter(h => h.date !== fd.get('date')).concat({ date: fd.get('date'), name: fd.get('name') }); }); });
      $$('[data-rmhol]', root).forEach(b => b.onclick = () => App.commit('Holiday removed', p => { p.holidays = p.holidays.filter(h => h.date !== b.dataset.rmhol); }));
      on('#xlsx', b => b.onclick = exportExcel);
      on('#share', b => b.onclick = async () => { const link = await Store.shareLink(); try { await navigator.clipboard.writeText(link); toast('Link copied. Paste it in WhatsApp or email.'); } catch (e) { modal({ title: 'Share link', body: `<textarea rows="5" readonly>${esc(link)}</textarea>` }); } });
      on('#office', b => b.onclick = () => { const pl = Store.clone(Store.plan); delete pl.savedAt; IO.download(IO.json(pl), 'plan.json'); toast('plan.json downloaded. Put it in the data folder of the website.'); });
      on('#bk', b => b.onclick = () => IO.download(IO.json(Store.plan), `timetable-backup-${D.today()}.json`));
      on('#load', i => i.onchange = async () => { try { const pl = JSON.parse(await i.files[0].text()); if (!pl.tasks) throw 0; Store.replace(pl, 'Backup loaded'); } catch (e) { toast('That is not a timetable backup file.'); } });
      on('#reset', b => b.onclick = () => UI.confirmBox('Start again?', 'All changes are replaced by the plan from the Excel sheet. You can undo this.', 'Start again', () => Store.resetToExcel(), true));
    }
  };

  function repeatText(t) {
    if (t.mode === 'daily') return 'Every working day';
    if (t.mode === 'weekly') return `${t.perWeek || 1} days a week`;
    const d = (t.days || []).slice().sort((a, b) => a - b), runs = [];
    d.forEach(x => { const l = runs[runs.length - 1]; if (l && x === l[1] + 1) l[1] = x; else runs.push([x, x]); });
    return 'Dates ' + runs.map(r => r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`).join(', ');
  }

  /* ---------------- Excel ---------------- */
  function exportExcel() {
    const plan = Store.plan, data = App.compute(), st = plan.settings;
    const nm = id => App.pname(id), cn = id => App.cname(id), ty = t => (App.TYPES[t] || {}).label || t;
    const pw = [['Person', 'Date', 'Day', 'Week of', 'Month', 'Start', 'End', 'Hours', 'Work', 'Kind']];
    data.gen.dates.forEach(d => plan.people.forEach(p => App.dayRows(d, p.id).forEach(r => {
      if (r.lunch) pw.push([nm(p.id), d, D.DAYS[D.dow(d)], D.weekStart(d), D.month(d), st.lunchStart, st.lunchEnd, 0, 'Lunch', 'Lunch']);
      else pw.push([nm(p.id), d, D.DAYS[D.dow(d)], D.weekStart(d), D.month(d), r.o.start, r.o.end, +(r.o.mins / 60).toFixed(2), App.personLabel(r.o, p.id), ty(r.o.type)]);
    })));
    const weeks = [...new Set(data.gen.dates.map(D.weekStart))], months = [...new Set(data.gen.dates.map(D.month))];
    const hrs = [['Person', ...weeks.map(w => 'Week of ' + w), ...months.map(m => 'Month ' + m), 'Total hours']];
    plan.people.forEach(p => { const s = data.stats.per[p.id]; const f = fn => +(Object.keys(s.byDate).filter(fn).reduce((a, d) => a + s.byDate[d], 0) / 60).toFixed(2);
      hrs.push([nm(p.id), ...weeks.map(w => f(d => D.weekStart(d) === w)), ...months.map(m => f(d => D.month(d) === m)), +(s.booked / 60).toFixed(2)]); });
    const daily = [['Date', 'Day', ...plan.people.map(p => nm(p.id))]];
    data.gen.dates.forEach(d => daily.push([d, data.gen.hol[d] || D.DAYS[D.dow(d)], ...plan.people.map(p => App.dayRows(d, p.id).map(r => r.lunch ? `${st.lunchStart}-${st.lunchEnd} Lunch` : `${r.o.start}-${r.o.end} ${App.personLabel(r.o, p.id)}`).join(' | '))]));
    const comp = [['Company', 'Group', 'Date', 'Day', 'Person', 'Run']];
    data.gen.visits.slice().sort((a, b) => cn(a.company) === cn(b.company) ? (a.date < b.date ? -1 : 1) : (cn(a.company) < cn(b.company) ? -1 : 1))
      .forEach(v => comp.push([cn(v.company), App.GROUPS[(plan.companies.find(c => c.id === v.company) || {}).group] || '', v.date, D.DAYS[D.dow(v.date)], nm(v.person), v.cycle]));
    const meet = [['Date', 'Meeting', 'Attending', 'Out of station', 'Start', 'Agenda item', 'Minutes', 'People']];
    data.gen.occs.filter(o => o.type === 'meeting').forEach(o => { let cur = T.m(o.start); ((App.task(o.taskId) || {}).agenda || []).forEach(a => { meet.push([o.date, o.title, o.people.map(nm).join(', '), (o.away || []).map(nm).join(', '), T.s(cur), a.item, a.minutes, (a.owners || []).map(nm).join(', ')]); cur += Number(a.minutes) || 0; }); });
    const pay = [['Date', 'Kind', 'Start', 'End', 'Company', 'Steps', 'People']];
    data.gen.occs.filter(o => o.type === 'advance' || o.type === 'billing').forEach(o => Engine.slotPlan(plan, o, STEPS[o.type]).forEach(r => pay.push([o.date, o.title, r.start, r.end, r.company === 'general' ? 'All works' : cn(r.company), STEPS[o.type].join(', '), o.people.map(nm).join(', ')])));
    const sched = [['Date', 'Day', 'Start', 'End', 'Hours', 'Work', 'Kind', 'People', 'Out of station']];
    data.gen.occs.forEach(o => sched.push([o.date, D.DAYS[D.dow(o.date)], o.start, o.end, +(o.mins / 60).toFixed(2), o.title, ty(o.type), o.people.map(nm).join(', '), (o.away || []).map(nm).join(', ')]));
    IO.download(IO.xlsx([{ name: 'Person-wise', rows: pw }, { name: 'Hours', rows: hrs }, { name: 'Day grid', rows: daily }, { name: 'Company-wise', rows: comp }, { name: 'Meetings', rows: meet }, { name: 'Advance & billing', rows: pay }, { name: 'All work', rows: sched }]), `timetable-${st.start}-to-${st.end}.xlsx`);
    toast('Excel downloaded.');
  }
})();
