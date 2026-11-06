/* The Edit area: every input of the website in one place. The view pages only show; everything you change here
   is used by all pages, the Link chart, the Excel download and the PDFs. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, modal, closeModal, confirmBox } = UI;
  const V = App.views;

  /* Six sections. Old addresses (#/edit?tab=billing etc.) lead to the section that now holds them. */
  const OLD = { week: 'chart', company: 'companies', billing: 'day', trips: 'day', work: 'plan', meetings: 'plan', who: 'settings', office: 'settings', records: 'settings', data: 'settings', security: 'settings' };
  const TABS = [
    ['day', 'Day', () => dayPage, { what: 'Day: the ticks and notes for one day.', why: 'Leave, outstation trip, importance, clearance forms, 7-day target ticks, billing ticks, remarks and B\'s daily check. Who works where and when is in the Link chart: add, move, hand over or copy work there.' }],
    ['companies', 'Companies', () => companiesTab, { what: 'Companies: one company at a time.', why: 'Who measures it, moving its site days, and the 6 pm follow-up points for every day of the month. Its timetable is in the Link chart and on the Companies page.' }],
    ['plan', 'Plan', () => planPage, { what: 'Plan: the work that repeats every month.', why: 'Site runs C-1, C-2, C-3, outstation trips, meetings with their agendas, billing, advances and office work.' }],
    ['settings', 'Settings', () => settingsPage, { what: 'Settings: set once, change rarely.', why: 'Hours and holidays, site windows, employees, who measures what, points and records, Excel and backup, login.' }],
    ['admin', 'B admin', () => adminPage, { what: 'B admin: B\'s private hourly schedule.', why: 'Saturday, Sunday and Monday up to 12 noon, opened with B\'s pattern.' }],
    ['problems', 'Problems', () => problemsPage, { what: 'Problems: things that need a decision.', why: 'Double bookings, work with no free slot, site days outside their window or target. Click "Fix" to open the work.' }]
  ];

  V.edit = {
    title: 'Edit', editing: true,
    render(p) {
      const want = OLD[p.tab] || p.tab;
      if (want === 'chart') { setTimeout(() => App.go('chart'), 0); return ''; }   // moving work is done in the Link chart
      const tab = TABS.find(t => t[0] === want) || TABS[0];
      const sub = tab[2]();
      const nProb = App.data.iss.filter(i => i.level !== 'info').length;
      const nav = `<nav class="tabs plain edit-tabs noprint">${TABS.filter(t => t[0] !== 'problems' || nProb || tab[0] === 'problems').map(([k, l]) => `<a href="#/edit?tab=${k}" class="${k === tab[0] ? 'on' : ''} ${k === 'problems' ? 'prob' : ''}">${esc(l)}${k === 'problems' ? ` <i class="n">${nProb}</i>` : ''}</a>`).join('')}</nav>`;
      return `${nav}${App.intro(tab[3])}${sub.render(p)}`;
    },
    mount(root, p) { const want = OLD[p.tab] || p.tab; const tab = TABS.find(t => t[0] === want) || TABS[0]; const sub = tab[2](); if (sub.mount) sub.mount(root, p); }
  };

  /* ---------- Day: one compact form per employee ---------- */
  const dayPage = {
    render(p) {
      const plan = Store.plan, data = App.data, st = plan.settings;
      const date = p.date && p.date >= st.start && p.date <= st.end ? p.date : App.defaultDate();
      const hol = data.gen.hol[date], past = App.isPast(date), today = date === D.today(), prev = D.add(date, -1), next = D.add(date, 1);
      const clashes = data.iss.filter(i => i.level === 'clash' && i.date === date);
      const cards = plan.people.map(x => personCard(x, date, hol, past, today)).join('');
      const pays = data.gen.occs.filter(o => o.date === date && (o.type === 'advance' || o.type === 'billing')).map(o => {
        const rows = Engine.slotPlan(plan, o, App.STEPS[o.type], data.gen), checks = plan.reviews.pay || {};
        return `<article class="card ed-pay"><h3>${esc(o.title)} <span class="count">${rows.filter(r => checks[o.key + '|' + r.company]).length} of ${rows.length} done</span></h3>
          <div class="chipset">${rows.map(r => { const k = o.key + '|' + r.company; return `<label class="tchip ${checks[k] ? 'on' : ''}"><input type="checkbox" data-pay="${esc(k)}" ${checks[k] ? 'checked' : ''}><span>${esc(r.company === 'general' ? 'All works' : App.cname(r.company))}</span><small>${esc(r.text)}</small></label>`; }).join('')}</div></article>`;
      }).join('');
      return `<section class="ed-day">
        <div class="ed-dayhead"><div class="nav-date"><a class="round ${prev < st.start ? 'off' : ''}" href="#/edit?tab=day&date=${prev}" aria-label="Previous day">${icon('left')}</a>
          <input type="date" value="${date}" min="${st.start}" max="${st.end}" id="ed-date" aria-label="Choose a day">
          <a class="round ${next > st.end ? 'off' : ''}" href="#/edit?tab=day&date=${next}" aria-label="Next day">${icon('right')}</a></div>
          <b class="ed-daytitle">${esc(D.nice(date, { long: true }))}${today ? ' · today' : ''}</b>
          <a class="btn ghost sm" href="#/chart">${icon('link')}Add or move work in the Link chart</a></div>
        ${hol ? `<p class="banner">Holiday: ${esc(hol)}</p>` : ''}
        ${past ? '<p class="banner past-b">This day is over: only the status and remarks can be filled in.</p>' : ''}
        ${clashes.map(c => `<p class="banner warn">${esc(c.text)}</p>`).join('')}
        <div class="ed-grid">${cards}</div>
        ${pays}
        ${!hol ? App.reviewCard(date) : ''}</section>`;
    },
    mount(root, p) {
      const st = Store.plan.settings, date = p.date && p.date >= st.start && p.date <= st.end ? p.date : App.defaultDate();
      const d = $('#ed-date', root); if (d) d.onchange = () => { if (d.value) App.go('edit', { tab: 'day', date: d.value }); };
      $$('[data-rv]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.days = r.days || {}; const b = (r.days[date] = r.days[date] || {});
        if (c.checked) b[c.dataset.rv] = true; else delete b[c.dataset.rv]; Store.save(true); App.keepScroll = true; App.render(); });
      $$('[data-pay]', root).forEach(c => c.onchange = () => { const r = Store.plan.reviews; r.pay = r.pay || {}; if (c.checked) r.pay[c.dataset.pay] = true; else delete r.pay[c.dataset.pay]; Store.save(true); App.keepScroll = true; App.render(); });
      $$('[data-trip]', root).forEach(c => c.onchange = () => { const [rk, pid] = c.dataset.trip.split('|'); App.setAway(rk, pid, c.checked); });
    }
  };
  function personCard(x, date, hol, past, today) {
    const data = App.data, pid = x.id, isB = App.isB(pid);
    const list = (data.gen.sched[pid + '|' + date] || []).filter(e => e.o.type !== 'review');
    const leave = App.onLeave(pid, date), off = Engine.personOff(Store.plan, pid, date) && !list.length;
    const w = App.whereLabel(date, pid);
    const trip = App.outstationRuns(pid).find(r => r.days.includes(date));
    const canLeave = !isB && !past && !hol && !off;
    const tg = today && !isB ? App.openTargets(pid) : [];
    const head = `<header>${App.avatar(pid)}<b>${esc(x.name)}</b>
      <span class="ed-hchips">${trip && !past ? `<label class="tchip sm ${trip.going ? 'on' : ''}" title="Goes on the outstation trip ${esc(App.listDates(trip.days))}"><input type="checkbox" data-trip="${esc(trip.runKey)}|${esc(pid)}" ${trip.going ? 'checked' : ''}><span>Outstation</span></label>` : ''}
      ${canLeave ? `<button type="button" class="tchip sm leave ${leave ? 'on' : ''}" data-leave="${esc(pid)}|${date}|${leave ? '0' : '1'}">${leave ? '✓ On leave' : 'On leave'}</button>` : ''}</span></header>`;
    let body;
    if (hol) body = '<p class="free">Holiday</p>';
    else if (leave) body = '<p class="free leave-note">On leave: this day\'s work moves to the next working day.</p>';
    else if (!list.length) body = `<p class="free">${off ? 'Weekly day off' : 'Nothing planned'}</p>`;
    else body = `<ul class="ed-rows">${list.map(e => {
      const ty = App.TYPES[e.o.type] || App.TYPES.office, k = e.key + '|' + pid, r = Store.plan.remarks[k] || {};
      const cf = !isB && e.o.type !== 'meeting' && date <= D.today();
      return `<li style="--c:${ty.color}"><div class="ed-top"><span class="ed-name">${esc(App.personLabel(e.o, pid))}</span></div>
        <div class="ed-ctl">${e.o.type !== 'meeting' ? App.impControl(e.key, pid) : ''}${cf ? `<button type="button" class="tchip sm ${Store.plan.clear[k] ? 'on' : ''}" data-cf="${esc(k)}">${Store.plan.clear[k] ? '✓ ' : ''}Clearance form</button>` : ''}</div>
        ${date <= D.today() ? `<div class="rmk"><select data-rs="${esc(k)}" aria-label="Status"><option value="">Status…</option>${Object.keys(App.REMARK_LABELS).map(s => `<option value="${s}" ${r.s === s ? 'selected' : ''}>${App.REMARK_LABELS[s]}</option>`).join('')}</select><input data-rt="${esc(k)}" value="${esc(r.t || '')}" placeholder="Remark"></div>` : ''}</li>`;
    }).join('')}</ul>`;
    const tgts = tg.length ? `<div class="ed-tg"><span class="muted small">7-day target, tick when measured in time:</span>${tg.map(v => App.targetRow(v)).join('')}</div>` : '';
    return `<article class="card ed-person ${past ? 'past' : ''}" style="--pc:${x.color}">${head}${body}${tgts}</article>`;
  }

  /* ---------- Companies: one company, with who measures it ---------- */
  const companiesTab = {
    render(p) {
      const plan = Store.plan, data = App.data, m = App.pickMonth(p);
      const c = plan.companies.find(x => x.id === p.id) || plan.companies[0];
      if (!c) return '<p class="free">No companies yet.</p>';
      const dates = data.gen.dates.filter(d => D.month(d) === m), fu = plan.followups;
      const vs = data.gen.visits.filter(v => v.company === c.id && D.month(v.date) === m).sort((a, b) => a.date < b.date ? -1 : 1);
      const opts = Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(x => x.group === gk).map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
      const months = [...new Set(data.gen.dates.map(D.month))];
      return `<section class="co-edit">
        <div class="ed-dayhead"><select id="co-pick" class="pick-sel" aria-label="Company">${opts}</select>
          <nav class="tabs plain">${months.map(x => `<a href="#/edit?tab=companies&id=${encodeURIComponent(c.id)}&m=${x}" class="${x === m ? 'on' : ''}">${App.monthName(x)}</a>`).join('')}</nav>
          <a class="btn ghost sm" href="#/company?id=${encodeURIComponent(c.id)}&m=${m}">See its timetable</a></div>
        <div class="card co-set"><div class="co-set-row"><span class="muted small">Name</span><input class="co-name" data-cname="${esc(c.id)}" value="${esc(c.name)}" aria-label="Company name"><span class="muted small">${esc(App.GROUPS[c.group])}</span></div>
          <div class="co-set-row"><span class="muted small">Measured by</span><span class="chipset">${plan.people.map(x => `<label class="pick sm" style="--pc:${x.color}"><input type="checkbox" data-resp="${esc(c.id)}|${esc(x.id)}" ${((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id) ? 'checked' : ''}><span>${esc(x.name)}</span></label>`).join('')}</span>
          <label class="check small"><input type="checkbox" data-tog="${esc(c.id)}" ${c.together ? 'checked' : ''}> together on the same day</label></div>
          <div class="co-set-row"><span class="muted small">Site days</span><span class="chipset">${vs.map(v => App.isPast(v.date) ? `<span class="dchip past" style="--pc:${App.pcolor(v.person)}">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</span>` : `<button type="button" class="dchip" data-visit="${esc(v.key)}" style="--pc:${App.pcolor(v.person)}" title="Move this site day">${App.avatar(v.person, 'xs')}${D.nice(v.date, { short: true })}</button>`).join('') || '<span class="muted small">none this month</span>'}</span></div>
          <div class="co-set-row"><button type="button" class="btn ghost sm danger" data-rmco="${esc(c.id)}">${icon('trash')}Remove company</button></div></div>
        <article class="card"><h3>6 pm follow-up points</h3><ul class="fu-list">${dates.map(d => { const k = c.id + '|' + d, hol = data.gen.hol[d];
          return `<li class="${App.isPast(d) ? 'past' : ''}"><span class="dd"><b>${D.day(d)}</b>${D.DAYS[D.dow(d)].slice(0, 3)}${hol ? ` · ${esc(hol)}` : ''}</span><textarea data-fu="${esc(k)}" rows="1" placeholder="Follow-up points">${esc(fu[k] || '')}</textarea></li>`; }).join('')}</ul></article>
      </section><form class="card form inline-add" id="addco"><b>New company</b><input name="name" placeholder="Name" required><select name="group">${Object.keys(App.GROUPS).map(g => `<option value="${g}">${App.GROUPS[g]}</option>`).join('')}</select><button class="btn ghost sm" type="submit">${icon('plus')}Add</button></form>`;
    },
    mount(root, p) {
      bindCompanyInputs(root);
      const pick = $('#co-pick', root); if (pick) pick.onchange = () => App.go('edit', { tab: 'companies', id: pick.value, m: App.pickMonth(p) });
      $$('[data-fu]', root).forEach(t => { const grow = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }; grow(); t.oninput = grow;
        t.onchange = () => { const k = t.dataset.fu; if (t.value.trim()) Store.plan.followups[k] = t.value; else delete Store.plan.followups[k]; Store.save(true); toast('Follow-up saved.'); }; });
      $('#addco', root).onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target), name = fd.get('name').trim(); if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-3);
        App.commit(`Added ${name}`, pl => { pl.companies.push({ id, name, group: fd.get('group') }); }); App.go('edit', { tab: 'companies', id }); };
    }
  };

  /* ---------- Plan: repeating work + meeting agendas ---------- */
  const planPage = {
    render(p) { return workPage.render(p) + `<h2 class="group">Meeting agendas</h2>` + V.meetings.render(p); },
    mount(root, p) { V.meetings.mount(root, p); }
  };

  /* ---------- Settings: folded sections ---------- */
  const openSet = new Set();
  const settingsPage = {
    parts: () => [
      ['hours', 'Hours, holidays & site windows', officePage],
      ['people', 'Employees: names and weekly days off', { render: () => whoPage.render().split('<!--EMP-->')[1] || '' }],
      ['who', 'Who measures which company (all companies)', { render: () => whoPage.render().split('<!--EMP-->')[0] }],
      ['records', 'Targets, points & records', recordsPage],
      ['data', 'Excel & backup', dataPage],
      ['login', 'Login & saving', securityPage]
    ],
    render(p) {
      const OPEN = { who: 'who', office: 'hours', records: 'records', data: 'data', security: 'login' };
      if (p.open) openSet.add(p.open);
      if (OPEN[p.tab]) openSet.add(OPEN[p.tab]);
      return `<section class="settings">${this.parts().map(([k, l, pg]) => `<details class="card set" data-set="${k}" ${openSet.has(k) ? 'open' : ''}><summary><b>${esc(l)}</b></summary><div class="set-body">${pg.render(p)}</div></details>`).join('')}</section>`;
    },
    mount(root, p) {
      $$('details[data-set]', root).forEach(d => d.addEventListener('toggle', () => { if (d.open) openSet.add(d.dataset.set); else openSet.delete(d.dataset.set); }));
      [officePage, recordsPage, dataPage, securityPage].forEach(pg => { if (pg.mount) pg.mount(root, p); });
      whoPage.mount(root);
    }
  };

  /* ---------- Repeating work ---------- */
  function repeatText(t) {
    if (t.mode === 'daily') return 'Every working day';
    if (t.mode === 'weekly') return `${t.perWeek || 1} days a week`;
    return 'Dates ' + (t.days || []).slice().sort((a, b) => a - b).join(', ');
  }
  const ASSIGN = { perRun: 'one company for the whole run', perDay: 'one company per day, in turn', each: 'each company on its own day' };
  const workPage = {
    render() {
      const plan = Store.plan;
      return `<section><div class="row-btns"><button type="button" class="btn primary" data-task="">${icon('plus')}New repeating work</button></div>
        <ul class="tasks">${plan.tasks.map(t => `<li><button type="button" data-task="${esc(t.id)}" style="--c:${(App.TYPES[t.type] || App.TYPES.office).color}">
          <b>${esc(t.title)}</b><span>${esc(repeatText(t))}, ${t.start}–${t.end}${t.noSite ? ' · no site work that day' : ''}${t.siteGroup ? ' · ' + ASSIGN[t.assign || 'each'] : ''}${t.importance ? ' · ' + App.IMP[t.importance].label : ''}</span><span class="avs">${Engine.normPeople(plan, t.people).map(x => App.avatar(x, 'sm')).join('')}</span></button></li>`).join('')}</ul></section>`;
    }
  };

  /* ---------- Who does which company ---------- */
  const whoPage = {
    render() {
      const plan = Store.plan;
      return `<section><p class="hint">Tick who measures each company. A company with two people gets separate days, unless "same day" is ticked.</p>
        ${Object.keys(App.GROUPS).map(gk => `<h2 class="group">${App.GROUPS[gk]}</h2><div class="card"><table class="tbl who-tbl"><tbody>${plan.companies.filter(c => c.group === gk).map(c => `<tr><th><input class="co-name" data-cname="${esc(c.id)}" value="${esc(c.name)}" aria-label="Company name"></th><td>${plan.people.map(x => `<label class="pick sm" style="--pc:${x.color}"><input type="checkbox" data-resp="${esc(c.id)}|${esc(x.id)}" ${((plan.responsibilities[x.id] || {})[gk] || []).includes(c.id) ? 'checked' : ''}><span>${esc(x.id)}</span></label>`).join('')}</td><td><label class="check small"><input type="checkbox" data-tog="${esc(c.id)}" ${c.together ? 'checked' : ''}> same day</label></td><td><button type="button" class="x" data-rmco="${esc(c.id)}" aria-label="Remove company">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>
          <form class="form inline-add" data-addco="${gk}"><input name="name" placeholder="New company name" required><button class="btn ghost sm" type="submit">${icon('plus')}Add to ${App.GROUPS[gk].toLowerCase()}</button></form></div>`).join('')}
<!--EMP--><div><table class="tbl"><tbody>${plan.people.map(x => `<tr><th>${App.avatar(x.id, 'sm')}</th><td><input data-pname="${esc(x.id)}" value="${esc(x.name)}" aria-label="Name"></td><td><input data-pfull="${esc(x.id)}" value="${esc(x.fullName || '')}" placeholder="Full name" aria-label="Full name"></td><td class="offs"><span class="small muted">Off</span>${[1, 2, 3, 4, 5, 6, 0].map(dw => `<label class="pick sm" style="--pc:${x.color}"><input type="checkbox" data-off="${esc(x.id)}|${dw}" ${(x.offDays || []).includes(dw) ? 'checked' : ''}><span>${D.DAYS[dw].slice(0, 2)}</span></label>`).join('')}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">"Off" days are weekly days off. Meetings, billing and advances on those days move to the next day the whole group works; other work goes on without that person.</p></div></section>`;
    },
    mount(root) { bindCompanyInputs(root); bindPeopleInputs(root); }
  };
  function bindCompanyInputs(root) {
      $$('[data-resp]', root).forEach(c => c.onchange = () => { const [cid, pid] = c.dataset.resp.split('|'); const co = Store.plan.companies.find(x => x.id === cid);
        App.commit(`${co.name}: ${App.pname(pid)} ${c.checked ? 'added' : 'removed'}`, p => { const r = p.responsibilities[pid]; r[co.group] = (r[co.group] || []).filter(x => x !== cid); if (c.checked) r[co.group].push(cid); }); });
      $$('[data-tog]', root).forEach(c => c.onchange = () => App.commit('Saved', p => { p.companies.find(x => x.id === c.dataset.tog).together = c.checked; }));
      $$('[data-cname]', root).forEach(i => i.onchange = () => App.commit('Company renamed', p => { p.companies.find(x => x.id === i.dataset.cname).name = i.value || i.dataset.cname; }));
      $$('[data-rmco]', root).forEach(b => b.onclick = () => { const c = Store.plan.companies.find(x => x.id === b.dataset.rmco);
        confirmBox(`Remove ${c.name}?`, 'It is taken off everyone\'s list and out of all work. You can undo this.', 'Remove', () => App.commit(`Removed ${c.name}`, p => {
          p.companies = p.companies.filter(x => x.id !== c.id);
          Object.values(p.responsibilities).forEach(r => ['main', 'outstation', 'other'].forEach(g => { r[g] = (r[g] || []).filter(x => x !== c.id); }));
          p.tasks.forEach(t => { if (t.companies) t.companies = t.companies.filter(x => x !== c.id); });
        }), true); });
      $$('[data-addco]', root).forEach(f => f.onsubmit = e => { e.preventDefault(); const name = new FormData(f).get('name').trim(); if (!name) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-3);
        App.commit(`Added ${name}`, p => { p.companies.push({ id, name, group: f.dataset.addco }); }); });
  }
  function bindPeopleInputs(root) {
      $$('[data-pname]', root).forEach(i => i.onchange = () => App.commit('Name saved', p => { p.people.find(x => x.id === i.dataset.pname).name = i.value || i.dataset.pname; }));
      $$('[data-pfull]', root).forEach(i => i.onchange = () => App.commit('Name saved', p => { p.people.find(x => x.id === i.dataset.pfull).fullName = i.value; }));
      $$('[data-off]', root).forEach(c => c.onchange = () => { const [pid, dw] = c.dataset.off.split('|');
        App.commit(`${App.pname(pid)}: ${D.DAYS[+dw]} ${c.checked ? 'off' : 'working'}`, p => { const x = p.people.find(y => y.id === pid); const s = new Set(x.offDays || []); if (c.checked) s.add(+dw); else s.delete(+dw); x.offDays = [...s]; }); });
  }

  /* ---------- Hours, holidays & site windows ---------- */
  const dayGrid = (name, sel) => `<div class="days">${Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<label><input type="checkbox" name="${name}" value="${d}" ${sel.includes(d) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>`;
  const officePage = {
    render() {
      const plan = Store.plan, st = plan.settings, w = st.windows || {};
      const outDays = Engine.windowDays(plan, 'outstation') || [];
      return `<section><div class="grid2"><article class="card"><h2>Office hours</h2><form id="hours" class="form">
          <div class="row2"><label>Timetable from<input type="date" name="start" value="${st.start}"></label><label>to<input type="date" name="end" value="${st.end}"></label></div>
          <div class="row2"><label>Slot 1 from<input type="time" name="s1a" value="${(st.slots[0] || {}).start || '10:30'}"></label><label>to<input type="time" name="s1b" value="${(st.slots[0] || {}).end || '13:30'}"></label></div>
          <div class="row2"><label>Slot 2 from<input type="time" name="s2a" value="${(st.slots[1] || {}).start || '14:30'}"></label><label>to<input type="time" name="s2b" value="${(st.slots[1] || {}).end || '19:00'}"></label></div>
          <p class="muted small">Two different works can be given in the two slots. Meetings run before Slot 1.</p>
          <label class="check"><input type="checkbox" name="sundayStreak" ${st.sundayStreak ? 'checked' : ''}> Work on a Sunday inside a work streak</label>
          <button class="btn primary" type="submit">Save</button></form></article>
        <article class="card"><h2>Holidays</h2><ul class="list">${plan.holidays.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(h => `<li><span>${D.nice(h.date, { long: true })}</span><b>${esc(h.name)}</b><button type="button" class="x" data-rmhol="${h.date}" aria-label="Remove">${icon('x')}</button></li>`).join('')}</ul>
          <form id="hol" class="form"><div class="row2"><label>Date<input type="date" name="date" required></label><label>Name<input name="name" value="Holiday" required></label></div><button class="btn ghost" type="submit">${icon('plus')}Add holiday</button></form></article></div>
        <article class="card"><h2>Site windows: days of the month for site work</h2>
          <form id="win" class="form"><fieldset><legend>Main contractors (C-1 and C-3)</legend>${dayGrid('main', w.main || [])}</fieldset>
          <fieldset><legend>Other contractors (C-2)</legend>${dayGrid('other', w.other || [])}</fieldset>
          <p class="muted small">Outstation sites: only on the dates of the outstation trips, now ${esc(outDays.join(', ') || 'none')} (change them in Repeating work). Site days outside a window are refused when you move or add work, and listed under Problems.</p>
          <button class="btn primary" type="submit">Save site windows</button></form></article></section>`;
    },
    mount(root) {
      const f = $('#hours', root); f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f);
        const s1 = { start: fd.get('s1a'), end: fd.get('s1b') }, s2 = { start: fd.get('s2a'), end: fd.get('s2b') };
        if (!(T.m(s1.start) < T.m(s1.end) && T.m(s1.end) <= T.m(s2.start) && T.m(s2.start) < T.m(s2.end))) { toast('Slot 1 must end before Slot 2 starts.'); return; }
        if (fd.get('end') < fd.get('start')) { toast('The end date must be after the start date.'); return; }
        App.commit('Office hours saved', p => Object.assign(p.settings, { start: fd.get('start'), end: fd.get('end'), slots: [s1, s2], workStart: s1.start, workEnd: s2.end, lunchStart: s1.end, lunchEnd: s2.start, sundayStreak: !!fd.get('sundayStreak') })); };
      const h = $('#hol', root); h.onsubmit = e => { e.preventDefault(); const fd = new FormData(h); App.commit('Holiday added', p => { p.holidays = p.holidays.filter(x => x.date !== fd.get('date')).concat({ date: fd.get('date'), name: fd.get('name') }); }); };
      $$('[data-rmhol]', root).forEach(b => b.onclick = () => App.commit('Holiday removed', p => { p.holidays = p.holidays.filter(x => x.date !== b.dataset.rmhol); }));
      const w = $('#win', root); w.onsubmit = e => { e.preventDefault(); const fd = new FormData(w);
        App.commit('Site windows saved', p => { p.settings.windows = { main: fd.getAll('main').map(Number), other: fd.getAll('other').map(Number) }; }); };
    }
  };

  /* ---------- Problems ---------- */
  const problemsPage = {
    render() {
      const list = App.data.iss.filter(i => i.level !== 'info'), info = App.data.iss.filter(i => i.level === 'info');
      return `<section>${list.length ? `<ul class="problems">${list.map(i => `<li class="${i.level}">${i.date ? `<a href="#/edit?tab=day&date=${i.date}">${D.nice(i.date)}</a>` : ''}<span>${esc(i.text)}</span>${(i.keys || []).slice(0, 1).map(k => App.data.byKey[k] ? `<button type="button" class="btn ghost sm" data-occ="${esc(k)}">Fix</button>` : '').join('')}</li>`).join('')}</ul>` : '<p class="free">No problems. Nobody is booked twice.</p>'}
        ${info.length ? `<details class="card mt"><summary><b>Notes</b> <span class="muted small">${info.length} moved or skipped work</span></summary><ul class="list">${info.map(i => `<li>${i.date ? `<span class="muted">${D.nice(i.date)}</span>` : ''}<span>${esc(i.text)}</span></li>`).join('')}</ul></details>` : ''}</section>`;
    }
  };

  /* ---------- Records & points ---------- */
  const recordsPage = {
    render() {
      const plan = Store.plan, st = plan.settings;
      const cnt = {
        timetable: ['remarks', 'clear', 'importance'].reduce((n, k) => n + Object.keys(plan[k]).filter(x => x.endsWith('|B')).length, 0),
        checks: Object.keys(plan.reviews.days || {}).length, pay: Object.keys(plan.reviews.pay || {}).length,
        targets: Object.keys(plan.targets).length, followups: Object.keys(plan.followups).length, admin: Object.keys(plan.admin).length
      };
      const kinds = [['timetable', 'B\'s timetable remarks, clearance and importance', cnt.timetable], ['checks', 'B\'s daily check ticks (days)', cnt.checks], ['pay', 'Advance & billing ticks', cnt.pay],
        ['targets', 'Site target ticks (points)', cnt.targets], ['followups', 'Company 6 pm follow-up points', cnt.followups], ['admin', 'B\'s admin schedule (days)', cnt.admin]];
      return `<section><div class="grid2">
        <article class="card"><h2>Automatic clean-up</h2><p class="muted">Every day, the daily records of N, R, S and P/P1 (remarks, clearance forms, importance, leave, work added by hand) older than <b>${st.retentionDays}</b> days are deleted. B's records are never deleted automatically.</p>
          <form id="ret" class="form"><div class="row2"><label>Keep daily records for (days)<input type="number" name="days" min="7" max="3650" value="${st.retentionDays}"></label><span></span></div><button type="submit" class="btn ghost">Save</button></form></article>
        <article class="card"><h2>Points</h2><p class="muted">Target for each site measurement: <b>${st.targetDays}</b> days from the start of the run. Each tick of "done in time" = <b>${st.targetPoints}</b> points.</p>
          <table class="tbl"><tbody>${plan.people.filter(x => !App.isB(x.id)).map(x => `<tr><th>${App.who(x.id)}</th><td>${App.points(x.id)}</td></tr>`).join('')}</tbody></table>
          <form id="pts" class="form"><div class="row2"><label>Target days<input type="number" name="days" min="1" max="31" value="${st.targetDays}"></label><label>Points per tick<input type="number" name="pts" min="1" max="10000" value="${st.targetPoints}"></label></div><button type="submit" class="btn ghost">Save</button></form></article>
        <article class="card"><h2>B's records</h2><p class="muted">Kept for ever unless B deletes them here.</p>
          <form id="bdel" class="form"><label>Delete records before<input type="date" name="before" required value="${D.add(D.today(), -Number(st.retentionDays || 45))}"></label>
          <fieldset><legend>Which records</legend>${kinds.map(([k, l, n]) => `<label class="check"><input type="checkbox" name="k" value="${k}"> ${l} <span class="muted small">(${n} in total)</span></label>`).join('')}</fieldset>
          <button type="submit" class="btn ghost danger">${icon('trash')}Delete selected records</button></form></article></div></section>`;
    },
    mount(root) {
      const r = $('#ret', root); r.onsubmit = e => { e.preventDefault(); const n = Number(new FormData(r).get('days')); App.commit(`Daily records kept for ${n} days`, pl => { pl.settings.retentionDays = n; }); Store.cleanUp(); };
      const pt = $('#pts', root); pt.onsubmit = e => { e.preventDefault(); const fd = new FormData(pt); App.commit('Points settings saved', pl => { pl.settings.targetDays = Number(fd.get('days')) || 7; pl.settings.targetPoints = Number(fd.get('pts')) || 100; }); };
      const bd = $('#bdel', root); bd.onsubmit = e => {
        e.preventDefault(); const fd = new FormData(bd), kinds = fd.getAll('k'), before = fd.get('before');
        if (!kinds.length) { toast('Tick at least one kind of record.'); return; }
        confirmBox('Delete B\'s records?', `Records before ${D.nice(before, { long: true })} will be deleted. You can undo straight after.`, 'Delete', () => { App.keepScroll = true; Store.deleteB(before, kinds); toast('Records deleted.', { label: 'Undo', run: () => Store.undo() }); }, true);
      };
    }
  };

  /* ---------- Excel & backup ---------- */
  const dataPage = {
    render() {
      return `<section><div class="grid2">
        <article class="card"><h2>Excel</h2><p class="muted">Person-wise, hours per week and month, day grid, company-wise, meetings, advance and billing days, remarks, points, follow-ups and leave, all with filters for sorting.</p><button type="button" class="btn primary" id="xlsx">${icon('download')}Download Excel</button></article>
        <article class="card"><h2>Backup</h2><p class="muted">A backup file holds the whole timetable. It is <b>not encrypted</b>: keep it somewhere safe.</p>
          <div class="row-btns"><button type="button" class="btn ghost" id="bk">${icon('download')}Save backup</button><label class="btn ghost">${icon('upload')}Load backup<input type="file" id="load" accept=".json" hidden></label></div></article>
        <article class="card"><h2>Start again</h2><p class="muted">Replace everything with a starting plan file (setup/starting-plan.json). You can undo this straight after.</p><label class="btn ghost danger">${icon('upload')}Load starting plan<input type="file" id="reset" accept=".json" hidden></label></article></div></section>`;
    },
    mount(root) {
      $('#xlsx', root).onclick = exportExcel;
      $('#bk', root).onclick = () => IO.download(IO.json(Store.plan), `timetable-backup-${D.today()}.json`);
      const load = (inp, label) => inp.onchange = async () => { try { const pl = JSON.parse(await inp.files[0].text()); if (!pl.tasks || !pl.people) throw 0; Store.replace(pl, label); toast(`${label}.`, { label: 'Undo', run: () => Store.undo() }); } catch (e) { toast('That is not a timetable file.'); } };
      load($('#load', root), 'Backup loaded'); load($('#reset', root), 'Starting plan loaded');
    }
  };

  /* ---------- Login & saving ---------- */
  const securityPage = {
    render() {
      const st = Store.plan.settings, cloud = Vault.mode === 'cloud';
      return `<section><div class="grid2">
        <article class="card"><h2>Where the data is saved</h2>${cloud
          ? `<p><b>Firebase (Cloud Firestore)</b>, project <code>${esc((window.FIREBASE_CONFIG || {}).projectId || '')}</code>. Every change is saved within a second and appears on B's other devices. Only B's account can read or write it (Firestore security rules).</p><p class="muted small">Logged in as ${esc((Cloud.user || {}).email || '')}.</p>`
          : `<p><b>This browser only</b>, encrypted with B's password (AES-256). Other devices do not see these changes. To share between devices, connect Firebase (setup/FIREBASE_SETUP.md).</p><p class="muted small">Clearing the browser's site data deletes the timetable. Save a backup regularly.</p>`}
          <p class="muted small">The light/dark choice is the only thing kept unencrypted in the browser.</p></article>
        <article class="card"><h2>Automatic log-off</h2><form id="idle" class="form"><label>Log off after this many minutes without use<input type="number" name="m" min="1" max="60" value="${st.idleMinutes || 10}"></label>
          <p class="muted small">Closing the window or tab also logs off.</p><div class="row-btns"><button class="btn ghost" type="submit">Save</button><button type="button" class="btn ghost" id="out">${icon('logout')}Log off now</button></div></form></article>
        <article class="card"><h2>Password</h2>${cloud
          ? '<p class="muted">The password is managed by Firebase. Change or reset it in the Firebase console: Authentication → Users → ⋮ → Reset password.</p>'
          : `<form id="pw" class="form"><label>New password (at least 8 characters)<input type="password" name="a" minlength="8" autocomplete="new-password" required></label><label>Same password again<input type="password" name="b" minlength="8" autocomplete="new-password" required></label><button class="btn primary" type="submit">Change password</button></form>`}</article></div></section>`;
    },
    mount(root) {
      const f = $('#idle', root); f.onsubmit = e => { e.preventDefault(); const m = Math.min(60, Math.max(1, Number(new FormData(f).get('m')) || 10)); App.commit(`Log-off after ${m} minutes`, p => { p.settings.idleMinutes = m; }); };
      $('#out', root).onclick = () => Vault.lock('Logged off.');
      const pw = $('#pw', root); if (pw) pw.onsubmit = async e => { e.preventDefault(); const fd = new FormData(pw);
        if (fd.get('a') !== fd.get('b')) { toast('The two passwords are different.'); return; }
        await Vault.Local.changePassword(fd.get('a')); pw.reset(); toast('Password changed. Use the new password next time.'); };
    }
  };

  /* ---------- B admin (pattern) ---------- */
  const adminPage = {
    render(p) {
      if (!App.adminOpen()) return `<section><article class="card locked"><div class="lock-big">${icon('lock')}</div><h2>Locked</h2><p class="muted">B's personal hourly schedule for Saturday, Sunday and Monday morning. Open it with B's pattern${Store.plan.settings.bPin ? '' : ' (draw a new one the first time)'}.</p>
        <button type="button" class="btn primary" id="adm-open">${icon('unlock')}Open with pattern</button></article></section>`;
      const plan = Store.plan, st = plan.settings, data = App.data;
      const m = /^\d{4}-\d{2}$/.test(p.m || '') ? p.m : D.month(D.today());
      const [y, mo] = m.split('-').map(Number);
      const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`, next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
      const hrsFor = dw => st.adminHours.find(h => h.dow === dw);
      const dates = D.range(`${m}-01`, `${m}-${String(D.monthLen(y, mo)).padStart(2, '0')}`).filter(d => hrsFor(D.dow(d)));
      const cards = dates.map(d => {
        const h = hrsFor(D.dow(d)), a = T.m(h.start), b = T.m(h.end), rec = plan.admin[d] || {};
        const also = (data.gen.sched['B|' + d] || []).filter(e => e.parts.some(pt => pt[0] < b && pt[1] > a));
        const hours = []; for (let t = a; t < b; t += 60) hours.push([t, Math.min(b, t + 60)]);
        const done = hours.filter(([t]) => (rec[T.s(t)] || {}).done).length, used = hours.filter(([t]) => (rec[T.s(t)] || {}).t).length;
        return `<article class="card adm ${App.isPast(d) ? 'past' : ''}"><header class="sheet-h"><div><h2>${D.nice(d, { long: true })}</h2><p class="muted small">${h.start}–${h.end}${also.length ? ` · Also booked: ${also.map(e => esc(e.o.title + ' ' + Engine.partsText(e.parts))).join(', ')}` : ''}</p></div><span class="count">${done} of ${used} done</span></header>
          <ul class="adm-hours">${hours.map(([t, e]) => { const r = rec[T.s(t)] || {}; const k = `${d}|${T.s(t)}`; return `<li class="${r.done ? 'done' : ''}">
            <span class="tm">${T.s(t)}–${T.s(e)}</span><input data-adm="${k}" data-f="t" value="${esc(r.t || '')}" placeholder="Personal / admin work">
            <select class="imp-sel ${r.imp ? App.IMP[r.imp].cls : ''}" data-adm="${k}" data-f="imp" aria-label="Importance"><option value="">Importance</option>${Object.keys(App.IMP).map(x => `<option value="${x}" ${r.imp === x ? 'selected' : ''}>${App.IMP[x].label}</option>`).join('')}</select>
            <label class="check"><input type="checkbox" data-adm="${k}" data-f="done" ${r.done ? 'checked' : ''}><span>Done</span></label></li>`; }).join('')}</ul></article>`;
      }).join('');
      return `<section><header class="head"><h1>B's admin schedule: ${App.monthName(m)}</h1>
          <div class="acts noprint"><div class="nav-date"><a class="round" href="#/edit?tab=admin&m=${prev}" aria-label="Previous month">${icon('left')}</a><a class="round" href="#/edit?tab=admin&m=${next}" aria-label="Next month">${icon('right')}</a></div>
          <button type="button" class="btn ghost" data-print="admin">${icon('print')}Print / save PDF</button><button type="button" class="btn ghost" id="adm-lock">${icon('lock')}Lock</button></div></header>
        <details class="card noprint"><summary><b>Hours</b> <span class="muted small">${st.adminHours.map(h => `${D.DAYS[h.dow].slice(0, 3)} ${h.start}–${h.end}`).join(', ')}</span></summary>
          <form id="adm-hours" class="form mt">${st.adminHours.map((h, i) => `<div class="row3"><label>Day<input value="${D.DAYS[h.dow]}" disabled></label><label>From<input type="time" name="a${i}" value="${h.start}" step="1800"></label><label>To<input type="time" name="b${i}" value="${h.end}" step="1800"></label></div>`).join('')}
          <button type="submit" class="btn primary">Save hours</button></form></details>
        <div class="grid2">${cards}</div></section>`;
    },
    mount(root) {
      const o = $('#adm-open', root); if (o) o.onclick = () => App.requireB(() => {}, 'Draw B\'s pattern to open the admin schedule.');
      const l = $('#adm-lock', root); if (l) l.onclick = () => App.lockB();
      const f = $('#adm-hours', root);
      if (f) f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f);
        const hrs = Store.plan.settings.adminHours.map((h, i) => ({ dow: h.dow, start: fd.get('a' + i), end: fd.get('b' + i) }));
        if (hrs.some(h => T.m(h.end) <= T.m(h.start))) { toast('Each "To" time must be after "From".'); return; }
        App.commit('Admin hours saved', p => { p.settings.adminHours = hrs; }); };
      $$('[data-adm]', root).forEach(el => el.onchange = () => {
        const [d, h] = el.dataset.adm.split('|'), fld = el.dataset.f, a = Store.plan.admin;
        const r = Object.assign({}, (a[d] || {})[h] || {});
        if (fld === 'done') { if (el.checked) r.done = true; else delete r.done; } else if (el.value) r[fld] = el.value; else delete r[fld];
        a[d] = a[d] || {}; if (Object.keys(r).length) a[d][h] = r; else delete a[d][h]; if (!Object.keys(a[d]).length) delete a[d];
        Store.save(true);
        if (fld !== 't') { App.keepScroll = true; App.render(); }
      });
    }
  };

  /* ---------------- Excel ---------------- */
  function exportExcel() {
    const plan = Store.plan, data = App.compute(), st = plan.settings, STEPS = App.STEPS;
    const nm = id => App.pname(id), cn = id => App.cname(id), ty = t => (App.TYPES[t] || {}).label || t;
    const RL = App.REMARK_LABELS, rmk = k => plan.remarks[k] || {};
    const IL = k => (App.IMP[k] || {}).label || '';
    const pw = [['Person', 'Date', 'Day', 'Week of', 'Month', 'Slot', 'Start', 'End', 'Hours', 'Work', 'Kind', 'Importance', 'Clearance form', 'Status', 'Remarks']];
    data.gen.dates.forEach(d => plan.people.forEach(p => App.dayRows(d, p.id).forEach(r => {
      const rr = rmk(r.o.key + '|' + p.id);
      pw.push([nm(p.id), d, D.DAYS[D.dow(d)], D.weekStart(d), D.month(d), r.noTime ? 'No free slot' : r.slot >= 0 ? `Slot ${r.slot + 1}` : 'Meeting / other', r.noTime ? '' : T.s(r.a), r.noTime ? '' : T.s(r.b), r.noTime ? 0 : +((r.b - r.a) / 60).toFixed(2), App.personLabel(r.o, p.id), ty(r.o.type), IL(App.imp(r.o.key, p.id)), App.isB(p.id) ? '' : (plan.clear[r.o.key + '|' + p.id] ? 'Done' : ''), RL[rr.s] || '', rr.t || '']);
    })));
    const rem = [['Date', 'Person', 'Work', 'Status', 'Remarks']];
    Object.keys(plan.remarks).sort().forEach(k => { const i = k.lastIndexOf('|'), key = k.slice(0, i), pid = k.slice(i + 1), r = plan.remarks[k];
      const o = data.byKey[key], dayK = key.startsWith('day@');
      rem.push([dayK ? key.slice(4) : (o ? o.date : ''), nm(pid), dayK ? 'Whole day' : (o ? App.personLabel(o, pid) : key), RL[r.s] || '', r.t || '']); });
    const weeks = [...new Set(data.gen.dates.map(D.weekStart))], months = [...new Set(data.gen.dates.map(D.month))];
    const hrs = [['Person', ...weeks.map(w => 'Week of ' + w), ...months.map(m => 'Month ' + m), 'Total hours']];
    plan.people.forEach(p => { const s = data.stats.per[p.id]; const f = fn => +(Object.keys(s.byDate).filter(fn).reduce((a, d) => a + s.byDate[d], 0) / 60).toFixed(2);
      hrs.push([nm(p.id), ...weeks.map(w => f(d => D.weekStart(d) === w)), ...months.map(m => f(d => D.month(d) === m)), +(s.booked / 60).toFixed(2)]); });
    const daily = [['Date', 'Day', ...plan.people.map(p => nm(p.id))]];
    data.gen.dates.forEach(d => daily.push([d, data.gen.hol[d] || D.DAYS[D.dow(d)], ...plan.people.map(p => App.onLeave(p.id, d) ? 'On leave' : App.dayRows(d, p.id).map(r => r.noTime ? `No slot: ${App.personLabel(r.o, p.id)}` : `${T.s(r.a)}-${T.s(r.b)} ${App.personLabel(r.o, p.id)}`).join(' | '))]));
    const comp = [['Company', 'Group', 'Date', 'Day', 'Person', 'Run', 'Visit']];
    data.gen.visits.slice().sort((a, b) => cn(a.company) === cn(b.company) ? (a.date < b.date ? -1 : 1) : (cn(a.company) < cn(b.company) ? -1 : 1))
      .forEach(v => comp.push([cn(v.company), App.GROUPS[(plan.companies.find(c => c.id === v.company) || {}).group] || '', v.date, D.DAYS[D.dow(v.date)], nm(v.person), v.cycle, v.repeat ? 'Continued' : 'First']));
    const meet = [['Date', 'Meeting', 'Attending', 'Out of station', 'Start', 'Agenda item', 'Minutes', 'People']];
    data.gen.occs.filter(o => o.type === 'meeting').forEach(o => { let cur = T.m(o.start); ((App.task(o.taskId) || {}).agenda || []).forEach(a => { meet.push([o.date, o.title, o.people.map(nm).join(', '), (o.away || []).map(nm).join(', '), T.s(cur), a.item, a.minutes, (a.owners || []).map(nm).join(', ')]); cur += Number(a.minutes) || 0; }); });
    const pay = [['Date', 'Kind', 'Start', 'End', 'Company', 'Steps', 'People', 'Done']];
    data.gen.occs.filter(o => o.type === 'advance' || o.type === 'billing').forEach(o => Engine.slotPlan(plan, o, STEPS[o.type], data.gen).forEach(r => pay.push([o.date, o.title, r.start, r.end, r.company === 'general' ? 'All works' : cn(r.company), STEPS[o.type].join(', '), o.people.map(nm).join(', '), (plan.reviews.pay || {})[o.key + '|' + r.company] ? 'Yes' : ''])));
    const sched = [['Date', 'Day', 'Start', 'End', 'Hours', 'Work', 'Kind', 'People', 'Out of station']];
    data.gen.occs.forEach(o => sched.push([o.date, D.DAYS[D.dow(o.date)], o.start, o.end, +(o.mins / 60).toFixed(2), o.title, ty(o.type), o.people.map(nm).join(', '), (o.away || []).map(nm).join(', ')]));
    const pts = [['Person', 'Company', 'Run', 'Ticked on', 'Due', 'Points']];
    Object.values(plan.targets).sort((a, b) => a.d < b.d ? -1 : 1).forEach(t => pts.push([nm(t.p), cn(t.c), (t.run || '').replace('@', ' '), t.d, t.due || '', Number(st.targetPoints) || 100]));
    plan.people.filter(x => !App.isB(x.id)).forEach(x => pts.push([nm(x.id), 'TOTAL', '', '', '', App.points(x.id)]));
    const fus = [['Company', 'Date', '6 pm follow-up points']];
    Object.keys(plan.followups).sort().forEach(k => { const [c, d] = k.split('|'); fus.push([cn(c), d, plan.followups[k]]); });
    const lv = [['Person', 'Date']];
    Object.keys(plan.leave).sort().forEach(k => { const [pid, d] = k.split('|'); lv.push([nm(pid), d]); });
    IO.download(IO.xlsx([{ name: 'Person-wise', rows: pw }, { name: 'Hours', rows: hrs }, { name: 'Day grid', rows: daily }, { name: 'Company-wise', rows: comp }, { name: 'Meetings', rows: meet }, { name: 'Advance & billing', rows: pay }, { name: 'All work', rows: sched }, { name: 'Remarks', rows: rem }, { name: 'Points', rows: pts }, { name: 'Company follow-ups', rows: fus }, { name: 'Leave', rows: lv }]), `timetable-${st.start}-to-${st.end}.xlsx`);
    toast('Excel downloaded.');
  }
  App.exportExcel = exportExcel;
})();
