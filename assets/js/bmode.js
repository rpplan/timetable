/* Importance levels, clearance forms, 7-day site targets and points, leave, and the pattern that opens B's admin schedule.
   Inputs are only shown in the Edit area (App.editing); the view pages show the same information as plain labels. */
(function () {
  'use strict';
  const { D, T } = Engine;
  const { esc, $, $$, icon, toast, modal, closeModal, confirmBox } = UI;
  const SKEY = 'works-timetable-bmode';

  const IMP = { low: { label: 'Low', cls: 'imp-low' }, medium: { label: 'Medium', cls: 'imp-med' }, high: { label: 'High', cls: 'imp-high' } };

  /* A small text hash. The pattern is not stored as such, only this hash. */
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  const pinHash = seq => hash('works-timetable|' + seq);

  let unlocked = false;
  try { unlocked = sessionStorage.getItem(SKEY) === '1'; } catch (e) { /* ignore */ }

  Object.assign(App, {
    IMP,
    isB(pid) { return pid === 'B'; },
    bOn() { return !!App.editing; },
    adminOpen() { return unlocked && !!Store.plan.settings.bPin; },
    lockB() { unlocked = false; try { sessionStorage.removeItem(SKEY); } catch (e) { /* ignore */ } App.keepScroll = true; App.render(); toast('Admin schedule locked.'); },
    unlockB() { unlocked = true; try { sessionStorage.setItem(SKEY, '1'); } catch (e) { /* ignore */ } },
    /* Run next() in B mode; asks for the pattern first if needed */
    requireB(next, why) {
      if (App.adminOpen()) { next(); return; }
      patternModal(why, () => { App.unlockB(); App.keepScroll = true; App.render(); next(); });
    },

    /* ---------- importance ---------- */
    imp(key, pid) {
      const own = Store.plan.importance[key + '|' + pid];
      if (own) return own;
      const o = App.data.byKey[key]; const t = o && !o.extra ? App.task(o.taskId) : (o && o.extra ? Store.plan.extra.find(x => 'x:' + x.id === o.taskId) : null);
      return (t && t.importance) || '';
    },
    impBadge(level) { const i = IMP[level]; return i ? `<span class="imp ${i.cls}" title="Importance: ${i.label}">${i.label}</span>` : ''; },
    impControl(key, pid) {
      const lv = App.imp(key, pid);
      if (!App.bOn()) return App.impBadge(lv);
      // three small buttons; tap the lit one again to clear it
      return `<span class="imp-seg" role="group" aria-label="Importance">${Object.keys(IMP).map(k => `<button type="button" class="${IMP[k].cls} ${lv === k ? 'on' : ''}" data-impseg="${esc(key)}|${esc(pid)}|${k}" aria-pressed="${lv === k}" title="Importance: ${IMP[k].label}">${IMP[k].label}</button>`).join('')}</span>`;
    },

    /* ---------- clearance forms (N, R, S, P/P1) ---------- */
    clearBox(key, pid, date) {
      if (App.isB(pid) || date > D.today()) return '';
      const on = !!Store.plan.clear[key + '|' + pid];
      if (!App.editing) return on ? '<span class="clr on">✓ Clearance form</span>' : '<span class="clr">Clearance form pending</span>';
      return `<label class="clr ${on ? 'on' : ''}"><input type="checkbox" data-clr="${esc(key)}|${esc(pid)}" ${on ? 'checked' : ''}>Clearance form</label>`;
    },

    /* ---------- 7-day site targets & points ---------- */
    targetState(v) {
      const t = Store.plan.targets[v.key], today = D.today();
      if (t) return today <= v.due ? 'ticked' : 'done';
      if (today < v.date) return 'upcoming';
      if (today <= v.due) return 'open';
      return 'missed';
    },
    points(pid) { const per = Number(Store.plan.settings.targetPoints) || 100; return Object.values(Store.plan.targets).filter(x => x.p === pid).length * per; },
    targetRow(v) {
      const st = App.targetState(v), per = Number(Store.plan.settings.targetPoints) || 100;
      const name = `${App.cname(v.company)}${v.cycle ? ' (' + v.cycle + ')' : ''}`;
      const due = `due ${D.nice(v.due, { short: true })}`;
      if (!App.editing && st === 'ticked') return `<div class="tgt done"><span class="tick">✓</span><span>${esc(name)} <small>done in time · ${due} · +${per}</small></span></div>`;
      if (!App.editing && st === 'open') return `<div class="tgt open-ro"><span class="tick">○</span><span>${esc(name)} <small>open · ${due} · ${per} points</small></span></div>`;
      if (st === 'open' || st === 'ticked') return `<label class="tgt ${st}"><input type="checkbox" data-tgt="${esc(v.key)}" ${st === 'ticked' ? 'checked' : ''}><span>${esc(name)} measured within ${Store.plan.settings.targetDays || 7} days <small>${due} · ${per} points</small></span></label>`;
      if (st === 'done') return `<div class="tgt done"><span class="tick">✓</span><span>${esc(name)} <small>done in time · +${per}</small></span></div>`;
      if (st === 'missed') return `<div class="tgt missed"><span class="tick">–</span><span>${esc(name)} <small>${due}, not marked</small></span></div>`;
      return `<div class="tgt upcoming"><span class="tick">·</span><span>${esc(name)} <small>site day ${D.nice(v.date, { short: true })}, ${due}</small></span></div>`;
    },
    /* Site measurements of this person whose 7-day window is open today */
    openTargets(pid) { const today = D.today(); return App.data.gen.visits.filter(v => v.person === pid && !v.repeat && v.date <= today && today <= v.due); },

    /* ---------- leave ---------- */
    onLeave(pid, date) { return !!Store.plan.leave[pid + '|' + date]; },
    setLeave(pid, date, on) {
      App.commit(on ? `${App.pname(pid)} on leave ${D.nice(date)}. The day's work moves to the next working day.` : `${App.pname(pid)} leave on ${D.nice(date)} cancelled`, p => {
        if (on) p.leave[pid + '|' + date] = true; else delete p.leave[pid + '|' + date];
      });
    }
  });

  /* ---------- pattern pad (3 x 3 dots) ---------- */
  function patternPad(el, onDone) {
    el.innerHTML = `<div class="pad" aria-label="Pattern pad: drag across the dots"><svg class="pad-lines" viewBox="0 0 300 300" aria-hidden="true"><polyline points=""/></svg>${Array.from({ length: 9 }, (_, i) => `<span class="pd" data-n="${i + 1}"></span>`).join('')}</div>`;
    const pad = $('.pad', el), line = $('polyline', el);
    let seq = [], drawing = false;
    const pos = n => [((n - 1) % 3) * 100 + 50, Math.floor((n - 1) / 3) * 100 + 50];
    const draw = () => { line.setAttribute('points', seq.map(n => pos(n).join(',')).join(' ')); $$('.pd', pad).forEach(d => d.classList.toggle('on', seq.includes(+d.dataset.n))); };
    const hit = (x, y) => {
      const r = pad.getBoundingClientRect(); const px = (x - r.left) / r.width * 300, py = (y - r.top) / r.height * 300;
      const c = Math.floor(px / 100), rr = Math.floor(py / 100); if (c < 0 || c > 2 || rr < 0 || rr > 2) return null;
      return Math.hypot(px - (c * 100 + 50), py - (rr * 100 + 50)) <= 38 ? rr * 3 + c + 1 : null;
    };
    const add = n => { if (n && !seq.includes(n)) { seq.push(n); draw(); } };
    pad.addEventListener('pointerdown', e => { e.preventDefault(); drawing = true; seq = []; draw(); try { pad.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } add(hit(e.clientX, e.clientY)); });
    pad.addEventListener('pointermove', e => { if (drawing) add(hit(e.clientX, e.clientY)); });
    const end = () => { if (!drawing) return; drawing = false; const s = seq.join(''); if (s) onDone(s); };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    return { reset() { seq = []; draw(); }, error() { pad.classList.add('bad'); setTimeout(() => { pad.classList.remove('bad'); seq = []; draw(); }, 600); } };
  }

  function patternModal(why, onOk) {
    const st = Store.plan.settings, setting = !st.bPin;
    let first = null;
    modal({
      title: setting ? 'Set B\'s pattern' : 'Draw B\'s pattern',
      body: `${why ? `<p class="muted">${esc(why)}</p>` : ''}<p class="lede" id="pat-msg">${setting ? 'Draw a pattern of at least 4 dots. You will draw it twice.' : 'Draw the pattern to open B mode.'}</p>
        <div id="pat"></div>${setting ? '' : '<button type="button" class="link small muted" id="pat-forgot">Forgot the pattern?</button>'}`,
      onOpen: m => {
        const msg = $('#pat-msg', m);
        const pad = patternPad($('#pat', m), seq => {
          if (setting) {
            if (seq.length < 4) { msg.textContent = 'Use at least 4 dots.'; pad.error(); return; }
            if (!first) { first = seq; msg.textContent = 'Draw the same pattern again to confirm.'; pad.reset(); return; }
            if (seq !== first) { first = null; msg.textContent = 'The two patterns were different. Start again.'; pad.error(); return; }
            st.bPin = pinHash(seq); Store.save(true); closeModal(); toast('B\'s pattern saved. B mode is open.'); onOk(); return;
          }
          if (pinHash(seq) === st.bPin) { closeModal(); onOk(); }
          else { msg.textContent = 'Wrong pattern. Try again.'; pad.error(); }
        });
        const f = $('#pat-forgot', m);
        if (f) f.onclick = () => confirmBox('Reset B\'s pattern?', 'You are logged in with B\'s password, so the pattern can be reset here. The admin schedule is kept. Then a new pattern is drawn.', 'Reset pattern', () => {
          Store.change('B\'s pattern reset', p => { p.settings.bPin = ''; });
          patternModal(why, onOk);
        }, true);
      }
    });
  }
  App.patternModal = patternModal;

  /* ---------- event binding (called from every page render) ---------- */
  App.bindExtras = function (root) {
    $$('[data-imp]', root).forEach(s => s.onchange = () => {
      const k = s.dataset.imp;
      App.keepScroll = true;
      Store.change('Importance set', p => { if (s.value) p.importance[k] = s.value; else delete p.importance[k]; });
      toast(s.value ? `Importance: ${IMP[s.value].label}` : 'Importance cleared');
    });
    $$('[data-impseg]', root).forEach(b => b.onclick = () => {
      const raw = b.dataset.impseg, i = raw.lastIndexOf('|'), k = raw.slice(0, i), lv = raw.slice(i + 1), on = b.classList.contains('on');
      App.keepScroll = true;
      Store.change('Importance set', p => { if (on) delete p.importance[k]; else p.importance[k] = lv; });
    });
    $$('[data-cf]', root).forEach(b => b.onclick = () => {
      const k = b.dataset.cf; App.keepScroll = true;
      Store.change(Store.plan.clear[k] ? 'Clearance form unticked' : 'Clearance form done', p => { if (p.clear[k]) delete p.clear[k]; else p.clear[k] = D.today(); });
    });
    $$('[data-clr]', root).forEach(c => c.onchange = () => {
      const k = c.dataset.clr; App.keepScroll = true;
      Store.change(c.checked ? 'Clearance form done' : 'Clearance form unticked', p => { if (c.checked) p.clear[k] = D.today(); else delete p.clear[k]; });
    });
    $$('[data-tgt]', root).forEach(c => c.onchange = () => {
      const v = App.data.gen.visits.find(x => x.key === c.dataset.tgt); if (!v) return;
      if (D.today() > v.due) { toast('The 7-day time for this measurement is over.'); App.render(); return; }
      App.keepScroll = true;
      const per = Number(Store.plan.settings.targetPoints) || 100;
      Store.change(c.checked ? `+${per} points for ${App.pname(v.person)}` : 'Target unticked', p => {
        if (c.checked) p.targets[v.key] = { p: v.person, d: D.today(), c: v.company, due: v.due, run: v.runKey }; else delete p.targets[v.key];
      });
      toast(c.checked ? `${App.pname(v.person)}: ${App.cname(v.company)} done in time. +${per} points.` : 'Tick removed.');
    });
    $$('[data-leave]', root).forEach(b => b.onclick = () => { const [pid, date, on] = b.dataset.leave.split('|'); App.setLeave(pid, date, on === '1'); });
    $$('[data-bopen]', root).forEach(b => b.onclick = () => App.requireB(() => {}, 'Draw B\'s pattern to open the admin schedule.'));
    $$('[data-print]', root).forEach(b => b.onclick = () => { document.body.dataset.print = b.dataset.print || ''; window.print(); });
  };
  window.addEventListener('afterprint', () => { delete document.body.dataset.print; });

  App.pinHash = pinHash;
})();
