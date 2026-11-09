/* The Edit area: every input of the website in one place. The view pages only show; everything you change here
   is used by all pages, the Link chart, the Excel download and the PDFs. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, modal, closeModal, confirmBox } = UI;
  const V = App.views;

  /* Settings: things set once and changed rarely. Daily work is changed on Today, in Meetings, in Billing days
     and in the Link chart; B's admin schedule has its own page. */
  const openSet = new Set();
  V.settings = {
    title: 'Settings', editing: true,
    desc: { what: 'Settings: what is set once and changed rarely.', why: 'Repeating work, who measures which company, employees, hours, holidays and site windows, points and records, Excel and backup, login. Daily changes are made on Today.' },
    parts() {
      const nProb = App.data.iss.filter(i => i.level !== 'info').length;
      return [
        nProb ? ['problems', `Problems (${nProb})`, problemsPage] : null,
        ['work', 'Repeating work (site runs, outstation, billing, advances, office work)', workPage],
        ['who', 'Who measures which company', { render: () => whoPage.render().split('<!--EMP-->')[0] }],
        ['eng', 'Company site engineers (names and phone numbers)', engPage],
        ['people', 'Employees: names and weekly days off', { render: () => whoPage.render().split('<!--EMP-->')[1] || '' }],
        ['hours', 'Hours, holidays & site windows', officePage],
        ['records', 'Targets, points & records', recordsPage],
        ['data', 'Excel & backup', dataPage],
        ['login', 'Login & saving', securityPage]
      ].filter(Boolean);
    },
    render(p) {
      if (p.open) openSet.add(p.open);
      return `<section class="settings"><header class="head"><h1>Settings</h1></header>${this.parts().map(([k, l, pg]) => `<details class="card set ${k === 'problems' ? 'prob' : ''}" data-set="${k}" ${openSet.has(k) ? 'open' : ''}><summary><b>${esc(l)}</b></summary><div class="set-body">${pg.render(p)}</div></details>`).join('')}</section>`;
    },
    mount(root, p) {
      $$('details[data-set]', root).forEach(d => d.addEventListener('toggle', () => { if (d.open) openSet.add(d.dataset.set); else openSet.delete(d.dataset.set); }));
      [officePage, recordsPage, dataPage, securityPage, engPage].forEach(pg => { if (pg.mount) pg.mount(root, p); });
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
          <b>${esc(t.title)}</b><span>${esc(repeatText(t))}, ${t.start}–${t.end}${t.noSite ? ' · no site work that day' : ''}${t.siteGroup ? ' · ' + ASSIGN[t.assign || 'each'] : ''}${t.importance === 'high' ? ' · High priority' : ''}</span><span class="avs">${Engine.normPeople(plan, t.people).map(x => App.avatar(x, 'sm')).join('')}</span></button></li>`).join('')}</ul></section>`;
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

  /* ---------- Company site engineers (shown in the 6 pm follow-up) ---------- */
  const engPage = {
    render() {
      const plan = Store.plan;
      return `<section><p class="hint">Shown under the 6 pm follow-up on Today and on each company's schedule. Leave a row empty to remove it.</p>
        <div class="card"><table class="tbl eng-tbl"><tbody>${plan.companies.map(c => { const es = (c.engineers || []).concat([{ name: '', phone: '' }]);
          return `<tr><th>${esc(c.name)}</th><td>${es.map((e, i) => `<div class="eng-row"><input data-eng="${esc(c.id)}|${i}|name" value="${esc(e.name)}" placeholder="Engineer name" aria-label="Engineer name"><input data-eng="${esc(c.id)}|${i}|phone" value="${esc(e.phone || '')}" placeholder="Phone" inputmode="tel" aria-label="Phone"></div>`).join('')}</td></tr>`; }).join('')}</tbody></table></div></section>`;
    },
    mount(root) {
      $$('[data-eng]', root).forEach(i => i.onchange = () => { const [cid, n, f] = i.dataset.eng.split('|');
        App.commit('Engineer saved', p => { const c = p.companies.find(x => x.id === cid); const es = c.engineers = c.engineers || []; es[+n] = Object.assign({ name: '', phone: '' }, es[+n], { [f]: i.value.trim() }); c.engineers = es.filter(e => e && (e.name || e.phone)); }); });
    }
  };

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
      return `<section>${list.length ? `<ul class="problems">${list.map(i => `<li class="${i.level}">${i.date ? `<a href="#/today?date=${i.date}">${D.nice(i.date)}</a>` : ''}<span>${esc(i.text)}</span>${(i.keys || []).slice(0, 1).map(k => App.data.byKey[k] ? `<button type="button" class="btn ghost sm" data-occ="${esc(k)}">Fix</button>` : '').join('')}</li>`).join('')}</ul>` : '<p class="free">No problems. Nobody is booked twice.</p>'}
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
        followups: Object.keys(plan.followups).length, admin: Object.keys(plan.admin).length
      };
      const kinds = [['timetable', 'B\'s timetable remarks, clearance and importance', cnt.timetable], ['checks', 'B\'s daily check ticks (days)', cnt.checks], ['pay', 'Advance & billing ticks', cnt.pay],
        ['marks', 'Monthly schedule marks (points)', (plan.marks || []).length], ['followups', 'Company 6 pm follow-up points', cnt.followups], ['admin', 'B\'s admin schedule (days)', cnt.admin]];
      return `<section><div class="grid2">
        <article class="card"><h2>Automatic clean-up</h2><p class="muted">Every day, the daily records of N, R, S and P (remarks, clearance forms, importance, leave, work added by hand) older than <b>${st.retentionDays}</b> days are deleted. B's records are never deleted automatically.</p>
          <form id="ret" class="form"><div class="row2"><label>Keep daily records for (days)<input type="number" name="days" min="7" max="3650" value="${st.retentionDays}"></label><span></span></div><button type="submit" class="btn ghost">Save</button></form></article>
        <article class="card"><h2>Points for target completion</h2><p class="muted">Each <b>positive</b> mark in the monthly schedule gives <b>${st.targetPoints}</b> points to every employee whose cells are in it. Negative marks give no points.</p>
          <table class="tbl"><tbody>${App.staff().map(x => `<tr><th>${App.who(x.id)}</th><td>${App.points(x.id)}</td></tr>`).join('')}</tbody></table>
          <form id="pts" class="form"><div class="row2"><label>Points per positive mark<input type="number" name="pts" min="1" max="10000" value="${st.targetPoints}"></label><span></span></div><button type="submit" class="btn ghost">Save</button></form></article>
        <article class="card"><h2>B's records</h2><p class="muted">Kept for ever unless B deletes them here.</p>
          <form id="bdel" class="form"><label>Delete records before<input type="date" name="before" required value="${D.add(D.today(), -Number(st.retentionDays || 45))}"></label>
          <fieldset><legend>Which records</legend>${kinds.map(([k, l, n]) => `<label class="check"><input type="checkbox" name="k" value="${k}"> ${l} <span class="muted small">(${n} in total)</span></label>`).join('')}</fieldset>
          <button type="submit" class="btn ghost danger">${icon('trash')}Delete selected records</button></form></article></div></section>`;
    },
    mount(root) {
      const r = $('#ret', root); r.onsubmit = e => { e.preventDefault(); const n = Number(new FormData(r).get('days')); App.commit(`Daily records kept for ${n} days`, pl => { pl.settings.retentionDays = n; }); Store.cleanUp(); };
      const pt = $('#pts', root); pt.onsubmit = e => { e.preventDefault(); const fd = new FormData(pt); App.commit('Points settings saved', pl => { pl.settings.targetPoints = Number(fd.get('pts')) || 100; }); };
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
        <article class="card"><h2>Update file</h2><p class="muted">Adds new private details (company engineers, B admin sections, PPV and Architectural schedules) without touching anything already filled in.</p><label class="btn ghost">${icon('upload')}Load update file<input type="file" id="upd" accept=".json" hidden></label></article>
        <article class="card"><h2>Start again</h2><p class="muted">Replace everything with a starting plan file (setup/starting-plan.json). You can undo this straight after.</p><label class="btn ghost danger">${icon('upload')}Load starting plan<input type="file" id="reset" accept=".json" hidden></label></article></div></section>`;
    },
    mount(root) {
      $('#xlsx', root).onclick = exportExcel;
      $('#bk', root).onclick = () => IO.download(IO.json(Store.plan), `timetable-backup-${D.today()}.json`);
      const load = (inp, label) => inp.onchange = async () => { try { const pl = JSON.parse(await inp.files[0].text()); if (!pl.tasks || !pl.people) throw 0; Store.replace(pl, label); toast(`${label}.`, { label: 'Undo', run: () => Store.undo() }); } catch (e) { toast('That is not a timetable file.'); } };
      const up = $('#upd', root); up.onchange = async () => { try { const u = JSON.parse(await up.files[0].text()); let done = []; App.commit('Update file loaded', pl => { done = Store.applyUpdate(pl, u); }); toast(done.length ? `Updated: ${done.join(', ')}.` : 'Nothing new in that file.'); } catch (e) { toast('That is not an update file.'); } };
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

  /* ---------------- Excel ---------------- */
  function exportExcel() {
    const plan = Store.plan, data = App.compute(), st = plan.settings;
    const nm = id => App.pname(id), cn = id => App.cname(id), ty = t => (App.TYPES[t] || {}).label || t;
    const RL = App.REMARK_LABELS, rmk = k => plan.remarks[k] || {};
    const IL = k => App.impLabel(k);
    const pw = [['Person', 'Date', 'Day', 'Week of', 'Month', 'Slot', 'Start', 'End', 'Hours', 'Work', 'Kind', 'Priority', 'Clearance form', 'Status', 'Remarks']];
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
    data.gen.occs.filter(o => o.type === 'advance' || o.type === 'billing').forEach(o => App.payRows(o).forEach(r => pay.push([o.date, o.title, r.start, r.end, r.company === 'general' ? 'All works' : cn(r.company), r.steps, o.people.map(nm).join(', '), (plan.reviews.pay || {})[o.key + '|' + r.company] ? 'Yes' : ''])));
    const sched = [['Date', 'Day', 'Start', 'End', 'Hours', 'Work', 'Kind', 'People', 'Out of station']];
    data.gen.occs.forEach(o => sched.push([o.date, D.DAYS[D.dow(o.date)], o.start, o.end, +(o.mins / 60).toFixed(2), o.title, ty(o.type), o.people.map(nm).join(', '), (o.away || []).map(nm).join(', ')]));
    const pts = [['Marked on', 'Remark', 'Positive / negative', 'Employee', 'Dates', 'Points']];
    (plan.marks || []).forEach(m => { const by = {}; m.cells.forEach(c => { (by[c.pid] = by[c.pid] || []).push(c.date); });
      Object.keys(by).forEach(pid => pts.push([m.at || '', m.text, m.tone === 'neg' ? 'Negative' : 'Positive', nm(pid), by[pid].sort().join(', '), m.tone === 'neg' ? 0 : Number(st.targetPoints) || 100])); });
    App.staff().forEach(x => pts.push(['', 'TOTAL', '', nm(x.id), '', App.points(x.id)]));
    const acts = [['Company', 'Follow-up date', 'Action point', 'Done']];
    Object.keys(plan.actions || {}).sort().forEach(k => { const [c, d] = k.split('|'); plan.actions[k].forEach(a => acts.push([cn(c), d, a.t, a.done ? 'Yes' : ''])); });
    const cms = [['Meeting day', 'Employee', 'Task', 'Days committed', 'Due']];
    (plan.commits || []).forEach(c => cms.push([c.start, nm(c.pid), c.task, c.days, c.due]));
    const fus = [['Company', 'Date', '6 pm follow-up points']];
    Object.keys(plan.followups).sort().forEach(k => { const [c, d] = k.split('|'); fus.push([cn(c), d, plan.followups[k]]); });
    const dc = [['Date', 'Person', 'On leave', 'Works completed', 'Sufficient', 'On time', 'Timetable updated for tomorrow']];
    Object.keys(plan.reviews.days || {}).sort().forEach(d => { const r = plan.reviews.days[d]; if (!r.emp && !r.tomorrow) return;
      plan.people.filter(x => !App.isB(x.id)).forEach(x => { const e = (r.emp || {})[x.id] || {}; dc.push([d, nm(x.id), App.onLeave(x.id, d) ? 'Yes' : '', e.works || '', e.ok === 'yes' ? 'Sufficient' : e.ok === 'no' ? 'Not sufficient' : '', e.timely ? 'Yes' : '', r.tomorrow ? 'Yes' : '']); }); });
    const lv = [['Person', 'Date']];
    Object.keys(plan.leave).sort().forEach(k => { const [pid, d] = k.split('|'); lv.push([nm(pid), d]); });
    IO.download(IO.xlsx([{ name: 'Person-wise', rows: pw }, { name: 'Hours', rows: hrs }, { name: 'Day grid', rows: daily }, { name: 'Company-wise', rows: comp }, { name: 'Meetings', rows: meet }, { name: 'Advance & billing', rows: pay }, { name: 'All work', rows: sched }, { name: 'Remarks', rows: rem }, { name: 'Points', rows: pts }, { name: 'Action points', rows: acts }, { name: 'Commitments', rows: cms }, { name: 'Company follow-ups', rows: fus }, { name: 'Leave', rows: lv }, { name: 'Daily check', rows: dc }]), `timetable-${st.start}-to-${st.end}.xlsx`);
    toast('Excel downloaded.');
  }
  App.exportExcel = exportExcel;
})();
