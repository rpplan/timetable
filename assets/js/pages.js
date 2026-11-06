/* Version 4 pages: Month, company monthly schedule (with 6 pm follow-up points), B's admin schedule, records. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, confirmBox } = UI;
  const V = App.views;
  const RANK = { high: 3, medium: 2, low: 1, '': 0 };

  const printBtn = (what, label) => `<button type="button" class="btn ghost noprint" data-print="${what}">${icon('print')}${label || 'Print / save PDF'}</button>`;
  const monthName = m => `${D.MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
  const winMonths = () => [...new Set(App.data.gen.dates.map(D.month))];
  const monthTabs = (view, cur, extra) => `<nav class="tabs plain noprint">${winMonths().map(m => `<a href="#/${view}?${new URLSearchParams(Object.assign({}, extra || {}, { m })).toString()}" class="${m === cur ? 'on' : ''}">${monthName(m)}</a>`).join('')}</nav>`;
  const pickMonth = p => { const ms = winMonths(); return ms.includes(p.m) ? p.m : (ms.includes(D.month(App.defaultDate())) ? D.month(App.defaultDate()) : ms[0]); };
  const entryText = e => e.noTime ? 'No free slot' : Engine.partsText(e.parts);

  /* ---------------- Month (monthly schedule, everyone) ---------------- */
  V.month = {
    title: 'Month',
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
          if (!list.length) return `<td><span class="offday">${Engine.personOff(plan, x.id, d) ? 'Day off' : D.dow(d) === 0 ? 'Sunday' : ''}</span></td>`;
          return `<td>${list.map(e => { const ty = App.TYPES[e.o.type] || App.TYPES.office; return `<div class="mline" style="--c:${ty.color}"><span class="tm">${esc(entryText(e))}</span> ${esc(App.personLabel(e.o, x.id))} ${App.impBadge(App.imp(e.o.key, x.id))}${!App.isB(x.id) && Store.plan.clear[e.o.key + '|' + x.id] ? ' <span class="clr-mini" title="Clearance form done">✓CF</span>' : ''}</div>`; }).join('')}</td>`;
        }).join('');
        return `<tr class="${past ? 'past' : ''} ${hol ? 'hol' : ''}"><th class="rowhead"><a href="#/today?date=${d}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</a></th>${cells}</tr>`;
      }).join('');
      return `<section><header class="head"><h1>Monthly schedule: ${monthName(m)}</h1>${printBtn('month')}</header>
        ${monthTabs('month', m)}
        <p class="hint noprint">Everyone's work day by day, with the time slots and importance set by B. ✓CF = clearance form done.</p>
        <div class="scroll"><table class="week month"><thead><tr><th>Date</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }
  };

  /* ---------------- Company monthly schedule ---------------- */
  function companyEntries(cid, dates) {
    const data = App.data, plan = Store.plan, set = new Set(dates), out = [];
    data.gen.visits.filter(v => v.company === cid && set.has(v.date)).forEach(v => {
      const e = (data.gen.sched[v.person + '|' + v.date] || []).find(x => x.o.runKey === v.runKey);
      out.push({ date: v.date, time: e ? entryText(e) : '', sort: e && e.parts.length ? e.parts[0][0] : 9999, work: `Site measurement ${v.cycle || ''}`.trim(), type: e ? e.o.type : 'site', people: [v.person], key: e ? e.o.key : null });
    });
    data.gen.occs.filter(o => set.has(o.date) && !o.siteGroup && o.type !== 'review' && (o.companies || []).includes(cid)).forEach(o => {
      let time = App.timeText(o, o.people[0]), sort = T.m(o.start);
      if (o.type === 'billing' || o.type === 'advance') {
        const r = Engine.slotPlan(plan, o, [], data.gen).find(x => x.company === cid);
        if (r) { time = r.text; sort = r.segs.length ? r.segs[0][0] : sort; }
      }
      out.push({ date: o.date, time, sort, work: o.title, type: o.type, people: o.people.slice(), key: o.key });
    });
    return out.sort((a, b) => a.date === b.date ? a.sort - b.sort : (a.date < b.date ? -1 : 1));
  }
  V.company = {
    title: 'Company schedule',
    render(p) {
      const plan = Store.plan, data = App.data, m = pickMonth(p);
      const c = plan.companies.find(x => x.id === p.id) || plan.companies[0];
      const all = p.all === '1';
      const mDates = data.gen.dates.filter(d => D.month(d) === m);
      const ents = companyEntries(c.id, mDates);
      const fu = plan.followups;
      const dates = mDates.filter(d => all ? (!data.gen.hol[d] && D.dow(d) !== 0) || ents.some(e => e.date === d) : ents.some(e => e.date === d) || fu[c.id + '|' + d]);
      const owners = plan.people.filter(x => ((plan.responsibilities[x.id] || {})[c.group] || []).includes(c.id));
      const rows = dates.map(d => {
        const list = ents.filter(e => e.date === d), past = App.isPast(d);
        const fuCell = `<td class="fu" rowspan="${Math.max(1, list.length)}"><textarea data-fu="${esc(c.id)}|${d}" rows="2" placeholder="6 pm follow-up points">${esc(fu[c.id + '|' + d] || '')}</textarea></td>`;
        const dateCell = `<th class="rowhead" rowspan="${Math.max(1, list.length)}"><b>${D.day(d)}</b> ${D.DAYS[D.dow(d)].slice(0, 3)}</th>`;
        if (!list.length) return `<tr class="${past ? 'past' : ''}">${dateCell}<td colspan="4" class="free">No work planned</td>${fuCell}</tr>`;
        return list.map((e, i) => {
          const lv = e.key ? e.people.reduce((best, pid) => RANK[App.imp(e.key, pid)] > RANK[best] ? App.imp(e.key, pid) : best, '') : '';
          const ty = App.TYPES[e.type] || App.TYPES.office;
          const impCell = App.bOn() && e.key && !past ? `<select class="imp-sel ${lv ? App.IMP[lv].cls : ''}" data-impall="${esc(e.key)}|${esc(e.people.join(','))}" aria-label="Importance"><option value="">–</option>${Object.keys(App.IMP).map(k => `<option value="${k}" ${lv === k ? 'selected' : ''}>${App.IMP[k].label}</option>`).join('')}</select>` : (App.impBadge(lv) || '<span class="muted">–</span>');
          return `<tr class="${past ? 'past' : ''}">${i === 0 ? dateCell : ''}<td class="tm">${esc(e.time)}</td><td><span class="dot" style="background:${ty.color}"></span> ${esc(e.work)}</td><td>${e.people.map(x => esc(App.pname(x))).join(', ') || '–'}</td><td>${impCell}</td>${i === 0 ? fuCell : ''}</tr>`;
        }).join('');
      }).join('');
      const opts = Object.keys(App.GROUPS).map(gk => `<optgroup label="${App.GROUPS[gk]}">${plan.companies.filter(x => x.group === gk).map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
      return `<section><header class="head"><div><h1>${esc(c.name)}: ${monthName(m)}</h1><p class="muted">${esc(App.GROUPS[c.group])}. ${owners.length ? 'Measured by ' + owners.map(x => esc(x.name)).join(' and ') : 'Nobody assigned'}.</p></div>
          <div class="acts noprint"><select id="co-pick" class="pick-sel" aria-label="Company">${opts}</select>${printBtn('company')}</div></header>
        ${monthTabs('company', m, { id: c.id, all: all ? '1' : '0' })}
        <label class="check noprint"><input type="checkbox" id="co-all" ${all ? 'checked' : ''}> Show every working day (space for follow-up points on all days)</label>
        <div class="scroll"><table class="tbl co-tbl"><thead><tr><th>Date</th><th>Time</th><th>Work</th><th>Who</th><th>Importance</th><th>6 pm follow-up points</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="free">Nothing for this company in this month.</td></tr>'}</tbody></table></div>
        <p class="muted small noprint">Importance is set by B (in B mode). Follow-up points are saved as you type and leave the box.</p></section>`;
    },
    mount(root, p) {
      const pick = $('#co-pick', root); if (pick) pick.onchange = () => App.go('company', { id: pick.value, m: pickMonth(p), all: p.all || '0' });
      const all = $('#co-all', root); if (all) all.onchange = () => App.go('company', { id: p.id || Store.plan.companies[0].id, m: pickMonth(p), all: all.checked ? '1' : '0' });
      $$('[data-fu]', root).forEach(t => t.onchange = () => { const k = t.dataset.fu; if (t.value.trim()) Store.plan.followups[k] = t.value; else delete Store.plan.followups[k]; Store.save(true); toast('Follow-up saved.'); });
      $$('[data-impall]', root).forEach(s => s.onchange = () => {
        if (!App.bOn()) return;
        const raw = s.dataset.impall, i = raw.lastIndexOf('|'), key = raw.slice(0, i), ppl = raw.slice(i + 1).split(',').filter(Boolean);
        App.keepScroll = true;
        Store.change('Importance set', pl => ppl.forEach(pid => { if (s.value) pl.importance[key + '|' + pid] = s.value; else delete pl.importance[key + '|' + pid]; }));
      });
    }
  };

  /* ---------------- B's admin hourly schedule (Sat, Sun, Mon morning), opened by pattern ---------------- */
  V.admin = {
    title: 'B admin',
    render(p) {
      if (!App.bOn()) return `<section><header class="head"><h1>B's admin schedule</h1></header>
        <article class="card locked"><div class="lock-big">${icon('lock')}</div><h2>Locked</h2><p class="muted">B's personal hourly schedule for Saturday, Sunday and Monday morning. Open it with B's pattern.</p>
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
      const dayName = dw => D.DAYS[dw];
      return `<section><header class="head"><div><h1>B's admin schedule: ${monthName(m)}</h1><p class="muted">Private hourly schedule for B's personal work. Not included in plan.json or share links.</p></div>
          <div class="acts noprint"><div class="nav-date"><a class="round" href="#/admin?m=${prev}" aria-label="Previous month">${icon('left')}</a><a class="round" href="#/admin?m=${next}" aria-label="Next month">${icon('right')}</a></div>${printBtn('admin')}<button type="button" class="btn ghost" id="adm-lock">${icon('lock')}Lock</button></div></header>
        <details class="card noprint"><summary><b>Hours</b> <span class="muted small">${st.adminHours.map(h => `${dayName(h.dow).slice(0, 3)} ${h.start}–${h.end}`).join(', ')}</span></summary>
          <form id="adm-hours" class="form mt">${st.adminHours.map((h, i) => `<div class="row3"><label>Day<input value="${dayName(h.dow)}" disabled></label><label>From<input type="time" name="a${i}" value="${h.start}" step="1800"></label><label>To<input type="time" name="b${i}" value="${h.end}" step="1800"></label></div>`).join('')}
          <button type="submit" class="btn primary">Save hours</button></form></details>
        <div class="grid2">${cards}</div></section>`;
    },
    mount(root) {
      const o = $('#adm-open', root); if (o) o.onclick = () => App.requireB(() => {}, 'Draw B\'s pattern to open the admin schedule.');
      const l = $('#adm-lock', root); if (l) l.onclick = () => { App.lockB(); };
      const f = $('#adm-hours', root);
      if (f) f.onsubmit = e => { e.preventDefault(); const fd = new FormData(f);
        const hrs = Store.plan.settings.adminHours.map((h, i) => ({ dow: h.dow, start: fd.get('a' + i), end: fd.get('b' + i) }));
        if (hrs.some(h => T.m(h.end) <= T.m(h.start))) { toast('Each "To" time must be after "From".'); return; }
        App.commit('Admin hours saved', p => { p.settings.adminHours = hrs; }); };
      $$('[data-adm]', root).forEach(el => el.onchange = () => {
        if (!App.bOn()) return;
        const [d, h] = el.dataset.adm.split('|'), fld = el.dataset.f, a = Store.plan.admin;
        const r = Object.assign({}, (a[d] || {})[h] || {});
        if (fld === 'done') { if (el.checked) r.done = true; else delete r.done; } else if (el.value) r[fld] = el.value; else delete r[fld];
        a[d] = a[d] || {}; if (Object.keys(r).length) a[d][h] = r; else delete a[d][h]; if (!Object.keys(a[d]).length) delete a[d];
        Store.save(true);
        if (fld !== 't') { App.keepScroll = true; App.render(); }
      });
    }
  };

  /* ---------------- Setup: records tab ---------------- */
  const baseSetup = V.setup.render, baseMount = V.setup.mount;
  V.setup.render = function (p) {
    let html = baseSetup.call(this, p);
    html = html.replace('<a href="#/setup?tab=share"', `<a href="#/setup?tab=records" class="${p.tab === 'records' ? 'on' : ''}">Records & points</a><a href="#/setup?tab=share"`);
    if (p.tab !== 'records') return html;
    const plan = Store.plan, st = plan.settings, on = App.bOn();
    const cnt = {
      timetable: ['remarks', 'clear', 'importance'].reduce((n, k) => n + Object.keys(plan[k]).filter(x => x.endsWith('|B')).length, 0),
      checks: Object.keys(plan.reviews.days || {}).length, pay: Object.keys(plan.reviews.pay || {}).length,
      targets: Object.keys(plan.targets).length, followups: Object.keys(plan.followups).length, admin: Object.keys(plan.admin).length
    };
    const kinds = [['timetable', 'B\'s timetable remarks, clearance and importance', cnt.timetable], ['checks', 'B\'s daily check ticks (days)', cnt.checks], ['pay', 'Advance & billing ticks', cnt.pay],
      ['targets', 'Site target ticks (points)', cnt.targets], ['followups', 'Company 6 pm follow-up points', cnt.followups], ['admin', 'B\'s admin schedule (days)', cnt.admin]];
    const body = `<div class="grid2">
      <article class="card"><h2>Automatic clean-up</h2><p class="muted">Every day, the daily records of N, R, S and P/P1 (remarks, clearance forms, importance, leave, work added by hand) older than <b>${st.retentionDays}</b> days are deleted. B's records are never deleted automatically.</p>
        ${on ? `<form id="ret" class="form"><div class="row2"><label>Keep daily records for (days)<input type="number" name="days" min="7" max="3650" value="${st.retentionDays}"></label><span></span></div><button type="submit" class="btn ghost">Save</button></form>` : ''}</article>
      <article class="card"><h2>Points</h2><p class="muted">Target for each site measurement: <b>${st.targetDays}</b> days from the start of the run. Each tick of "done in time" = <b>${st.targetPoints}</b> points.</p>
        <table class="tbl"><tbody>${plan.people.filter(x => !App.isB(x.id)).map(x => `<tr><th>${App.who(x.id)}</th><td>${App.points(x.id)}</td></tr>`).join('')}</tbody></table>
        ${on ? `<form id="pts" class="form"><div class="row2"><label>Target days<input type="number" name="days" min="1" max="31" value="${st.targetDays}"></label><label>Points per tick<input type="number" name="pts" min="1" max="10000" value="${st.targetPoints}"></label></div><button type="submit" class="btn ghost">Save</button></form>` : ''}</article>
      <article class="card"><h2>B's records</h2>${on ? `<p class="muted">Kept for ever unless B deletes them here.</p>
        <form id="bdel" class="form"><label>Delete records before<input type="date" name="before" required value="${D.add(D.today(), -Number(st.retentionDays || 45))}"></label>
        <fieldset><legend>Which records</legend>${kinds.map(([k, l, n]) => `<label class="check"><input type="checkbox" name="k" value="${k}"> ${l} <span class="muted small">(${n} in total)</span></label>`).join('')}</fieldset>
        <button type="submit" class="btn ghost danger">${icon('trash')}Delete selected records</button></form>`
        : `<p class="muted">Only B can delete B's records.</p><button type="button" class="btn ghost" data-bopen>${icon('lock')}Open B mode</button>`}</article></div>`;
    return html.replace(/(<\/nav>)[\s\S]*(<\/section>)$/, `$1${body}$2`);
  };
  V.setup.mount = function (root, p) {
    baseMount.call(this, root, p);
    // plan.json for the office never carries B's private admin schedule
    const off = $('#office', root);
    if (off) off.onclick = () => { IO.download(IO.json(Store.publicCopy()), 'plan.json'); toast('plan.json downloaded (without B\'s admin schedule). Put it in the data folder of the website.'); };
    const r = $('#ret', root); if (r) r.onsubmit = e => { e.preventDefault(); const n = Number(new FormData(r).get('days')); App.commit(`Daily records kept for ${n} days`, pl => { pl.settings.retentionDays = n; }); Store.cleanUp(); };
    const pt = $('#pts', root); if (pt) pt.onsubmit = e => { e.preventDefault(); const fd = new FormData(pt); App.commit('Points settings saved', pl => { pl.settings.targetDays = Number(fd.get('days')) || 7; pl.settings.targetPoints = Number(fd.get('pts')) || 100; }); };
    const bd = $('#bdel', root); if (bd) bd.onsubmit = e => {
      e.preventDefault(); const fd = new FormData(bd), kinds = fd.getAll('k'), before = fd.get('before');
      if (!kinds.length) { toast('Tick at least one kind of record.'); return; }
      confirmBox('Delete B\'s records?', `Records before ${D.nice(before, { long: true })} will be deleted. You can undo straight after.`, 'Delete', () => { App.keepScroll = true; Store.deleteB(before, kinds); toast('Records deleted.', { label: 'Undo', run: () => Store.undo() }); }, true);
    };
  };
})();
