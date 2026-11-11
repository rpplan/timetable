/* Plan in memory, undo/redo, and saving through the chosen backend:
   - Firebase (Firestore), when assets/js/firebase-config.js is filled in, or
   - this browser, encrypted with B's password (local mode).
   Nothing is saved as readable text. */
(function (g) {
  'use strict';
  const PREF = 'works-timetable-prefs';      // only the light/dark choice; no office data
  const clone = o => JSON.parse(JSON.stringify(o));

  const Store = {
    plan: null, backend: null,
    undoStack: [], redoStack: [], listeners: [],
    prefs: { theme: 'auto' },

    loadPrefs() { try { const p = localStorage.getItem(PREF); if (p) Object.assign(this.prefs, JSON.parse(p)); } catch (e) { /* ignore */ } },
    savePrefs() { try { localStorage.setItem(PREF, JSON.stringify(this.prefs)); } catch (e) { /* ignore */ } },

    /* Called once after login with the decrypted / downloaded plan */
    start(plan, backend) {
      this.backend = backend;
      this.plan = migrate(plan);
      this.cleanUp();
    },
    save(silent) {
      this.plan.savedAt = new Date().toISOString();
      if (this.backend) this.backend.persist(this.plan);
      if (!silent) this.emit();
    },
    /* A newer copy arrived from another device (Firebase) */
    remote(plan) { this.plan = migrate(plan); this.undoStack = []; this.redoStack = []; this.emit(); },

    /* Every change goes through here so it can be undone. */
    change(label, fn) {
      this.undoStack.push({ label, plan: clone(this.plan) });
      if (this.undoStack.length > 80) this.undoStack.shift();
      this.redoStack = [];
      fn(this.plan);
      this.save();
      return label;
    },
    undo() {
      const u = this.undoStack.pop(); if (!u) return null;
      this.redoStack.push({ label: u.label, plan: clone(this.plan) });
      this.plan = u.plan; this.save(); return u.label;
    },
    redo() {
      const r = this.redoStack.pop(); if (!r) return null;
      this.undoStack.push({ label: r.label, plan: clone(this.plan) });
      this.plan = r.plan; this.save(); return r.label;
    },
    replace(plan, label) {
      const keepPin = this.plan.settings.bPin;
      this.change(label || 'Load plan', p => { Object.keys(p).forEach(k => delete p[k]); Object.assign(p, migrate(clone(plan))); if (!p.settings.bPin) p.settings.bPin = keepPin; });
    },

    /* Daily clean-up: N, R, S, P records older than the retention period (45 days) are deleted. B's are kept. */
    cleanUp() {
      const n = purge(this.plan, todayStr());
      if (n) { this.save(true); this.purged = n; }
      return n;
    },
    deleteB(before, kinds) { return this.change('Deleted B\'s records before ' + before, p => deleteBRecords(p, before, kinds)); },
    on(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach(fn => fn()); },
    clone
  };

  const STORES = ['overrides', 'visitOverrides', 'runDays', 'status', 'reviews', 'away', 'remarks', 'importance', 'clear', 'leave', 'targets', 'followups', 'admin', 'workOn', 'actions', 'badmin'];
  function migrate(p) {
    const d = g.DEFAULT_PLAN;
    p = p || {};
    STORES.forEach(k => { if (!p[k] || typeof p[k] !== 'object' || Array.isArray(p[k])) p[k] = {}; });
    if (!Array.isArray(p.extra)) p.extra = [];
    ['holidays', 'people', 'companies', 'tasks', 'notes'].forEach(k => { if (!Array.isArray(p[k])) p[k] = clone(d[k]); });
    if (!p.responsibilities) p.responsibilities = {};
    p.people.forEach(x => { if (!p.responsibilities[x.id]) p.responsibilities[x.id] = { main: [], outstation: [], other: [], duties: '' }; if (!Array.isArray(x.offDays)) x.offDays = []; });
    p.settings = Object.assign({}, clone(d.settings), p.settings || {});
    if (!Array.isArray(p.settings.slots) || !p.settings.slots.length) p.settings.slots = clone(d.settings.slots);
    if (!Array.isArray(p.settings.adminHours)) p.settings.adminHours = clone(d.settings.adminHours);
    if (!p.settings.windows) p.settings.windows = clone(d.settings.windows);
    if (!p.chart || typeof p.chart !== 'object') p.chart = { pos: {} };
    if (!p.chart.pos) p.chart.pos = {};
    p.tasks.forEach(t => {
      (t.agenda || []).forEach(a => { if (!Array.isArray(a.owners)) a.owners = a.owner ? [a.owner] : []; delete a.owner; });
      if (t.fillDays && !t.assign) { t.assign = 'perDay'; } delete t.fillDays;
    });
    if ((p.version || 1) < 7) {
      p.settings.sundayStreak = false;                                   // Sunday is a day off for everyone
      Object.keys(p.importance).forEach(k => { if (p.importance[k] !== 'high') delete p.importance[k]; });   // only High / Normal
      p.tasks.forEach(t => { if (t.importance && t.importance !== 'high') t.importance = ''; });
      p.extra.forEach(x => { if (x.importance && x.importance !== 'high') x.importance = ''; });
      const n = p.responsibilities.N;                                    // as asked: N's two other contractors in the opposite order
      if (n && Array.isArray(n.other) && n.other.length === 2 && !p.settings.orderSwapped) { n.other = n.other.slice().reverse(); p.settings.orderSwapped = true; }
    }
    if (!p.paySheets || typeof p.paySheets !== 'object') p.paySheets = {};
    if (!Array.isArray(p.marks)) p.marks = [];
    if (!Array.isArray(p.commits)) p.commits = [];
    if (!p.meetDays || typeof p.meetDays !== 'object') p.meetDays = {};
    if (!p.files || typeof p.files !== 'object') p.files = {};
    if (p.billList) { p.files.all = Object.assign({}, p.files.all, { bill: p.billList }); }   // the old list for all companies is kept and still searched
    delete p.billList;
    if ((p.version || 1) < 8) {
      if (p.settings.end < '2026-12-31') p.settings.end = '2026-12-31';      // timetable runs to 31 December 2026
      const fix = s => typeof s === 'string' ? s.replace(/P \/ P1/g, 'P').replace(/\bP\/P1\b/g, 'P').replace(/\bP1\b/g, 'P') : s;   // "P1" is called "P" everywhere
      p.people.forEach(x => { x.name = fix(x.name); x.role = fix(x.role); });
      Object.values(p.responsibilities).forEach(r => { r.duties = fix(r.duties); });
      p.tasks.forEach(t => { t.title = fix(t.title); t.details = fix(t.details); (t.agenda || []).forEach(a => { a.item = fix(a.item); }); });
      p.notes = p.notes.map(fix);
    }
    p.version = 8;
    return p;
  }

  /* Records from an old (version 5 or earlier) copy kept in this browser, brought into a new plan */
  function mergeRecords(into, old) {
    ['remarks', 'clear', 'importance', 'leave', 'targets', 'followups', 'admin', 'status', 'away'].forEach(k => Object.assign(into[k], old[k] || {}));
    into.reviews.days = Object.assign({}, (old.reviews || {}).days || {}, into.reviews.days || {});
    into.reviews.pay = Object.assign({}, (old.reviews || {}).pay || {}, into.reviews.pay || {});
    if (old.settings && old.settings.bPin && !into.settings.bPin) into.settings.bPin = old.settings.bPin;
    return into;
  }

  function todayStr() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
  function addDays(s, n) { const [y, m, dd] = s.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd + n)); return x.toISOString().slice(0, 10); }
  const B = 'B';
  function dateOfKey(k, extraDate) { const m = k.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; const x = k.match(/^x:[^|~]+/); return x ? extraDate[x[0]] : null; }

  function purge(p, today) {
    const keep = Number(p.settings.retentionDays) || 0; if (!keep) return 0;
    const cut = addDays(today, -keep);
    const extraDate = {}; p.extra.forEach(x => { extraDate['x:' + x.id] = x.date; });
    let n = 0;
    ['remarks', 'clear', 'importance'].forEach(st => Object.keys(p[st]).forEach(k => {
      const pid = k.slice(k.lastIndexOf('|') + 1), d = dateOfKey(k, extraDate);
      if (pid !== B && d && d < cut) { delete p[st][k]; n++; }
    }));
    ['leave', 'workOn'].forEach(st => Object.keys(p[st]).forEach(k => { const [pid, d] = k.split('|'); if (pid !== B && d < cut) { delete p[st][k]; n++; } }));
    ['overrides', 'status'].forEach(st => Object.keys(p[st]).forEach(k => {
      if (k.startsWith('x:')) return;
      const d = dateOfKey(k, extraDate); if (!d || d >= cut) return;
      const t = p.tasks.find(x => x.id === k.split('@')[0]);
      const ppl = (p.overrides[k] && p.overrides[k].people) || (t ? t.people : []);
      if (!ppl.includes(B)) { delete p[st][k]; n++; }
    }));
    p.extra = p.extra.filter(x => { if (x.date < cut && !(x.people || []).includes(B)) { n++; return false; } return true; });
    return n;
  }

  function deleteBRecords(p, before, kinds) {
    const k = new Set(kinds || []);
    const extraDate = {}; p.extra.forEach(x => { extraDate['x:' + x.id] = x.date; });
    const old = key => { const d = dateOfKey(key, extraDate); return d && d < before; };
    if (k.has('timetable')) {
      ['remarks', 'clear', 'importance'].forEach(st => Object.keys(p[st]).forEach(key => { if (key.endsWith('|' + B) && old(key)) delete p[st][key]; }));
      p.extra = p.extra.filter(x => !(x.date < before && (x.people || []).length === 1 && x.people[0] === B));
    }
    if (k.has('checks')) { const days = (p.reviews.days || {}); Object.keys(days).forEach(d => { if (d < before) delete days[d]; }); }
    if (k.has('pay')) { const pay = (p.reviews.pay || {}); Object.keys(pay).forEach(key => { if (old(key)) delete pay[key]; }); }
    if (k.has('targets')) Object.keys(p.targets).forEach(key => { if ((p.targets[key].d || '') < before) delete p.targets[key]; });
    if (k.has('marks')) p.marks = (p.marks || []).filter(m => !m.cells.every(c => c.date < before));
    if (k.has('followups')) { Object.keys(p.followups).forEach(key => { if (old(key)) delete p.followups[key]; }); Object.keys(p.actions || {}).forEach(key => { if (old(key)) delete p.actions[key]; }); }
    if (k.has('admin')) { Object.keys(p.admin).forEach(d => { if (d < before) delete p.admin[d]; }); const b = p.badmin || {}; [b.days, (b.ppv || {}).days, (b.arch || {}).days].forEach(o => Object.keys(o || {}).forEach(d => { if (d < before) delete o[d]; })); }
  }

  /* Update file (setup/update-*.json): private details that must not be in the public website code */
  function applyUpdate(p, u) {
    if (!u || u.kind !== 'works-timetable-update') throw new Error('not an update file');
    const done = [];
    if (u.engineers) { Object.keys(u.engineers).forEach(cid => { const c = p.companies.find(x => x.id === cid); if (c && !(c.engineers || []).length) { c.engineers = clone(u.engineers[cid]); done.push(c.name); } }); }
    if (u.badmin) {
      const b = p.badmin = p.badmin || {}; const keep = { days: b.days || {}, ppv: (b.ppv || {}).days || {}, arch: (b.arch || {}).days || {}, listText: b.listText || {} };
      Object.assign(b, clone(u.badmin));
      b.days = keep.days; b.listText = keep.listText;
      if (b.ppv) b.ppv.days = keep.ppv; if (b.arch) b.arch.days = keep.arch;
      done.push('B admin');
    }
    if (u.tasks) u.tasks.forEach(t => { if (!p.tasks.some(x => x.id === t.id)) { p.tasks.push(clone(t)); done.push(t.title); } });
    return done;
  }

  Object.assign(Store, { applyUpdate, migrate, purge, deleteBRecords, mergeRecords, dateOfKey });
  g.Store = Store;
})(window);
