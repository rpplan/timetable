/* Firebase backend: B logs in with email + password (Firebase Authentication) and the plan is kept in
   Cloud Firestore, collection "timetable". Firestore security rules (setup/firestore.rules) allow only
   B's account to read or write. The session ends when the window is closed (session persistence).
   Documents:  timetable/plan      everything that shapes the timetable (people, companies, work, settings)
               timetable/private   B's admin schedule and pattern
               timetable/rec-YYYY-MM  that month's daily records (remarks, ticks, leave, importance, follow-ups)
   Each document holds the data as one JSON text, so any characters in names are safe. */
(function (g) {
  'use strict';
  const V = '10.12.2';
  const URL = n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`;
  const REC = ['remarks', 'clear', 'importance', 'leave', 'targets', 'followups', 'status', 'actions', 'workOn'];
  const clone = o => JSON.parse(JSON.stringify(o));

  const Cloud = {
    configured() { const c = g.FIREBASE_CONFIG; return !!(c && c.apiKey && c.projectId); },
    fb: null, user: null, last: {}, timer: null, status: 'idle', onStatus: null, unsub: null,

    async init() {
      const [app, auth, fs] = await Promise.all([import(URL('app')), import(URL('auth')), import(URL('firestore'))]);
      const a = app.initializeApp(g.FIREBASE_CONFIG);
      const au = auth.getAuth(a);
      await auth.setPersistence(au, auth.browserSessionPersistence);
      const db = fs.getFirestore(a);
      this.fb = { auth, fs, au, db };
      this.user = await new Promise(res => { const off = auth.onAuthStateChanged(au, u => { off(); res(u); }); });
      return this.user;
    },
    async signIn(email, password) { const r = await this.fb.auth.signInWithEmailAndPassword(this.fb.au, email, password); this.user = r.user; return r.user; },
    async signOut() { try { if (this.unsub) this.unsub(); await this.fb.auth.signOut(this.fb.au); } catch (e) { /* ignore */ } },

    /* Read all documents and put the plan together. Returns null when the database is still empty. */
    async load() {
      const { fs, db } = this.fb;
      const snap = await fs.getDocs(fs.collection(db, 'timetable'));
      const docs = {};
      snap.forEach(d => { docs[d.id] = d.data().json; });
      this.last = Object.assign({}, docs);
      if (!docs.plan) return null;
      return assemble(docs);
    },
    /* Keep other devices' changes coming in */
    listen(onRemote) {
      const { fs, db } = this.fb;
      this.unsub = fs.onSnapshot(fs.collection(db, 'timetable'), snap => {
        if (snap.metadata.hasPendingWrites) return;
        const docs = {}; snap.forEach(d => { docs[d.id] = d.data().json; });
        const changed = Object.keys(docs).some(k => docs[k] !== this.last[k]) || Object.keys(this.last).some(k => !(k in docs));
        if (!changed || !docs.plan) return;
        this.last = Object.assign({}, docs);
        onRemote(assemble(docs));
      }, err => this.setStatus('error', err.message));
    },
    persist(plan) {
      clearTimeout(this.timer);
      this.setStatus('saving');
      const copy = clone(plan);
      this.timer = setTimeout(() => this.flush(copy), 600);
    },
    async flush(plan) {
      if (!plan) return;
      const { fs, db } = this.fb;
      const docs = split(plan);
      try {
        const writes = [];
        Object.keys(docs).forEach(id => { if (docs[id] !== this.last[id]) writes.push(fs.setDoc(fs.doc(db, 'timetable', id), { json: docs[id], savedAt: new Date().toISOString() })); });
        Object.keys(this.last).forEach(id => { if (!(id in docs)) writes.push(fs.deleteDoc(fs.doc(db, 'timetable', id))); });
        await Promise.all(writes);
        this.last = docs;
        this.setStatus('saved');
      } catch (e) { this.setStatus('error', e.message); }
    },
    setStatus(s, msg) { this.status = s; if (this.onStatus) this.onStatus(s, msg); }
  };

  function monthOf(store, key, val, extraDate) {
    if (store === 'targets' && val && val.d) return val.d.slice(0, 7);
    const m = key.match(/\d{4}-\d{2}/); if (m) return m[0];
    const x = key.match(/^x:[^|~]+/); if (x && extraDate[x[0]]) return extraDate[x[0]].slice(0, 7);
    return 'misc';
  }
  function split(plan) {
    const p = clone(plan), out = {}, rec = {};
    const extraDate = {}; (p.extra || []).forEach(x => { extraDate['x:' + x.id] = x.date; });
    const put = (store, key, val) => { const m = monthOf(store, key, val, extraDate); const r = (rec[m] = rec[m] || {}); (r[store] = r[store] || {})[key] = val; };
    REC.forEach(store => { Object.keys(p[store] || {}).forEach(k => put(store, k, p[store][k])); delete p[store]; });
    const rv = p.reviews || {};
    Object.keys(rv.days || {}).forEach(k => put('reviewDays', k, rv.days[k]));
    Object.keys(rv.pay || {}).forEach(k => put('reviewPay', k, rv.pay[k]));
    delete p.reviews;
    out.private = JSON.stringify({ admin: p.admin || {}, badmin: p.badmin || {}, bPin: p.settings.bPin || '' });
    delete p.admin; delete p.badmin; p.settings.bPin = '';
    if (p.billList) out.bills = JSON.stringify(p.billList);   // the uploaded billing Excel list, in its own document
    delete p.billList;
    delete p.savedAt;
    out.plan = JSON.stringify(p);
    Object.keys(rec).forEach(m => { out['rec-' + m] = JSON.stringify(rec[m]); });
    return out;
  }
  function assemble(docs) {
    const p = JSON.parse(docs.plan);
    const priv = docs.private ? JSON.parse(docs.private) : {};
    p.admin = priv.admin || {}; p.badmin = priv.badmin || {}; p.settings = p.settings || {}; p.settings.bPin = priv.bPin || '';
    p.billList = docs.bills ? JSON.parse(docs.bills) : null;
    REC.forEach(s => { p[s] = {}; }); p.reviews = { days: {}, pay: {} };
    Object.keys(docs).filter(k => k.startsWith('rec-')).forEach(k => {
      const r = JSON.parse(docs[k]);
      REC.forEach(s => Object.assign(p[s], r[s] || {}));
      Object.assign(p.reviews.days, r.reviewDays || {}); Object.assign(p.reviews.pay, r.reviewPay || {});
    });
    return p;
  }

  Cloud.split = split; Cloud.assemble = assemble;
  g.Cloud = Cloud;
})(window);
