/* Start-up: top navigation, undo, keyboard. */
(function () {
  'use strict';
  const { D } = Engine;
  const { $, $$, icon, toast, closeModal } = UI;

  const NAV = [['today', 'Today'], ['week', 'Week'], ['people', 'People'], ['companies', 'Companies'], ['meetings', 'Meetings'], ['billing', 'Billing days'], ['setup', 'Setup']];

  function chrome() {
    const st = Store.plan.settings;
    $('#nav').innerHTML = NAV.map(([v, l]) => `<a href="#/${v}" data-view="${v}">${l}</a>`).join('');
    $('#range').textContent = `${D.nice(st.start, { short: true })} – ${D.nice(st.end, { short: true })} ${st.end.slice(0, 4)}`;
    $('#title').textContent = Store.plan.title || 'Works timetable';
    $('#undo').innerHTML = icon('undo') + '<span>Undo</span>';
    $('#add').innerHTML = icon('plus') + '<span>Add work</span>';
  }

  async function start() {
    await Store.init();
    chrome();
    let pending = false;
    Store.on(() => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; App.keepScroll = true; chrome(); App.render(); }); });
    $('#undo').onclick = () => { const l = Store.undo(); if (l) toast(`Undone: ${l}`); };
    $('#add').onclick = () => App.addExtra(App.route.params.date);
    $('#clash-badge').onclick = () => App.go('setup', { tab: 'problems' });
    window.addEventListener('hashchange', () => { App.parseHash(); App.render(); window.scrollTo(0, 0); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(); return; }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (typing || !$('#modal').hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('#undo').click(); }
    });
    App.parseHash();
    App.render();
    if (Store.sharedLoaded) toast('Loaded the timetable from the shared link.');
    if (Store.shareError) toast('That share link could not be read.');
  }
  start();
})();
