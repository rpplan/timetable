/* Login, encryption and automatic log-off. Nothing of the office's data is shown or loaded before B logs in.
   - Firebase mode: email + password checked by Firebase; data in Firestore, readable only by B (security rules).
   - Local mode (no Firebase yet): data kept in this browser, encrypted with AES-256 using a key made from B's
     password (PBKDF2, 310 000 rounds). Without the password the stored data cannot be read.
   Log-off: after 10 minutes without use, or when the window/tab is closed (the key is only kept in memory). */
(function (g) {
  'use strict';
  const { esc, $ } = UI;
  const VAULT = 'works-timetable-vault';
  const OLD = ['works-timetable-plan-v3', 'works-timetable-plan-v2'];   // old unencrypted copies (version 5 and before)
  const MSG = 'works-timetable-lockmsg';
  const ITER = 310000;
  const enc = new TextEncoder(), dec = new TextDecoder();

  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter || ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }
  async function unseal(key, box) { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)))); }

  /* ---------- local encrypted storage ---------- */
  const Local = {
    key: null, salt: null, timer: null, pending: null, onStatus: null,
    exists() { try { return !!localStorage.getItem(VAULT); } catch (e) { return false; } },
    async create(pw, plan) {
      this.salt = crypto.getRandomValues(new Uint8Array(16));
      this.key = await deriveKey(pw, this.salt);
      await this.write(plan);
    },
    async unlock(pw) {
      const v = JSON.parse(localStorage.getItem(VAULT));
      const key = await deriveKey(pw, unb64(v.salt), v.iter);
      const plan = await unseal(key, v);            // throws when the password is wrong
      this.key = key; this.salt = unb64(v.salt);
      return plan;
    },
    async write(plan) {
      const box = await seal(this.key, plan);
      localStorage.setItem(VAULT, JSON.stringify({ v: 1, iter: ITER, salt: b64(this.salt), iv: box.iv, ct: box.ct }));
    },
    persist(plan) {
      this.pending = JSON.parse(JSON.stringify(plan));
      clearTimeout(this.timer);
      if (this.onStatus) this.onStatus('saving');
      this.timer = setTimeout(() => this.flush(), 300);
    },
    async flush() {
      if (!this.pending || !this.key) return;
      const p = this.pending; this.pending = null;
      try { await this.write(p); if (this.onStatus) this.onStatus('saved'); } catch (e) { if (this.onStatus) this.onStatus('error', e.message); }
    },
    async changePassword(pw) { this.salt = crypto.getRandomValues(new Uint8Array(16)); this.key = await deriveKey(pw, this.salt); await this.write(Store.plan); },
    erase() { try { localStorage.removeItem(VAULT); } catch (e) { /* ignore */ } }
  };

  function oldCopy() {
    for (const k of OLD) { try { const s = localStorage.getItem(k); if (s) return JSON.parse(s); } catch (e) { /* ignore */ } }
    return null;
  }
  function wipeOld() { OLD.concat(['works-timetable-prefs-v2', 'works-timetable-bmode']).forEach(k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }); }

  /* ---------- login screen ---------- */
  const lockEl = () => $('#lock');
  function screen(title, body, foot) {
    let msg = ''; try { msg = sessionStorage.getItem(MSG) || ''; sessionStorage.removeItem(MSG); } catch (e) { /* ignore */ }
    lockEl().innerHTML = `<div class="lock-card"><div class="lock-brand"><img src="assets/icon.svg" alt="" width="40" height="40"><div><b>Works timetable</b><small>Only B can open this website</small></div></div>
      <h1>${esc(title)}</h1>${msg ? `<p class="lock-msg">${esc(msg)}</p>` : ''}${body}${foot ? `<div class="lock-foot">${foot}</div>` : ''}</div>`;
    const f = $('input', lockEl()); if (f) setTimeout(() => f.focus(), 30);
  }
  const err = t => { const e = $('#lk-err'); if (e) { e.textContent = t; e.hidden = !t; } };
  const busy = (on, label) => { const b = $('#lk-go'); if (b) { b.disabled = on; if (label) b.textContent = label; } };

  function planInput(withOld) {
    const old = withOld && oldCopy();
    return `<label>Starting plan file<input type="file" id="lk-file" accept=".json" required></label>
      <p class="muted small">Use <code>setup/starting-plan.json</code> from the zip (or a backup file saved from this website).</p>
      ${old ? '<label class="check"><input type="checkbox" id="lk-old" checked> Also bring over the remarks, ticks, leave, points and follow-ups saved in this browser by the earlier version (they are then removed from the browser\'s unprotected storage)</label>' : ''}`;
  }
  async function readPlanFile() {
    const f = $('#lk-file').files[0]; if (!f) throw new Error('Choose the starting plan file.');
    let p; try { p = JSON.parse(await f.text()); } catch (e) { throw new Error('That file is not a plan file.'); }
    if (!Array.isArray(p.tasks) || !Array.isArray(p.people)) throw new Error('That file is not a plan file.');
    p = Store.migrate(p);
    const o = $('#lk-old'); if (o && o.checked) Store.mergeRecords(p, Store.migrate(oldCopy()));
    return p;
  }

  function localSetup() {
    screen('Set B\'s password', `<form id="lk" class="form">
      <p class="muted">Local mode: the timetable is kept in this browser only, encrypted with this password. To use it on several devices, connect Firebase (see setup/FIREBASE_SETUP.md).</p>
      <label>New password (at least 8 characters)<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
      <label>Same password again<input type="password" name="pw2" minlength="8" autocomplete="new-password" required></label>
      ${planInput(true)}<p class="alert" id="lk-err" hidden></p>
      <button class="btn primary" id="lk-go" type="submit">Create and open</button></form>`,
      '<span class="muted small">There is no way to recover a forgotten password in local mode. Keep a backup (Edit → Excel & backup).</span>');
    $('#lk').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target); err('');
      if (fd.get('pw') !== fd.get('pw2')) { err('The two passwords are different.'); return; }
      if (String(fd.get('pw')).length < 8) { err('Use at least 8 characters.'); return; }
      try { busy(true, 'Encrypting…'); const plan = await readPlanFile(); await Local.create(fd.get('pw'), plan); wipeOld(); open(plan, Local, 'local'); }
      catch (x) { busy(false, 'Create and open'); err(x.message || 'Could not create the protected copy.'); }
    };
  }
  let tries = 0, waitUntil = 0;
  function localUnlock() {
    screen('Log in', `<form id="lk" class="form"><label>B's password<input type="password" name="pw" autocomplete="current-password" required></label>
      <p class="alert" id="lk-err" hidden></p><button class="btn primary" id="lk-go" type="submit">Log in</button></form>`,
      '<button type="button" class="link small muted" id="lk-forgot">Forgot the password?</button>');
    $('#lk').onsubmit = async e => {
      e.preventDefault(); err('');
      if (Date.now() < waitUntil) { err(`Too many wrong tries. Wait ${Math.ceil((waitUntil - Date.now()) / 1000)} seconds.`); return; }
      busy(true, 'Checking…');
      try { const plan = await Local.unlock(new FormData(e.target).get('pw')); tries = 0; open(plan, Local, 'local'); }
      catch (x) { tries++; if (tries >= 5) { waitUntil = Date.now() + 30000 * (tries - 4); } busy(false, 'Log in'); err('Wrong password.'); $('input', lockEl()).select(); }
    };
    $('#lk-forgot').onclick = forgot;
  }
  function forgot() {
    screen('Forgot the password', `<p>The data in this browser is encrypted with the old password and cannot be opened without it.</p>
      <p class="muted">You can erase it and start again from the starting plan file or a backup file. Type <b>ERASE</b> to confirm.</p>
      <form id="lk" class="form"><input name="x" autocomplete="off" aria-label="Type ERASE"><p class="alert" id="lk-err" hidden></p>
      <div class="row-btns"><button type="button" class="btn ghost" id="lk-back">Back</button><button class="btn btn-danger" id="lk-go" type="submit">Erase and start again</button></div></form>`);
    $('#lk-back').onclick = localUnlock;
    $('#lk').onsubmit = e => { e.preventDefault(); if (new FormData(e.target).get('x') !== 'ERASE') { err('Type ERASE in capital letters.'); return; } Local.erase(); localSetup(); };
  }

  async function cloudStart() {
    screen('Connecting…', '<p class="muted">Connecting to the database.</p>');
    try { await Cloud.init(); }
    catch (e) { screen('Cannot reach the database', `<p class="alert">${esc(e.message || 'Firebase could not be loaded.')}</p><p class="muted">Check the internet connection and assets/js/firebase-config.js.</p><button class="btn primary" id="lk-retry">Try again</button>`); $('#lk-retry').onclick = () => location.reload(); return; }
    if (Cloud.user) return cloudOpen();
    cloudLogin();
  }
  function cloudLogin() {
    screen('Log in', `<form id="lk" class="form"><label>Email<input type="email" name="em" autocomplete="username" required></label>
      <label>Password<input type="password" name="pw" autocomplete="current-password" required></label>
      <p class="alert" id="lk-err" hidden></p><button class="btn primary" id="lk-go" type="submit">Log in</button></form>`,
      '<span class="muted small">Forgot the password? Reset it in the Firebase console (Authentication → Users).</span>');
    $('#lk').onsubmit = async e => {
      e.preventDefault(); err(''); busy(true, 'Checking…'); const fd = new FormData(e.target);
      try { await Cloud.signIn(fd.get('em'), fd.get('pw')); cloudOpen(); }
      catch (x) { busy(false, 'Log in'); err(/too-many/.test(x.code || '') ? 'Too many tries. Wait a few minutes.' : 'Wrong email or password.'); }
    };
  }
  async function cloudOpen() {
    screen('Loading…', '<p class="muted">Loading the timetable.</p>');
    let plan;
    try { plan = await Cloud.load(); }
    catch (e) { screen('No access', `<p class="alert">${esc(/permission/i.test(e.message) ? 'This account is not allowed to read the timetable. Check the user ID in the Firestore rules.' : e.message)}</p><button class="btn primary" id="lk-out">Log out</button>`); $('#lk-out').onclick = async () => { await Cloud.signOut(); location.reload(); }; return; }
    if (plan) { open(plan, Cloud, 'cloud'); return; }
    screen('First start', `<form id="lk" class="form"><p class="muted">The database is empty. Load the starting plan once; after that everything is saved in Firebase.</p>
      ${planInput(true)}<p class="alert" id="lk-err" hidden></p><button class="btn primary" id="lk-go" type="submit">Load and open</button></form>`);
    $('#lk').onsubmit = async e => {
      e.preventDefault(); err('');
      try { busy(true, 'Saving…'); const p = await readPlanFile(); await Cloud.flush(p); wipeOld(); open(p, Cloud, 'cloud'); }
      catch (x) { busy(false, 'Load and open'); err(x.message); }
    };
  }

  /* ---------- after login ---------- */
  function open(plan, backend, mode) {
    Vault.mode = mode;
    Store.start(plan, backend);
    backend.onStatus = (s, m) => Vault.showStatus(s, m);
    if (mode === 'cloud') Cloud.listen(p => { Store.remote(p); UI.toast('Updated from another device.'); });
    lockEl().hidden = true; lockEl().innerHTML = '';
    $('#app').hidden = false;
    idle.start();
    g.Main.start();
    Vault.showStatus('saved');
  }

  /* ---------- automatic log-off ---------- */
  const idle = {
    last: Date.now(), timer: null, warned: false,
    start() {
      ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => this.poke(), { passive: true }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
      this.timer = setInterval(() => this.check(), 5000);
    },
    poke() { this.last = Date.now(); if (this.warned) { this.warned = false; const w = $('#idle-warn'); if (w) w.hidden = true; } },
    limit() { return Math.max(1, Number((Store.plan && Store.plan.settings.idleMinutes) || 10)) * 60000; },
    check() {
      const left = this.limit() - (Date.now() - this.last);
      if (left <= 0) { Vault.lock(`Logged off after ${Math.round(this.limit() / 60000)} minutes without use.`); return; }
      if (left <= 60000) { this.warned = true; const w = $('#idle-warn'); if (w) { w.hidden = false; w.textContent = `Logging off in ${Math.ceil(left / 1000)} seconds. Move the mouse or press a key to stay.`; } }
    }
  };

  const Vault = {
    mode: null, Local,
    async boot() {
      Store.loadPrefs(); UI.applyTheme(Store.prefs.theme);
      $('#app').hidden = true; lockEl().hidden = false;
      if (!g.crypto || !crypto.subtle) { screen('Not supported', '<p class="alert">This browser cannot encrypt data. Open the website over https (for example on GitHub Pages) in an up-to-date browser.</p>'); return; }
      if (g.Cloud && Cloud.configured()) return cloudStart();
      if (Local.exists()) localUnlock(); else localSetup();
    },
    async lock(message) {
      clearInterval(idle.timer);
      try { if (message) sessionStorage.setItem(MSG, message); } catch (e) { /* ignore */ }
      try { if (Vault.mode === 'local') await Local.flush(); else if (Vault.mode === 'cloud') { await Cloud.flush(Cloud.timer ? Store.plan : null); await Cloud.signOut(); } } catch (e) { /* ignore */ }
      Store.plan = null;
      document.body.innerHTML = '';
      location.replace(location.pathname);   // reload: everything in memory is gone
    },
    showStatus(s, m) {
      const el = $('#sync'); if (!el) return;
      const where = Vault.mode === 'cloud' ? 'Firebase' : 'this browser (encrypted)';
      el.className = 'sync ' + s;
      el.textContent = s === 'saving' ? 'Saving…' : s === 'error' ? 'Not saved!' : 'Saved';
      el.title = s === 'error' ? `Could not save: ${m || ''}` : `Saved in ${where}`;
    }
  };
  window.addEventListener('beforeunload', e => { if (Local.pending || (Vault.mode === 'cloud' && Cloud.status === 'saving')) { e.preventDefault(); e.returnValue = ''; } });

  g.Vault = Vault;
})(window);
