/* Scheduling engine: turns the plan (monthly template + edits) into dated occurrences,
   finds clashes, and computes statistics. Pure functions, no DOM. */
(function (g) {
  'use strict';

  /* ---------- dates & times ---------- */
  const D = {
    parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); },
    fmt(dt) { return dt.toISOString().slice(0, 10); },
    add(s, n) { const d = D.parse(s); d.setUTCDate(d.getUTCDate() + n); return D.fmt(d); },
    dow(s) { return D.parse(s).getUTCDay(); },            // 0 = Sunday
    day(s) { return Number(s.slice(8, 10)); },
    month(s) { return s.slice(0, 7); },
    diff(a, b) { return Math.round((D.parse(b) - D.parse(a)) / 864e5); },
    range(a, b) { const out = []; for (let s = a; s <= b; s = D.add(s, 1)) out.push(s); return out; },
    monthLen(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }, // m is 1-based
    weekStart(s) { const w = D.dow(s); return D.add(s, w === 0 ? -6 : 1 - w); }, // Monday
    today() { const t = new Date(); return D.fmt(new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()))); },
    MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    DAYS: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    nice(s, opts) {
      const d = D.parse(s), o = opts || {};
      const wd = D.DAYS[d.getUTCDay()];
      const base = `${d.getUTCDate()} ${D.MONTHS[d.getUTCMonth()].slice(0, 3)}`;
      if (o.short) return base;
      if (o.long) return `${wd}, ${d.getUTCDate()} ${D.MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      return `${wd.slice(0, 3)} ${base}`;
    }
  };
  const T = {
    m(t) { if (!t) return 0; const [h, mi] = t.split(':').map(Number); return h * 60 + (mi || 0); },
    s(m) { m = Math.round(m); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; },
    nice(t) { const m = T.m(t); let h = Math.floor(m / 60); const mi = m % 60; const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return mi ? `${h}.${String(mi).padStart(2, '0')} ${ap}` : `${h} ${ap}`; },
    hrs(mins) { const h = mins / 60; return (Math.round(h * 10) / 10).toString().replace(/\.0$/, ''); }
  };

  /* Working minutes between start and end, with lunch removed. */
  function workMins(start, end, st) {
    const a = T.m(start), b = T.m(end);
    if (b <= a) return 0;
    const la = T.m(st.lunchStart), lb = T.m(st.lunchEnd);
    const lunch = Math.max(0, Math.min(b, lb) - Math.max(a, la));
    return b - a - lunch;
  }

  /* ---------- helpers ---------- */
  function holidayMap(plan) { const m = {}; (plan.holidays || []).forEach(h => { m[h.date] = h.name || 'Holiday'; }); return m; }
  function capacityMins(plan) { return workMins(plan.settings.workStart, plan.settings.workEnd, plan.settings); }
  function personOf(plan, id) {
    if (!id) return null;
    return plan.people.find(p => p.id === id) || plan.people.find(p => (p.aliases || []).includes(id)) || null;
  }
  function normPeople(plan, arr) {
    const out = [];
    (arr || []).forEach(id => { const p = personOf(plan, id); const pid = p ? p.id : id; if (!out.includes(pid)) out.push(pid); });
    return out;
  }
  function unionMins(list, st) {
    const iv = list.map(o => [T.m(o.start), T.m(o.end)]).filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    iv.forEach(x => { const l = merged[merged.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else merged.push(x.slice()); });
    return merged.reduce((s, x) => s + workMins(T.s(x[0]), T.s(x[1]), st), 0);
  }
  function overlapMins(a, b) { return Math.max(0, Math.min(T.m(a.end), T.m(b.end)) - Math.max(T.m(a.start), T.m(b.start))); }

  /* ---------- generation ---------- */
  function generate(plan) {
    const st = plan.settings;
    const hol = holidayMap(plan);
    const winDates = D.range(st.start, st.end);
    const inWin = s => s >= st.start && s <= st.end;
    const isOff = (s, streak) => {
      if (hol[s]) return true;
      if (D.dow(s) === 0 && st.sundayOff) return !(streak && st.sundayStreak);
      return false;
    };
    const taskById = {}; plan.tasks.forEach(t => { taskById[t.id] = t; });

    const occs = [];
    const notes = [];   // generation notes (shifted, unplaced...)
    const book = {};    // person|date -> [{start,end,key}]
    const addBook = o => o.people.forEach(p => { (book[p + '|' + o.date] = book[p + '|' + o.date] || []).push(o); });
    const clashes = (people, date, start, end, exceptKey) => people.some(p =>
      (book[p + '|' + date] || []).some(b => b.key !== exceptKey && overlapMins(b, { start, end }) > 0));

    function makeOcc(t, key, planned, date, extra) {
      const o = Object.assign({
        key, taskId: t.id, title: t.title, type: t.type || 'office', planned, date,
        people: normPeople(plan, t.people), start: t.start, end: t.end,
        companies: (t.companies || []).slice(), details: t.details || '',
        siteGroup: t.siteGroup || null, cycle: t.cycle || null, runKey: null,
        shifted: false, moved: false, extra: false
      }, extra || {});
      return o;
    }

    // Months that touch the window (plus the month before, so a run that started earlier is complete)
    const months = [];
    { let y = Number(st.start.slice(0, 4)), m = Number(st.start.slice(5, 7)) - 1; if (m === 0) { m = 12; y--; }
      const endKey = st.end.slice(0, 7);
      while (true) { const k = `${y}-${String(m).padStart(2, '0')}`; months.push([y, m, k]); if (k >= endKey) break; m++; if (m > 12) { m = 1; y++; } } }

    // Pass 1: monthly runs. Dates that need no shifting are booked first.
    const pending = [];
    plan.tasks.filter(t => (t.mode || 'monthly') === 'monthly').forEach(t => {
      months.forEach(([y, m, mk]) => {
        const ml = D.monthLen(y, m);
        const days = (t.days || []).filter(d => d >= 1 && d <= ml).sort((a, b) => a - b);
        if (!days.length) return;
        const runKey = `${t.id}@${mk}`;
        const streak = days.length > 1;
        const planned = days.map(d => `${mk}-${String(d).padStart(2, '0')}`);
        planned.forEach(p => {
          const key = `${t.id}@${p}`;
          if (!isOff(p, streak)) {
            const o = makeOcc(t, key, p, p, { runKey });
            occs.push(o);
          } else if ((t.holiday || 'shift') === 'shift') {
            pending.push({ t, key, planned: p, runKey, streak });
          } else if (inWin(p)) {
            notes.push({ level: 'info', kind: 'skipped', key, date: p, taskId: t.id,
              text: `${t.title} is not held on ${D.nice(p)} (${hol[p] || 'Sunday'}).` });
          }
        });
      });
    });

    // One-off tasks
    (plan.extra || []).forEach(x => {
      const t = Object.assign({ type: 'office' }, x);
      occs.push(makeOcc(t, `x:${x.id}`, x.date, x.date, { extra: true, taskId: `x:${x.id}` }));
    });

    // Daily tasks (generated now so shifting can avoid them)
    const anyWork = new Set(occs.map(o => o.date));
    plan.tasks.filter(t => t.mode === 'daily').forEach(t => {
      winDates.forEach(s => {
        if (hol[s]) return;
        if (isOff(s, false) && !anyWork.has(s)) return;
        occs.push(makeOcc(t, `${t.id}@${s}`, s, s));
      });
    });

    // Apply overrides to everything generated so far (except pending)
    const applyOverride = o => {
      const ov = plan.overrides && plan.overrides[o.key];
      if (!ov) return true;
      if (ov.deleted) return false;
      ['date', 'start', 'end', 'title', 'note'].forEach(k => { if (ov[k] != null && ov[k] !== '') o[k] = ov[k]; });
      if (ov.people) o.people = normPeople(plan, ov.people);
      if (ov.companies) o.companies = ov.companies.slice();
      if (ov.date && ov.date !== o.planned) o.moved = true;
      o.overridden = true;
      return true;
    };
    let live = occs.filter(applyOverride);
    live.forEach(addBook);

    const lastShift = {};
    // Pass 2: shift the pending ones to the next working day without a clash
    pending.sort((a, b) => a.planned < b.planned ? -1 : 1).forEach(p => {
      const ov = plan.overrides && plan.overrides[p.key];
      const t = p.t;
      let date = (lastShift[p.runKey] && lastShift[p.runKey] > p.planned) ? lastShift[p.runKey] : p.planned, tries = 0;
      const ppl = normPeople(plan, (ov && ov.people) || t.people);
      const s0 = (ov && ov.start) || t.start, e0 = (ov && ov.end) || t.end;
      // Next working day; prefer one of the next 3 working days that has no clash for these people
      const cands = [];
      while (cands.length < 3 && tries < 30) { date = D.add(date, 1); tries++; if (!isOff(date, false)) cands.push(date); }
      const clashMins = c => ppl.reduce((sum, pp) => sum + (book[pp + '|' + c] || []).reduce((a, b) => a + overlapMins(b, { start: s0, end: e0 }), 0), 0);
      date = cands.slice().sort((a, b) => clashMins(a) - clashMins(b) || (a < b ? -1 : 1))[0] || D.add(p.planned, 1);
      lastShift[p.runKey] = date;
      const o = makeOcc(t, p.key, p.planned, date, { runKey: p.runKey, shifted: true });
      if (!applyOverride(o)) return;
      live.push(o); addBook(o);
      if (inWin(o.date) || inWin(p.planned)) notes.push({ level: 'info', kind: 'shifted', key: p.key, date: o.date, taskId: t.id,
        text: `${t.title} moved from ${D.nice(p.planned)} (${hol[p.planned] || 'Sunday'}) to ${D.nice(o.date)}.` });
    });

    // Outstation: who actually goes (the user can choose per run), and they skip meetings and in-town work those days
    const away = plan.away || {};
    const awayPD = {};
    live.forEach(o => {
      if (o.type !== 'outstation') return;
      const ch = o.runKey && away[o.runKey];
      if (ch && !(plan.overrides[o.key] && plan.overrides[o.key].people)) o.people = o.people.filter(pid => ch[pid] !== false);
      o.people.forEach(pid => { awayPD[pid + '|' + o.date] = true; });
    });
    live.forEach(o => {
      if (o.type === 'outstation') return;
      if (!(o.type === 'meeting' || o.type === 'site')) return;
      const gone = o.people.filter(pid => awayPD[pid + '|' + o.date]);
      if (gone.length) { o.away = gone; o.people = o.people.filter(pid => !gone.includes(pid)); }
    });
    Object.keys(book).forEach(k => delete book[k]);
    live.forEach(addBook);

    // Weekly flexible tasks: place on free working days
    plan.tasks.filter(t => t.mode === 'weekly').forEach(t => {
      const ppl = normPeople(plan, t.people);
      const per = Math.max(1, t.perWeek || 1);
      const weeks = [...new Set(winDates.map(D.weekStart))];
      weeks.forEach(ws => {
        const cands = D.range(ws, D.add(ws, 6)).filter(s => inWin(s) && !isOff(s, false));
        const pref = t.prefer && t.prefer.length ? t.prefer : null;
        if (pref) cands.sort((a, b) => (pref.indexOf(D.dow(a)) + 10 * (pref.indexOf(D.dow(a)) < 0)) - (pref.indexOf(D.dow(b)) + 10 * (pref.indexOf(D.dow(b)) < 0)));
        let placed = 0;
        for (let i = 0; i < per; i++) {
          const key = `${t.id}@${ws}#${i + 1}`;
          const ov = plan.overrides && plan.overrides[key];
          if (ov && ov.deleted) { placed++; continue; }
          let date = ov && ov.date;
          if (!date) {
            date = cands.find(s => ppl.every(pp => (book[pp + '|' + s] || [])
              .filter(b => b.type !== 'review' && b.type !== 'meeting').length === 0));
            if (date) cands.splice(cands.indexOf(date), 1);
          }
          if (!date) {
            if (cands.length || weeks.length) notes.push({ level: 'warn', kind: 'unplaced', key, date: ws, taskId: t.id,
              text: `${t.title}: no free day for slot ${i + 1} in the week of ${D.nice(ws, { short: true })}.` });
            continue;
          }
          const o = makeOcc(t, key, ws, date, { flex: true });
          applyOverride(o);
          live.push(o); addBook(o); placed++;
        }
      });
    });

    // Status
    live.forEach(o => { o.status = (plan.status && plan.status[o.key]) || 'planned'; o.mins = workMins(o.start, o.end, st); });

    // Site visits: each person's companies get their own day inside each site run.
    // A company shared by two people gets different days, unless it is marked "together" (then both go the same day).
    const visits = [];
    const runs = {};
    live.filter(o => o.siteGroup && o.runKey).forEach(o => { (runs[o.runKey] = runs[o.runKey] || []).push(o); });
    Object.keys(runs).forEach(rk => {
      const list = runs[rk].sort((a, b) => a.date < b.date ? -1 : 1);
      const t = taskById[list[0].taskId];
      const ppl = normPeople(plan, t.people);
      const pDates = {}; ppl.forEach(pid => { pDates[pid] = list.filter(o => o.people.includes(pid)).map(o => o.date); });
      const taken = {};     // pid -> set of dates already used for a company
      const usedBy = {};    // company -> set of dates already used by someone else
      ppl.forEach(pid => { taken[pid] = new Set(); });
      const push = (cid, pid, date, together) => {
        const vk = `${rk}|${cid}|${pid}`;
        const vo = (plan.visitOverrides || {})[vk];
        const d = (vo && vo.date) || date;
        if (!d) {
          if (list.some(o => inWin(o.date)) && (pDates[pid] || []).length) notes.push({ level: 'warn', kind: 'novisit', key: vk, date: list[0].date, taskId: t.id,
            text: `${companyName(plan, cid)} has no site day for ${personName(plan, pid)} in ${t.title} (${rk.split('@')[1]}).` });
          return;
        }
        taken[pid] && taken[pid].add(d); (usedBy[cid] = usedBy[cid] || new Set()).add(d);
        visits.push({ key: vk, runKey: rk, taskId: t.id, company: cid, person: (vo && vo.person) || pid, date: d, together: !!together,
          cycle: t.cycle || (t.siteGroup === 'outstation' ? 'Outstation' : ''), moved: !!vo, siteGroup: t.siteGroup });
      };
      const comp = id => plan.companies.find(c => c.id === id) || {};
      const has = (pid, cid) => (((plan.responsibilities[pid] || {})[t.siteGroup]) || []).includes(cid);
      // 1. companies visited together (same day for everyone who has them)
      const tog = plan.companies.filter(c => c.together && ppl.some(pid => has(pid, c.id)));
      tog.forEach(c => {
        const holders = ppl.filter(pid => has(pid, c.id) && pDates[pid].length);
        if (!holders.length) return;
        const common = pDates[holders[0]].filter(d => holders.every(h => pDates[h].includes(d) && !taken[h].has(d)));
        holders.forEach(h => push(c.id, h, common[0] || null, holders.length > 1));
      });
      // 2. everything else, one company per day per person, shared companies on different days
      ppl.forEach(pid => {
        (((plan.responsibilities[pid] || {})[t.siteGroup]) || []).forEach(cid => {
          if (comp(cid).together) return;
          const d = pDates[pid].find(x => !taken[pid].has(x) && !(usedBy[cid] && usedBy[cid].has(x)));
          push(cid, pid, d || null);
        });
      });
    });

    live = live.filter(o => inWin(o.date)).sort((a, b) => a.date === b.date ? T.m(a.start) - T.m(b.start) : (a.date < b.date ? -1 : 1));
    const vis = visits.filter(v => inWin(v.date));
    return { occs: live, visits: vis, notes: notes.filter(n => !n.date || inWin(n.date) || n.kind === 'unplaced'), dates: winDates, hol };
  }

  function companyName(plan, id) { const c = plan.companies.find(c => c.id === id); return c ? c.name : id; }
  function personName(plan, id) { const p = personOf(plan, id); return p ? p.name : id; }

  /* ---------- issues ---------- */
  function issues(plan, gen) {
    const st = plan.settings;
    const out = gen.notes.slice();
    const byPD = {};
    gen.occs.forEach(o => o.people.forEach(p => { (byPD[p + '|' + o.date] = byPD[p + '|' + o.date] || []).push(o); }));
    const maxMins = (st.maxHours || 9) * 60;
    Object.keys(byPD).forEach(k => {
      const [p, date] = k.split('|');
      const list = byPD[k].slice().sort((a, b) => T.m(a.start) - T.m(b.start));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const ov = overlapMins(list[i], list[j]);
        if (ov > 0) out.push({ level: 'clash', kind: 'overlap', date, person: p, keys: [list[i].key, list[j].key],
          text: `${personName(plan, p)} is booked twice for ${T.hrs(ov)} h: ${list[i].title} (${list[i].start}–${list[i].end}) and ${list[j].title} (${list[j].start}–${list[j].end}).` });
      }
      const total = unionMins(list, st);
      if (total > maxMins) out.push({ level: 'warn', kind: 'overload', date, person: p, keys: list.map(o => o.key),
        text: `${personName(plan, p)} has ${T.hrs(total)} h of work on ${D.nice(date)} (limit ${st.maxHours || 9} h).` });
    });
    const la = T.m(st.lunchStart), lb = T.m(st.lunchEnd);
    gen.occs.forEach(o => {
      if (T.m(o.start) >= la && T.m(o.end) <= lb && T.m(o.end) > T.m(o.start)) out.push({ level: 'warn', kind: 'lunch', date: o.date, keys: [o.key], text: `${o.title} on ${D.nice(o.date)} is in the lunch slot (${st.lunchStart}–${st.lunchEnd}). Lunch is kept free.` });
      if (gen.hol[o.date]) out.push({ level: 'warn', kind: 'holiday', date: o.date, keys: [o.key], text: `${o.title} is on a holiday (${gen.hol[o.date]}, ${D.nice(o.date)}).` });
      if (!o.people.length) out.push({ level: 'warn', kind: 'nobody', date: o.date, keys: [o.key], text: `${o.title} on ${D.nice(o.date)} has nobody assigned.` });
    });
    // Max days per run (outstation)
    const runCount = {};
    gen.occs.forEach(o => { const t = plan.tasks.find(t => t.id === o.taskId); if (t && t.maxDays && o.runKey) o.people.forEach(p => { const k = o.runKey + '|' + p; runCount[k] = (runCount[k] || 0) + 1; }); });
    Object.keys(runCount).forEach(k => {
      const [rk, p] = k.split('|'); const t = plan.tasks.find(t => t.id === rk.split('@')[0]);
      if (runCount[k] > t.maxDays) out.push({ level: 'warn', kind: 'maxdays', person: p, date: null, text: `${personName(plan, p)} has ${runCount[k]} days of ${t.title} in ${rk.split('@')[1]}; the limit is ${t.maxDays}.` });
    });
    // Visits on a day the person isn't on that site run
    gen.visits.forEach(v => {
      const ok = gen.occs.some(o => o.runKey === v.runKey && o.date === v.date && o.people.includes(v.person));
      if (!ok) out.push({ level: 'warn', kind: 'visit', date: v.date, person: v.person, text: `${companyName(plan, v.company)} site day on ${D.nice(v.date)}: ${personName(plan, v.person)} is not on that measurement run that day.` });
    });
    // Two people at the same company the same day / company split over days
    const order = { clash: 0, warn: 1, info: 2 };
    return out.sort((a, b) => (order[a.level] - order[b.level]) || ((a.date || '') < (b.date || '') ? -1 : 1));
  }

  /* ---------- statistics ---------- */
  function workingDates(plan, gen) {
    return gen.dates.filter(s => !gen.hol[s] && !(D.dow(s) === 0 && plan.settings.sundayOff));
  }
  function stats(plan, gen) {
    const cap = capacityMins(plan);
    const wd = workingDates(plan, gen);
    const per = {};
    plan.people.forEach(p => { per[p.id] = { id: p.id, mins: 0, byType: {}, byDate: {}, byWeek: {}, byMonth: {}, byCompany: {}, tasks: 0, done: 0, visits: 0, daysWorked: 0 }; });
    gen.occs.forEach(o => o.people.forEach(pid => {
      const s = per[pid]; if (!s) return;
      s.mins += o.mins; s.tasks++; if (o.status === 'done') s.done++;
      s.byType[o.type] = (s.byType[o.type] || 0) + o.mins;
      s.byDate[o.date] = (s.byDate[o.date] || 0) + o.mins;
      const wk = D.weekStart(o.date); s.byWeek[wk] = (s.byWeek[wk] || 0) + o.mins;
      const mo = D.month(o.date); s.byMonth[mo] = (s.byMonth[mo] || 0) + o.mins;
      if (o.companies.length && !o.siteGroup) o.companies.forEach(c => { s.byCompany[c] = (s.byCompany[c] || 0) + o.mins / o.companies.length; });
    }));
    // Site time goes to the company visited that day; the rest of a site run is sheet work
    gen.visits.forEach(v => {
      const s = per[v.person]; if (!s) return;
      const o = gen.occs.find(o => o.runKey === v.runKey && o.date === v.date && o.people.includes(v.person));
      s.byCompany[v.company] = (s.byCompany[v.company] || 0) + (o ? o.mins : cap);
      s.visits++;
    });
    // Booked time per day counts overlapping bookings once
    const pd = {};
    gen.occs.forEach(o => o.people.forEach(pid => { (pd[pid + '|' + o.date] = pd[pid + '|' + o.date] || []).push(o); }));
    Object.values(per).forEach(s => { s.byDate = {}; s.booked = 0; });
    Object.keys(pd).forEach(k => { const [pid, d] = k.split('|'); const s = per[pid]; if (!s) return; const u = unionMins(pd[k], plan.settings); s.byDate[d] = u; s.booked += u; });
    Object.values(per).forEach(s => {
      s.daysWorked = Object.keys(s.byDate).length;
      s.capacity = wd.length * cap;
      s.util = s.capacity ? s.booked / s.capacity : 0;
      const vals = wd.map(d => s.byDate[d] || 0);
      s.peak = Math.max(0, ...vals);
      s.peakDate = wd.find(d => (s.byDate[d] || 0) === s.peak) || null;
      s.freeDays = wd.filter(d => (s.byDate[d] || 0) <= 60).length;
      s.avgDay = s.daysWorked ? s.mins / s.daysWorked : 0;
    });
    const totals = Object.values(per).map(s => s.booked);
    return { per, cap, workingDays: wd, summary: describe(totals) };
  }
  function describe(arr) {
    const n = arr.length; if (!n) return { n: 0, mean: 0, median: 0, sd: 0, cv: 0, min: 0, max: 0, range: 0 };
    const s = arr.slice().sort((a, b) => a - b);
    const mean = s.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    // Gini coefficient of workload (0 = perfectly even, 1 = one person does everything)
    let gini = 0; if (mean > 0) { let acc = 0; s.forEach((x, i) => { acc += (2 * (i + 1) - n - 1) * x; }); gini = acc / (n * n * mean); }
    return { n, mean, median, sd, cv: mean ? sd / mean : 0, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], gini };
  }

  /* ---------- day sheets (advance & billing days) ---------- */
  function slotPlan(plan, o, steps) {
    // Split the occurrence's working time evenly between its companies, skipping lunch.
    const st = plan.settings;
    const comps = o.companies.length ? o.companies : ['general'];
    const total = o.mins; const each = Math.floor(total / comps.length / 5) * 5 || 5;
    const la = T.m(st.lunchStart), lb = T.m(st.lunchEnd);
    let cur = T.m(o.start); const rows = [];
    comps.forEach((c, i) => {
      if (cur >= la && cur < lb) cur = lb;
      let s = cur, left = (i === comps.length - 1) ? (T.m(o.end) - cur - (cur < la && T.m(o.end) > lb ? (lb - la) : 0)) : each, e = s;
      while (left > 0) { const stop = (e < la) ? Math.min(la, e + left) : e + left; left -= (stop - e); e = stop; if (left > 0 && e === la) e = lb; }
      rows.push({ company: c, start: T.s(s), end: T.s(e), steps });
      cur = e;
    });
    return rows;
  }

  g.Engine = { D, T, workMins, unionMins, generate, issues, stats, describe, capacityMins, personOf, personName, companyName, normPeople, overlapMins, slotPlan, workingDates };
})(typeof window !== 'undefined' ? window : globalThis);
