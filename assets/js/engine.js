/* Scheduling engine: turns the plan (monthly template + edits) into dated occurrences,
   fits every person's day into the working slots, finds clashes, and computes statistics.
   Pure functions, no DOM. */
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

  /* ---------- working slots ---------- */
  // Slots in minutes, e.g. [[630,810],[870,1140]] for 10:30-13:30 and 14:30-19:00
  function slotsOf(st) {
    const s = (st.slots && st.slots.length) ? st.slots
      : [{ start: st.workStart || '10:30', end: st.lunchStart || '13:30' }, { start: st.lunchEnd || '14:30', end: st.workEnd || '19:00' }];
    return s.map(x => [T.m(x.start), T.m(x.end)]).filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
  }
  // Gaps between slots (not working time)
  function gapsOf(st) { const s = slotsOf(st), out = []; for (let i = 1; i < s.length; i++) if (s[i][0] > s[i - 1][1]) out.push([s[i - 1][1], s[i][0]]); return out; }
  function inGap(t, st) { const m = T.m(t); return gapsOf(st).some(gp => m >= gp[0] && m < gp[1]); }

  /* ---------- interval helpers (minutes) ---------- */
  function subtract(ivs, cut) {
    const out = [];
    ivs.forEach(([a, b]) => {
      if (cut[1] <= a || cut[0] >= b) { out.push([a, b]); return; }
      if (cut[0] > a) out.push([a, cut[0]]);
      if (cut[1] < b) out.push([cut[1], b]);
    });
    return out;
  }
  function intersect(ivs, cut) { return ivs.map(([x, y]) => [Math.max(x, cut[0]), Math.min(y, cut[1])]).filter(([x, y]) => y > x); }
  function minusGaps(a, b, st) { let iv = b > a ? [[a, b]] : []; gapsOf(st).forEach(gp => { iv = subtract(iv, gp); }); return iv; }
  function sumIv(ivs) { return ivs.reduce((s, p) => s + p[1] - p[0], 0); }
  function mergeIv(ivs) {
    const iv = ivs.filter(x => x[1] > x[0]).map(x => x.slice()).sort((a, b) => a[0] - b[0]), out = [];
    iv.forEach(x => { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x); });
    return out;
  }
  function overlapIv(a, b) { let m = 0; a.forEach(x => b.forEach(y => { m += Math.max(0, Math.min(x[1], y[1]) - Math.max(x[0], y[0])); })); return m; }
  function partsText(parts) { return parts.map(p => `${T.s(p[0])}–${T.s(p[1])}`).join(', '); }

  /* Working minutes between start and end, with the break between slots removed. */
  function workMins(start, end, st) { return sumIv(minusGaps(T.m(start), T.m(end), st)); }

  /* ---------- helpers ---------- */
  function holidayMap(plan) { const m = {}; (plan.holidays || []).forEach(h => { m[h.date] = h.name || 'Holiday'; }); return m; }
  function capacityMins(plan) { return sumIv(slotsOf(plan.settings)); }
  function personOf(plan, id) {
    if (!id) return null;
    return plan.people.find(p => p.id === id) || plan.people.find(p => (p.aliases || []).includes(id)) || null;
  }
  function normPeople(plan, arr) {
    const out = [];
    (arr || []).forEach(id => { const p = personOf(plan, id); const pid = p ? p.id : id; if (!out.includes(pid)) out.push(pid); });
    return out;
  }
  function personOff(plan, pid, date) { const p = personOf(plan, pid); return !!(p && (p.offDays || []).includes(D.dow(date))); }
  function unionMins(list, st) { return sumIv(mergeIv(list.map(o => [T.m(o.start), T.m(o.end)]))); }
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
    const pOff = (pid, s) => personOff(plan, pid, s);
    const offFor = (s, ppl, streak) => isOff(s, streak) || ppl.some(pid => pOff(pid, s));
    const why = (s, ppl) => hol[s] || (D.dow(s) === 0 ? 'Sunday' : '') || ppl.filter(pid => pOff(pid, s)).map(pid => `${personName(plan, pid)}'s day off`).join(', ') || 'day off';
    const taskById = {}; plan.tasks.forEach(t => { taskById[t.id] = t; });

    const occs = [];
    const notes = [];
    const book = {};    // person|date -> [occ]
    const addBook = o => o.people.forEach(p => { (book[p + '|' + o.date] = book[p + '|' + o.date] || []).push(o); });

    function makeOcc(t, key, planned, date, extra) {
      return Object.assign({
        key, taskId: t.id, title: t.title, type: t.type || 'office', planned, date,
        people: normPeople(plan, t.people), start: t.start, end: t.end,
        companies: (t.companies || []).slice(), details: t.details || '',
        siteGroup: t.siteGroup || null, cycle: t.cycle || null, runKey: null, noSite: !!t.noSite,
        shifted: false, moved: false, extra: false
      }, extra || {});
    }

    // Months that touch the window (plus the month before, so a run that started earlier is complete)
    const months = [];
    { let y = Number(st.start.slice(0, 4)), m = Number(st.start.slice(5, 7)) - 1; if (m === 0) { m = 12; y--; }
      const endKey = st.end.slice(0, 7);
      while (true) { const k = `${y}-${String(m).padStart(2, '0')}`; months.push([y, m, k]); if (k >= endKey) break; m++; if (m > 12) { m = 1; y++; } } }

    // Pass 1: monthly runs.
    //  "shift" work (meetings, billing, advances) moves when the date is a holiday or a day off for anyone in it.
    //  "skip" work (site runs, office streaks) is skipped on holidays; people on their weekly day off are left out.
    const pending = [];
    plan.tasks.filter(t => (t.mode || 'monthly') === 'monthly').forEach(t => {
      const ppl = normPeople(plan, t.people);
      months.forEach(([y, m, mk]) => {
        const ml = D.monthLen(y, m);
        const days = (t.days || []).filter(d => d >= 1 && d <= ml).sort((a, b) => a - b);
        if (!days.length) return;
        const runKey = `${t.id}@${mk}`;
        const streak = days.length > 1;
        days.map(d => `${mk}-${String(d).padStart(2, '0')}`).forEach(p => {
          const key = `${t.id}@${p}`;
          if ((t.holiday || 'shift') === 'shift') {
            if (!offFor(p, ppl, streak)) occs.push(makeOcc(t, key, p, p, { runKey }));
            else pending.push({ t, key, planned: p, runKey, streak, reason: why(p, ppl) });
            return;
          }
          if (isOff(p, streak)) {
            if (inWin(p)) notes.push({ level: 'info', kind: 'skipped', key, date: p, taskId: t.id, text: `${t.title} is not held on ${D.nice(p)} (${hol[p] || 'Sunday'}).` });
            return;
          }
          const here = ppl.filter(pid => !pOff(pid, p));
          if (!here.length) return;
          occs.push(makeOcc(t, key, p, p, { runKey, people: here, offToday: ppl.filter(x => !here.includes(x)) }));
        });
      });
    });

    // One-off work added by hand
    (plan.extra || []).forEach(x => {
      const t = Object.assign({ type: 'office' }, x);
      occs.push(makeOcc(t, `x:${x.id}`, x.date, x.date, { extra: true, taskId: `x:${x.id}` }));
    });

    // Daily tasks (not on anyone's weekly day off)
    const anyWork = new Set(occs.map(o => o.date));
    plan.tasks.filter(t => t.mode === 'daily').forEach(t => {
      const ppl = normPeople(plan, t.people);
      winDates.forEach(s => {
        if (hol[s]) return;
        if (isOff(s, false) && !anyWork.has(s)) return;
        const here = ppl.filter(pid => !pOff(pid, s));
        if (!here.length) return;
        occs.push(makeOcc(t, `${t.id}@${s}`, s, s, { people: here }));
      });
    });

    const applyOverride = o => {
      const ov = plan.overrides && plan.overrides[o.key];
      if (!ov) return true;
      if (ov.deleted) return false;
      ['date', 'start', 'end', 'title', 'note'].forEach(k => { if (ov[k] != null && ov[k] !== '') o[k] = ov[k]; });
      if (ov.people) o.people = normPeople(plan, ov.people);
      if (ov.companies) o.companies = ov.companies.slice();
      if (ov.date && ov.date !== o.planned) o.moved = true;
      if (ov.start || ov.end) o.timeSet = true;     // times set by hand are kept as they are
      o.overridden = true;
      return true;
    };
    let live = occs.filter(applyOverride);

    // Office work for someone who is outstation that day moves to another day (meetings are just skipped by them)
    const outPD = {};
    live.forEach(o => { if (o.type !== 'outstation') return; const ch = (plan.away || {})[o.runKey] || {}; o.people.forEach(pid => { if (ch[pid] !== false) outPD[pid + '|' + o.date] = true; }); });
    live = live.filter(o => {
      const t = taskById[o.taskId];
      if (!t || o.type === 'outstation' || o.type === 'meeting' || o.type === 'review' || o.overridden || (t.holiday || 'shift') !== 'shift') return true;
      const gone = o.people.filter(pid => outPD[pid + '|' + o.date]);
      if (!gone.length) return true;
      pending.push({ t, key: o.key, planned: o.planned, runKey: o.runKey, reason: `${gone.map(pid => personName(plan, pid)).join(', ')} outstation` });
      return false;
    });
    live.forEach(addBook);

    // Pass 2: shift to the best of the next 3 days that are working days for everyone in it, with least overlap
    const lastShift = {};
    pending.sort((a, b) => a.planned < b.planned ? -1 : 1).forEach(p => {
      const ov = plan.overrides && plan.overrides[p.key];
      if (p.planned < st.start && !(ov && ov.date)) return;   // planned before the timetable starts: not carried in
      const t = p.t;
      let date = (lastShift[p.runKey] && lastShift[p.runKey] > p.planned) ? lastShift[p.runKey] : p.planned, tries = 0;
      const ppl = normPeople(plan, (ov && ov.people) || t.people);
      const s0 = (ov && ov.start) || t.start, e0 = (ov && ov.end) || t.end;
      const cands = [];
      while (cands.length < 3 && tries < 40) { date = D.add(date, 1); tries++; if (!offFor(date, ppl, false) && (t.type === 'meeting' || !ppl.some(pp => outPD[pp + '|' + date]))) cands.push(date); }
      const clashMins = c => ppl.reduce((sum, pp) => sum + (book[pp + '|' + c] || []).reduce((a, b) => a + overlapMins(b, { start: s0, end: e0 }) * (b.type === 'meeting' || b.type === t.type ? 3 : 1), 0), 0);
      date = cands.slice().sort((a, b) => clashMins(a) - clashMins(b) || (a < b ? -1 : 1))[0] || D.add(p.planned, 1);
      lastShift[p.runKey] = date;
      const o = makeOcc(t, p.key, p.planned, date, { runKey: p.runKey, shifted: true });
      if (!applyOverride(o)) return;
      live.push(o); addBook(o);
      if (inWin(o.date) || inWin(p.planned)) notes.push({ level: 'info', kind: 'shifted', key: p.key, date: o.date, taskId: t.id,
        text: `${t.title} moved from ${D.nice(p.planned)} (${p.reason}) to ${D.nice(o.date)}.` });
    });

    // Weekly work (PPV for S) placed on priority, before the site runs are thinned out.
    // Prefers days the person is not outstation; a site day is fine, the person then stays in the office.
    const weeks = [...new Set(winDates.map(D.weekStart))];
    plan.tasks.filter(t => t.mode === 'weekly').forEach(t => {
      const ppl = normPeople(plan, t.people);
      const per = Math.max(1, t.perWeek || 1);
      weeks.forEach(ws => {
        const score = s => ppl.reduce((sum, pp) => sum + (book[pp + '|' + s] || []).reduce((a, b) =>
          a + (b.type === 'outstation' ? 100 : (b.type === 'billing' || b.type === 'advance') ? 5 : 0), 0), 0);
        const cands = D.range(ws, D.add(ws, 6)).filter(s => inWin(s) && !offFor(s, ppl, false))
          .sort((a, b) => score(a) - score(b) || (a < b ? -1 : 1));
        const fixedDates = [];
        for (let i = 0; i < per; i++) { const ov = plan.overrides && plan.overrides[`${t.id}@${ws}#${i + 1}`]; if (ov && ov.date) fixedDates.push(ov.date); }
        fixedDates.forEach(d => { const k = cands.indexOf(d); if (k >= 0) cands.splice(k, 1); });
        for (let i = 0; i < per; i++) {
          const key = `${t.id}@${ws}#${i + 1}`;
          const ov = plan.overrides && plan.overrides[key];
          if (ov && ov.deleted) continue;
          const date = (ov && ov.date) || cands.shift();
          if (!date) {
            notes.push({ level: 'warn', kind: 'unplaced', key, date: ws, taskId: t.id,
              text: `${t.title}: no working day left for day ${i + 1} in the week of ${D.nice(ws, { short: true })}.` });
            continue;
          }
          const o = makeOcc(t, key, ws, date, { flex: true });
          applyOverride(o);
          live.push(o); addBook(o);
        }
      });
    });

    // Office-only days: people on "no site measurement" work (billing, advances, PPV...) are taken off site work that day
    const office = {};
    live.forEach(o => { if (o.noSite) o.people.forEach(pid => { const k = pid + '|' + o.date; if (!office[k]) office[k] = o.title; }); });
    live.forEach(o => {
      if (o.type !== 'site' && o.type !== 'outstation') return;
      if (plan.overrides[o.key] && plan.overrides[o.key].people) return;
      const gone = o.people.filter(pid => office[pid + '|' + o.date]);
      if (gone.length) { o.inOffice = gone.map(pid => ({ pid, why: office[pid + '|' + o.date] })); o.people = o.people.filter(pid => !gone.includes(pid)); }
    });

    // Outstation: who actually goes (the user can choose per run); they skip meetings and in-town site work those days
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

    // A site run left with nobody because everyone is in the office or outstation is not shown
    live = live.filter(o => o.people.length || !((o.inOffice && o.inOffice.length) || (o.away && o.away.length)));
    live.forEach(o => { o.status = (plan.status && plan.status[o.key]) || 'planned'; o.mins = workMins(o.start, o.end, st); });

    // Site visits: each person's companies get their own day inside each site run.
    const visits = [];
    const runs = {};
    live.filter(o => o.siteGroup && o.runKey).forEach(o => { (runs[o.runKey] = runs[o.runKey] || []).push(o); });
    Object.keys(runs).forEach(rk => {
      const list = runs[rk].sort((a, b) => a.date < b.date ? -1 : 1);
      const t = taskById[list[0].taskId];
      const ppl = normPeople(plan, t.people);
      const pDates = {}; ppl.forEach(pid => { pDates[pid] = list.filter(o => o.people.includes(pid)).map(o => o.date); });
      const taken = {}, usedBy = {};
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
      plan.companies.filter(c => c.together && ppl.some(pid => has(pid, c.id))).forEach(c => {
        const holders = ppl.filter(pid => has(pid, c.id) && pDates[pid].length);
        if (!holders.length) return;
        const common = pDates[holders[0]].filter(d => holders.every(h => pDates[h].includes(d) && !taken[h].has(d)));
        holders.forEach(h => push(c.id, h, common[0] || null, holders.length > 1));
      });
      ppl.forEach(pid => {
        (((plan.responsibilities[pid] || {})[t.siteGroup]) || []).forEach(cid => {
          if (comp(cid).together) return;
          const d = pDates[pid].find(x => !taken[pid].has(x) && !(usedBy[cid] && usedBy[cid].has(x)));
          push(cid, pid, d || null);
        });
      });
    });

    live = live.filter(o => inWin(o.date)).sort((a, b) => a.date === b.date ? T.m(a.start) - T.m(b.start) : (a.date < b.date ? -1 : 1));

    // Fit each person's day into the working slots
    const sched = {};
    live.forEach(o => o.people.forEach(pid => { (sched[pid + '|' + o.date] = sched[pid + '|' + o.date] || []).push({ key: o.key, o, pid, date: o.date, parts: [], mins: 0 }); }));
    const slots = slotsOf(st);
    Object.keys(sched).forEach(k => { packDay(sched[k], slots, st); });

    const vis = visits.filter(v => inWin(v.date));
    return { occs: live, visits: vis, sched, slots, notes: notes.filter(n => !n.date || inWin(n.date) || n.kind === 'unplaced'), dates: winDates, hol };
  }

  /* One person's day. Fixed work (meetings, B's check, work added by hand, times set by hand) keeps its time.
     Everything else is fitted into the free part of the slots: each slot holds one work, so two different
     works share the day as Slot 1 and Slot 2. Work that finds no free time is marked "no time". */
  function packDay(entries, slots, st) {
    const touchesSlot = o => slots.some(s => Math.min(T.m(o.end), s[1]) > Math.max(T.m(o.start), s[0]));
    entries.forEach(e => { e.fixed = e.o.type === 'meeting' || e.o.type === 'review' || !!e.o.extra || !!e.o.timeSet || !touchesSlot(e.o); });
    let free = slots.map(s => s.slice());
    entries.filter(e => e.fixed).forEach(e => { e.parts = minusGaps(T.m(e.o.start), T.m(e.o.end), st); e.parts.forEach(p => { free = subtract(free, p); }); });
    const flex = entries.filter(e => !e.fixed);
    flex.forEach(e => {
      const a = T.m(e.o.start), b = T.m(e.o.end);
      e.want = slots.map((s, i) => i).filter(i => Math.min(b, slots[i][1]) > Math.max(a, slots[i][0]));
      e.keep = e.o.type === 'outstation';           // an outstation day is not split with office work
      e.slots = [];
    });
    flex.sort((x, y) => (y.keep - x.keep) || (x.want.length - y.want.length) || (T.m(x.o.start) - T.m(y.o.start)) || (x.key < y.key ? -1 : 1));
    const owner = {};
    const freeIn = (i, a, b) => intersect(intersect(free, slots[i]), [a, b]);
    flex.forEach(e => {
      const a = T.m(e.o.start), b = T.m(e.o.end);
      e.want.forEach(i => { if (owner[i]) return; const part = freeIn(i, a, b); if (part.length) { e.parts.push(...part); e.slots.push(i); owner[i] = e; } });
      if (e.parts.length) return;
      // Take one slot from work that holds more than one slot
      const i = e.want.slice().reverse().find(j => owner[j] && !owner[j].keep && owner[j].slots.length > 1);
      if (i != null) {
        const donor = owner[i];
        donor.parts = donor.parts.filter(p => !(p[0] >= slots[i][0] && p[1] <= slots[i][1]));
        donor.slots = donor.slots.filter(j => j !== i);
        const part = freeIn(i, a, b); e.parts.push(...part); e.slots.push(i); owner[i] = e;
        return;
      }
      // Otherwise any free slot of the day
      const j = slots.map((s, k) => k).find(k => !owner[k] && intersect(free, slots[k]).length);
      if (j != null) { e.parts.push(...intersect(free, slots[j])); e.slots.push(j); owner[j] = e; return; }
      e.noTime = true;
    });
    entries.forEach(e => { e.parts = mergeIv(e.parts); e.mins = sumIv(e.parts); e.start = e.parts.length ? T.s(e.parts[0][0]) : e.o.start; });
    entries.sort((x, y) => (x.noTime - y.noTime) || ((x.parts[0] || [9999])[0] - (y.parts[0] || [9999])[0]));
  }

  function companyName(plan, id) { const c = plan.companies.find(c => c.id === id); return c ? c.name : id; }
  function personName(plan, id) { const p = personOf(plan, id); return p ? p.name : id; }

  /* ---------- issues ---------- */
  function issues(plan, gen) {
    const st = plan.settings;
    const out = gen.notes.slice();
    const maxMins = (st.maxHours || 9) * 60;
    Object.keys(gen.sched).forEach(k => {
      const [p, date] = k.split('|');
      const list = gen.sched[k];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const ov = overlapIv(list[i].parts, list[j].parts);
        if (ov > 0) out.push({ level: 'clash', kind: 'overlap', date, person: p, keys: [list[i].key, list[j].key],
          text: `${personName(plan, p)} is booked twice for ${T.hrs(ov)} h: ${list[i].o.title} (${partsText(list[i].parts)}) and ${list[j].o.title} (${partsText(list[j].parts)}).` });
      }
      list.filter(e => e.noTime).forEach(e => out.push({ level: 'warn', kind: 'notime', date, person: p, keys: [e.key],
        text: `${personName(plan, p)} has no free slot left for ${e.o.title} on ${D.nice(date)}. Move it to another day or another person.` }));
      const total = sumIv(mergeIv(list.flatMap(e => e.parts)));
      if (total > maxMins) out.push({ level: 'warn', kind: 'overload', date, person: p, keys: list.map(e => e.key),
        text: `${personName(plan, p)} has ${T.hrs(total)} h of work on ${D.nice(date)} (limit ${st.maxHours || 9} h).` });
    });
    gen.occs.forEach(o => {
      if (gen.hol[o.date]) out.push({ level: 'warn', kind: 'holiday', date: o.date, keys: [o.key], text: `${o.title} is on a holiday (${gen.hol[o.date]}, ${D.nice(o.date)}).` });
      if (!o.people.length) out.push({ level: 'warn', kind: 'nobody', date: o.date, keys: [o.key], text: `${o.title} on ${D.nice(o.date)} has nobody assigned.` });
    });
    const runCount = {};
    gen.occs.forEach(o => { const t = plan.tasks.find(t => t.id === o.taskId); if (t && t.maxDays && o.runKey) o.people.forEach(p => { const k = o.runKey + '|' + p; runCount[k] = (runCount[k] || 0) + 1; }); });
    Object.keys(runCount).forEach(k => {
      const [rk, p] = k.split('|'); const t = plan.tasks.find(t => t.id === rk.split('@')[0]);
      if (runCount[k] > t.maxDays) out.push({ level: 'warn', kind: 'maxdays', person: p, date: null, text: `${personName(plan, p)} has ${runCount[k]} days of ${t.title} in ${rk.split('@')[1]}; the limit is ${t.maxDays}.` });
    });
    gen.visits.forEach(v => {
      const ok = gen.occs.some(o => o.runKey === v.runKey && o.date === v.date && o.people.includes(v.person));
      if (!ok) out.push({ level: 'warn', kind: 'visit', date: v.date, person: v.person, text: `${companyName(plan, v.company)} site day on ${D.nice(v.date)}: ${personName(plan, v.person)} is not on that measurement run that day.` });
    });
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
    plan.people.forEach(p => { per[p.id] = { id: p.id, mins: 0, booked: 0, byType: {}, byDate: {}, byCompany: {}, tasks: 0, done: 0, visits: 0, daysWorked: 0 }; });
    Object.keys(gen.sched).forEach(k => {
      const [pid, d] = k.split('|'); const s = per[pid]; if (!s) return;
      const list = gen.sched[k];
      list.forEach(e => {
        if (!e.mins) return;
        s.mins += e.mins; s.tasks++; if (e.o.status === 'done') s.done++;
        s.byType[e.o.type] = (s.byType[e.o.type] || 0) + e.mins;
        if (e.o.companies.length && !e.o.siteGroup) e.o.companies.forEach(c => { s.byCompany[c] = (s.byCompany[c] || 0) + e.mins / e.o.companies.length; });
      });
      const u = sumIv(mergeIv(list.flatMap(e => e.parts)));
      if (u) { s.byDate[d] = u; s.booked += u; }
    });
    gen.visits.forEach(v => {
      const s = per[v.person]; if (!s) return;
      const e = (gen.sched[v.person + '|' + v.date] || []).find(x => x.o.runKey === v.runKey);
      s.byCompany[v.company] = (s.byCompany[v.company] || 0) + (e ? e.mins : cap);
      s.visits++;
    });
    Object.values(per).forEach(s => {
      const pdays = wd.filter(d => !personOff(plan, s.id, d));
      s.daysWorked = Object.keys(s.byDate).length;
      s.capacity = pdays.length * cap;
      s.util = s.capacity ? s.booked / s.capacity : 0;
      const vals = wd.map(d => s.byDate[d] || 0);
      s.peak = Math.max(0, ...vals);
      s.peakDate = wd.find(d => (s.byDate[d] || 0) === s.peak) || null;
      s.freeDays = pdays.filter(d => (s.byDate[d] || 0) <= 60).length;
      s.avgDay = s.daysWorked ? s.mins / s.daysWorked : 0;
    });
    return { per, cap, workingDays: wd, summary: describe(Object.values(per).map(s => s.booked)) };
  }
  function describe(arr) {
    const n = arr.length; if (!n) return { n: 0, mean: 0, median: 0, sd: 0, cv: 0, min: 0, max: 0, range: 0 };
    const s = arr.slice().sort((a, b) => a - b);
    const mean = s.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    let gini = 0; if (mean > 0) { let acc = 0; s.forEach((x, i) => { acc += (2 * (i + 1) - n - 1) * x; }); gini = acc / (n * n * mean); }
    return { n, mean, median, sd, cv: mean ? sd / mean : 0, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], gini };
  }

  /* ---------- day sheets (advance & billing days) ---------- */
  // Splits the time the people share on this work evenly between its companies.
  function slotPlan(plan, o, steps, gen) {
    let parts = null;
    if (gen) o.people.forEach(pid => {
      const e = (gen.sched[pid + '|' + o.date] || []).find(x => x.key === o.key); if (!e) return;
      parts = parts ? parts.flatMap(p => intersect(e.parts, p)) : e.parts.map(p => p.slice());
    });
    if (!parts) parts = minusGaps(T.m(o.start), T.m(o.end), plan.settings);
    parts = mergeIv(parts);
    const comps = o.companies.length ? o.companies : ['general'];
    const total = sumIv(parts); const each = Math.max(5, Math.floor(total / comps.length / 5) * 5);
    let pi = 0, cur = parts.length ? parts[0][0] : 0; const rows = [];
    comps.forEach((c, i) => {
      let left = i === comps.length - 1 ? Infinity : each; const segs = [];
      while (left > 0 && pi < parts.length) {
        if (cur >= parts[pi][1]) { pi++; if (pi < parts.length) cur = parts[pi][0]; continue; }
        const e = Math.min(parts[pi][1], cur + left); segs.push([cur, e]); left -= e - cur; cur = e;
      }
      rows.push({ company: c, segs, start: segs.length ? T.s(segs[0][0]) : '', end: segs.length ? T.s(segs[segs.length - 1][1]) : '', text: segs.length ? partsText(segs) : 'No time left', steps });
    });
    return rows;
  }

  g.Engine = { D, T, workMins, unionMins, generate, issues, stats, describe, capacityMins, personOf, personName, companyName, normPeople, overlapMins, slotPlan, workingDates,
    slotsOf, gapsOf, inGap, partsText, personOff, minusGaps };
})(typeof window !== 'undefined' ? window : globalThis);
