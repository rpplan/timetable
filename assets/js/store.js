/* Plan storage: browser save, undo/redo, office copy (data/plan.json), share links. */
(function (g) {
  'use strict';
  const KEY = 'works-timetable-plan-v2';   // v2: new company list from the updated sheet
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
      try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
      if (saved) { try { this.plan = migrate(JSON.parse(saved)); } catch (e) { this.plan = null; } }
      if (!this.plan) this.plan = clone(base);
    },

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
    shareLink: async function () { return location.origin + location.pathname + '#share=' + await encodeShare(this.plan); },
    clone
  };

  function migrate(p) {
    const d = g.DEFAULT_PLAN;
    p = p || {};
    ['overrides', 'visitOverrides', 'status', 'reviews', 'away'].forEach(k => { if (!p[k] || typeof p[k] !== 'object') p[k] = {}; });
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
    p.version = 2;
    return p;
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

  Store.migrate = migrate;
  g.Store = Store;
})(window);
