/* Built-in defaults: settings only. The office's own data (people, companies, work) is NOT in the website files.
   It is loaded once from setup/starting-plan.json after logging in, and from then on lives in the database
   (Firebase) or, in local mode, encrypted in this browser. */
(function (g) {
  'use strict';
  g.DEFAULT_PLAN = {
    version: 8,
    title: 'Works timetable',
    settings: {
      start: '2026-11-05', end: '2026-12-31', workStart: '10:30', workEnd: '19:00',
      slots: [{ start: '10:30', end: '13:30' }, { start: '14:30', end: '19:00' }],
      lunchStart: '13:30', lunchEnd: '14:30', sundayOff: true, sundayStreak: false, maxHours: 9,
      targetDays: 7, targetPoints: 100, retentionDays: 45, bPin: '', idleMinutes: 10,
      windows: { main: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], other: [12, 13, 14, 15, 16, 17, 18, 19, 20] },
      adminHours: [{ dow: 6, start: '09:00', end: '19:00' }, { dow: 0, start: '09:00', end: '19:00' }, { dow: 1, start: '08:00', end: '12:00' }]
    },
    holidays: [], people: [], companies: [], responsibilities: {}, tasks: [], notes: [],
    away: {}, overrides: {}, visitOverrides: {}, runDays: {}, status: {}, reviews: {}, remarks: {}, extra: [],
    importance: {}, clear: {}, leave: {}, targets: {}, followups: {}, admin: {}, chart: { pos: {} }, paySheets: {}, meetDays: {}, files: {}
  };
})(window);
