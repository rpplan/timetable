/* Plan storage: browser save, undo/redo, office copy (data/plan.json), share links. */
(function (g) {
  'use strict';
  const KEY = 'works-timetable-plan-v3';   // v3: two working slots, B off on weekends, office-only days
  const OLD_KEY = 'works-timetable-plan-v2';
  const PREF = 'works-timetable-prefs-v2';
  const clone = o => JSON.parse(JSON.stringify(o));

  const Store = {
    plan: null,
    officeCopy: null,       // what is in data/plan.json on the website
    undoStack: [], redoStack: [],
    listeners: [],
    prefs: { theme: 'auto', colorBy: 'type', focus: null, filters: {} },

    async init() {
      try { const p = localStorage.getItem(PREF); if (p) Object.assign(this.prefs, JSON.parse(p)); } catch (e) { /* storage unavailable */ }
      // 1. office copy published with the site
      try {
        const r = await fetch('data/plan.json', { cache: 'no-store' });
        if (r.ok) this.officeCopy = migrate(await r.json());
      } catch (e) { /* opened from disk or file missing: use built-in plan */ }
      const base = this.officeCopy || clone(g.DEFAULT_PLAN);
      // 2. shared link
      const m = location.hash.match(/[#&]share=([^&]+)/);
      if (m) {
        try {
          this.plan = migrate(await decodeShare(m[1]));
          this.save(true);
          history.replaceState(null, '', location.pathname + '#/today');
          this.sharedLoaded = true;
          return;
        } catch (e) { this.shareError = true; }
      }
      // 3. this browser's saved copy
      let saved = null;
      try { saved = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); } catch (e) { /* ignore */ }
      if (saved) { try { this.plan = migrate(JSON.parse(saved)); } catch (e) { this.plan = null; } }
      if (!this.plan) this.plan = clone(base);
      this.cleanUp();
    },

    /* Daily clean-up: N, R, S, P/P1 records older than the retention period (45 days) are deleted. B's are kept. */
    cleanUp() {
      const n = purge(this.plan, todayStr());
      if (n) { this.save(true); this.purged = n; }
      return n;
    },
    /* B deletes his own records (only when he chooses to) */
    deleteB(before, kinds) {
      return this.change('Deleted B\'s records before ' + before, p => deleteBRecords(p, before, kinds));
    },
    /* Copy without B's private admin schedule, for plan.json and share links */
    publicCopy() { const pl = clone(this.plan); pl.admin = {}; delete pl.savedAt; return pl; },

    savePrefs() { try { localStorage.setItem(PREF, JSON.stringify(this.prefs)); } catch (e) { /* ignore */ } },

    save(silent) {
      this.plan.savedAt = new Date().toISOString();
      try { localStorage.setItem(KEY, JSON.stringify(this.plan)); } catch (e) { /* ignore */ }
      if (!silent) this.emit();
    },

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
    replace(plan, label) { this.change(label || 'Load plan', p => { Object.keys(p).forEach(k => delete p[k]); Object.assign(p, migrate(clone(plan))); }); },
    resetToOffice() { this.replace(this.officeCopy || g.DEFAULT_PLAN, 'Reset to office copy'); },
    resetToExcel() { this.replace(g.DEFAULT_PLAN, 'Reset to the Excel plan'); },
    differsFromOffice() {
      const a = Object.assign({}, this.plan); delete a.savedAt;
      const b = Object.assign({}, this.officeCopy || g.DEFAULT_PLAN); delete b.savedAt;
      return JSON.stringify(a) !== JSON.stringify(b);
    },
    on(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach(fn => fn()); },
    shareLink: async function () { return location.origin + location.pathname + '#share=' + await encodeShare(this.publicCopy()); },
    clone
  };

  function migrate(p) {
    const d = g.DEFAULT_PLAN;
    p = p || {};
    ['overrides', 'visitOverrides', 'status', 'reviews', 'away', 'remarks', 'importance', 'clear', 'leave', 'targets', 'followups', 'admin'].forEach(k => { if (!p[k] || typeof p[k] !== 'object') p[k] = {}; });
    if (!Array.isArray(p.extra)) p.extra = [];
    if (!Array.isArray(p.holidays)) p.holidays = clone(d.holidays);
    if (!Array.isArray(p.people)) p.people = clone(d.people);
    if (!Array.isArray(p.companies)) p.companies = clone(d.companies);
    if (!Array.isArray(p.tasks)) p.tasks = clone(d.tasks);
    if (!p.responsibilities) p.responsibilities = clone(d.responsibilities);
    p.people.forEach(x => { if (!p.responsibilities[x.id]) p.responsibilities[x.id] = { main: [], outstation: [], other: [], duties: '' }; });
    p.settings = Object.assign({}, d.settings, p.settings || {});
    if (!p.notes) p.notes = clone(d.notes);
    p.tasks.forEach(t => (t.agenda || []).forEach(a => { if (!Array.isArray(a.owners)) a.owners = a.owner ? [a.owner] : []; delete a.owner; }));
    if ((p.version || 1) < 3) upgradeTo3(p, d);
    if ((p.version || 1) < 4) p.tasks.forEach(t => { const n = d.tasks.find(x => x.id === t.id); if (n && n.maxDays && !t.maxDays) t.maxDays = n.maxDays; });
    if ((p.version || 1) < 5) { const c2 = p.tasks.find(x => x.id === 'site-c2'); if (c2) c2.fillDays = true; }
    if (!Array.isArray(p.settings.adminHours)) p.settings.adminHours = clone(d.settings.adminHours);
    p.people.forEach(x => { if (!Array.isArray(x.offDays)) x.offDays = []; });
    if (!Array.isArray(p.settings.slots) || !p.settings.slots.length) p.settings.slots = clone(d.settings.slots);
    p.version = 5;
    return p;
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
    Object.keys(p.leave).forEach(k => { const [pid, d] = k.split('|'); if (pid !== B && d < cut) { delete p.leave[k]; n++; } });
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
    if (k.has('followups')) Object.keys(p.followups).forEach(key => { if (old(key)) delete p.followups[key]; });
    if (k.has('admin')) Object.keys(p.admin).forEach(d => { if (d < before) delete p.admin[d]; });
  }

  /* Older plans: new meeting and slot times, B's weekend, office-only days. The person's own edits are kept. */
  function upgradeTo3(p, d) {
    const mins = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
    Object.assign(p.settings, { workStart: d.settings.workStart, workEnd: d.settings.workEnd, slots: clone(d.settings.slots), lunchStart: d.settings.lunchStart, lunchEnd: d.settings.lunchEnd });
    p.tasks.forEach(t => {
      const n = d.tasks.find(x => x.id === t.id); if (!n) return;
      const oldSlot = mins(t.end) - mins(t.start);
      const used = (t.agenda || []).reduce((s, a) => s + (Number(a.minutes) || 0), 0);
      t.start = n.start; t.end = n.end;
      if (n.noSite) t.noSite = true;
      if (n.agenda && used === oldSlot && used !== mins(n.end) - mins(n.start)) t.agenda = clone(n.agenda);
      t.details = n.details;
    });
    const b = p.people.find(x => x.id === 'B'); if (b && !Array.isArray(b.offDays)) b.offDays = [6, 0];
    Object.keys(p.overrides || {}).forEach(k => { const o = p.overrides[k]; if (o && !o.deleted) { delete o.start; delete o.end; } });
  }

  /* Share links: the whole plan, deflated and base64url-encoded into the URL. */
  async function encodeShare(plan) {
    const txt = JSON.stringify(plan);
    const bytes = new TextEncoder().encode(txt);
    let out;
    if (g.CompressionStream) {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      out = new Uint8Array(await new Response(cs).arrayBuffer());
      return 'z' + b64(out);
    }
    return 'j' + b64(bytes);
  }
  async function decodeShare(s) {
    const kind = s[0]; const bytes = unb64(s.slice(1));
    if (kind === 'z') {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(ds).text());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  Store.migrate = migrate; Store.purge = purge; Store.deleteBRecords = deleteBRecords;
  g.Store = Store;
})(window);
