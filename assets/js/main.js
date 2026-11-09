/* Start-up: login first (Vault), then the top bar, menu, undo, theme and keyboard. */
(function (g) {
  'use strict';
  const { D } = Engine;
  const { $, icon, toast, closeModal } = UI;

  const VIEW_NAV = [['today', 'Today'], ['month', 'Month'], ['employees', 'Employees'], ['companies', 'Companies'], ['meetings', 'Meetings'], ['billing', 'Billing days']];
  const EDIT_NAV = [['chart', 'Link chart', 'link'], ['admin', 'B admin', 'lock']];
  const THEMES = { auto: ['auto', 'Auto'], light: ['sun', 'Light'], dark: ['moon', 'Dark'] };

  function chrome() {
    const st = Store.plan.settings;
    $('#nav').innerHTML = VIEW_NAV.map(([v, l]) => `<a href="#/${v}" data-view="${v}">${l}</a>`).join('') + '<span class="nav-sep" aria-hidden="true"></span>' +
      EDIT_NAV.map(([v, l, ic]) => `<a href="#/${v}" data-view="${v}" class="nav-edit">${icon(ic)}${l}</a>`).join('');
    $('#range').textContent = `${D.nice(st.start, { short: true })} ${st.start.slice(0, 4)} to ${D.nice(st.end, { short: true })} ${st.end.slice(0, 4)}`;
    $('#title').textContent = Store.plan.title || 'Works timetable';
    $('#undo').innerHTML = icon('undo') + '<span>Undo</span>';
    $('#add').innerHTML = icon('plus') + '<span>Add work</span>';
    const th = THEMES[Store.prefs.theme] || THEMES.auto;
    $('#theme').innerHTML = icon(th[0]) + `<span>${th[1]}</span>`; $('#theme').title = 'Light / dark mode';
    $('#logoff').innerHTML = icon('logout') + '<span>Log off</span>';
    $('#settings').innerHTML = icon('gear') + '<span>Settings</span>'; $('#settings').classList.toggle('on', App.route.view === 'settings');
  }

  function start() {
    App.views.employees && (App.views.people = App.views.employees);   // old links (#/people) still work
    chrome();
    let pending = false;
    Store.on(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; if (!Store.plan) return; App.keepScroll = true; chrome(); App.render(); }); });
    $('#undo').onclick = () => { const l = Store.undo(); if (l) toast(`Undone: ${l}`); };
    $('#add').onclick = () => App.addExtra(App.route.params.date);
    $('#clash-badge').onclick = () => App.go('settings', { open: 'problems' });
    $('#settings').onclick = () => App.go('settings');
    $('#logoff').onclick = () => Vault.lock('Logged off.');
    $('#theme').onclick = () => { const order = ['auto', 'light', 'dark']; Store.prefs.theme = order[(order.indexOf(Store.prefs.theme) + 1) % 3]; Store.savePrefs(); UI.applyTheme(Store.prefs.theme); chrome(); };
    window.addEventListener('hashchange', () => { App.parseHash(); App.render(); window.scrollTo(0, 0); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(); return; }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (typing || !$('#modal').hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && App.editing) { e.preventDefault(); $('#undo').click(); }
    });
    App.parseHash();
    App.render();
    if (Store.purged) toast(`${Store.purged} old daily records (over ${Store.plan.settings.retentionDays} days) were cleared.`);
  }
  g.Main = { start };
  Vault.boot();
})(window);
