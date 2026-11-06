/* Starting plan, taken from "B PLANNING CHART" (B_planning_of_works.xlsx, updated version).
   Company names are spelt exactly as in the sheet. Everything can be changed on the website.
   Version 3: meetings 9:15-10:30, two working slots 10:30-13:30 and 14:30-19:00, B off on Saturday & Sunday,
   office-only days (no site measurement) for P on billing/advance days and S on PPV/office days. */
(function (g) {
  'use strict';

  // group: main = main contractors (in town), outstation = outstation sites, other = other contractors (in town)
  const companies = [
    { id: 'sunniva-sdl', name: 'Sunniva SDL', group: 'main' },
    { id: 'kipl-sdl', name: 'KIPL SDL', group: 'main' },            // shared by N and R, on separate days
    { id: 'kipl-sol', name: 'KIPL SOL', group: 'main' },
    { id: 'mahto-sol', name: 'Mahto SOL', group: 'main' },
    { id: 'kipl-misc', name: 'KIPL Misc', group: 'main' },
    { id: 'precon', name: 'PRECON', group: 'main' },
    { id: 'mahto-othersites', name: 'Mahto Othersites', group: 'main' }, // in town, measured by P
    { id: 'mahto-dhanbad', name: 'Mahto Dhanbad', group: 'outstation', together: true }, // N and R go together, same day
    { id: 'kipl-dhule', name: 'KIPL Dhule', group: 'outstation' },
    { id: 'sunniva-dhule', name: 'Sunniva Dhule', group: 'outstation' },
    { id: 'etpl-dholpur', name: 'ETPL Dholpur', group: 'outstation' },
    { id: 'classic-1', name: 'Classic-1', group: 'other' },
    { id: 'tekade', name: 'Tekade', group: 'other' },
    { id: 'aashish', name: 'Aashish', group: 'other' },
    { id: 'borkar', name: 'Borkar', group: 'other' },
    { id: 'unity', name: 'Unity', group: 'other' },
    { id: 'classic-2', name: 'Classic-2', group: 'other' },
    { id: 'aks', name: 'AKS', group: 'other' },
    { id: 'rana', name: 'Rana', group: 'other' },
    { id: 'aashish-stone', name: 'Aashish Stone', group: 'other' },
    { id: 'vee-l-c', name: 'Vee L C', group: 'other' },
    { id: 'pethe', name: 'Pethe', group: 'other' },
    { id: 'jaiswal', name: 'Jaiswal', group: 'other' },
    { id: 'ppv-works', name: 'PPV Works', group: 'other' }
  ];

  // offDays: weekly days off for this person (0 = Sunday ... 6 = Saturday)
  const people = [
    { id: 'N', name: 'N', fullName: '', role: 'Site measurement', color: '#3b6fd4', aliases: [], offDays: [] },
    { id: 'R', name: 'R', fullName: '', role: 'Site measurement', color: '#d4573b', aliases: [], offDays: [] },
    { id: 'S', name: 'S', fullName: '', role: 'Site measurement, PPV works 2 days a week (office days, no site work)', color: '#2e9466', aliases: [], offDays: [] },
    { id: 'P', name: 'P / P1', fullName: '', role: 'Site measurement. As P1: bill checking, estimation, PPV billing, GST filing', color: '#8a55c9', aliases: ['P1'], offDays: [] },
    { id: 'B', name: 'B', fullName: '', role: 'Records, billing checks, payment recommendation, timetable. Works Monday to Friday.', color: '#d29215', aliases: [], offDays: [6, 0] }
  ];

  const responsibilities = {
    N: { main: ['sunniva-sdl', 'kipl-sdl'], outstation: ['mahto-dhanbad', 'kipl-dhule'], other: ['classic-1', 'tekade'], duties: '' },
    R: { main: ['kipl-sol', 'kipl-sdl', 'mahto-sol'], outstation: ['mahto-dhanbad', 'sunniva-dhule'], other: ['aashish', 'borkar', 'unity', 'classic-2'], duties: '' },
    S: { main: ['kipl-misc'], outstation: [], other: ['aks', 'rana', 'aashish-stone', 'vee-l-c', 'pethe'], duties: 'PPV works of 2 days a week, on priority. On PPV days, office work only, no site measurement.' },
    P: { main: ['precon', 'mahto-othersites'], outstation: ['etpl-dholpur'], other: ['jaiswal', 'ppv-works'],
         duties: 'As P1: bill checking, rate list, formatting, advances, asset codes, Tally billing. Project estimation. PPV billing, GST filing. No site measurement on billing and advance days.' },
    B: { main: [], outstation: [], other: [],
         duties: 'Recording all asset names, status of estimation, advances, billing, cement calculation, credit balance sheet preparation, payment recommendation, checking of billing sheets after checking and preparation by P1. Maintain timetable and works. To be checked daily by B. Works Monday to Friday; Saturday and Sunday free.' }
  };

  const MAIN5 = ['sunniva-sdl', 'kipl-sdl', 'kipl-sol', 'mahto-sol', 'precon'];
  const OTHER = companies.filter(c => c.group === 'other').map(c => c.id);
  const ALLP = ['N', 'R', 'S', 'P', 'B'];

  const advSteps = 'Measurement checking, rate check, linking to PO file, advances filling, asset codes checking, emailing. Additionally discuss PRECON bills & works of D.';
  const billSteps = 'Bill checking, rate check, formatting, advances, asset codes, Tally billing by P1. B checks the billing sheets after P1.';
  const meetDetail = 'Work list for part bills, final bill lists, shortlisting of works for billing and advances, with ready meeting agenda and time for discussions.';

  const ag = (who, m) => [
    { item: `${who}: work list for part bills`, minutes: m[0], owners: ['N', 'R'] },
    { item: `${who}: final bill lists`, minutes: m[1], owners: ['P', 'B'] },
    { item: 'Shortlisting of works for billing', minutes: m[2], owners: ['P', 'B'] },
    { item: 'Shortlisting of works for advances', minutes: m[3], owners: ['B'] },
    { item: 'Discussion and action points', minutes: m[4], owners: ALLP.slice() }
  ];
  const A75 = [15, 15, 15, 15, 15];

  // Working slots: Slot 1 10:30-13:30, Slot 2 14:30-19:00. "Whole day" = 10:30-19:00 (both slots).
  const S1 = ['10:30', '13:30'], S2 = ['14:30', '19:00'], DAY = ['10:30', '19:00'], MEET = ['09:15', '10:30'];

  const tasks = [
    { id: 'adv1', title: 'ADV-1 advances', type: 'advance', mode: 'monthly', days: [1], people: ['P', 'B'], start: S1[0], end: S1[1], companies: MAIN5, details: advSteps, holiday: 'shift', noSite: true },
    { id: 'ppvgst', title: 'PPV works, GST works', type: 'office', mode: 'monthly', days: [1, 2], people: ['P', 'B'], start: S2[0], end: S2[1], companies: ['ppv-works'], details: 'Compulsory time allotment.', holiday: 'shift' },
    { id: 'out1', title: 'Outstation site measurement', type: 'outstation', mode: 'monthly', days: [2, 3, 4, 5], people: ['N', 'R', 'P'], start: DAY[0], end: DAY[1], siteGroup: 'outstation', maxDays: 4,
      details: 'Max 4 days including sheet preparation and cement calculations.', holiday: 'skip' },
    { id: 'sb', title: 'PPV, billing, estimation, bank visits, valuation checking', type: 'office', mode: 'monthly', days: [2, 3, 4, 5], people: ['S', 'B'], start: S1[0], end: S1[1], companies: ['ppv-works'],
      details: 'PPV works, billing, estimation works, bank visits in the first half, valuation checking. Compulsory time allotment. S does no site measurement on these days.', holiday: 'skip', noSite: true },
    { id: 'meet-sunniva-1', title: 'Joint meet: Sunniva SDL', type: 'meeting', mode: 'monthly', days: [5], people: ALLP, start: MEET[0], end: MEET[1], companies: ['sunniva-sdl'], details: meetDetail, holiday: 'shift', agenda: ag('Sunniva SDL', A75) },
    { id: 'meet-kipl-1', title: 'Joint meet: KIPL', type: 'meeting', mode: 'monthly', days: [6], people: ALLP, start: MEET[0], end: MEET[1], companies: ['kipl-sdl', 'kipl-sol', 'kipl-misc'], details: meetDetail, holiday: 'shift', agenda: ag('KIPL', A75) },
    { id: 'meet-mahto-1', title: 'Joint meet: Mahto, other contractor bills', type: 'meeting', mode: 'monthly', days: [7], people: ALLP, start: MEET[0], end: MEET[1], companies: ['mahto-sol'].concat(OTHER), details: meetDetail, holiday: 'shift', agenda: ag('Mahto & other contractors', A75) },
    { id: 'site-c1', maxDays: 7, title: 'Site measurements C-1', type: 'site', mode: 'monthly', days: [5, 6, 7, 8, 9, 10, 11], people: ['N', 'R', 'S', 'P'], start: DAY[0], end: DAY[1], siteGroup: 'main', cycle: 'C-1',
      details: 'Main contractors, with sheet preparation, cement calculation.', holiday: 'skip' },
    { id: 'bill1', title: 'BILLING-1', type: 'billing', mode: 'monthly', days: [8, 9], people: ['P', 'B'], start: DAY[0], end: DAY[1], companies: MAIN5, details: billSteps, holiday: 'shift', noSite: true },
    { id: 'site-c2', maxDays: 7, fillDays: true, title: 'Site measurements C-2', type: 'site', mode: 'monthly', days: [12, 13, 14, 15, 16, 17, 18], people: ['N', 'R', 'S', 'P'], start: DAY[0], end: DAY[1], siteGroup: 'other', cycle: 'C-2',
      details: 'For other contractors or main contractors.', holiday: 'skip' },
    { id: 'adv2', title: 'ADV-2 advances', type: 'advance', mode: 'monthly', days: [18], people: ['P', 'B'], start: DAY[0], end: DAY[1], companies: MAIN5, details: advSteps, holiday: 'shift', noSite: true },
    { id: 'bill2', title: 'BILLING-2', type: 'billing', mode: 'monthly', days: [19], people: ['P', 'B'], start: DAY[0], end: DAY[1], companies: MAIN5.concat(OTHER), details: billSteps + ' Includes other contractors.', holiday: 'shift', noSite: true },
    { id: 'out2', title: 'Outstation site measurement', type: 'outstation', mode: 'monthly', days: [20, 21, 22, 23], people: ['N', 'R'], start: DAY[0], end: DAY[1], siteGroup: 'outstation', maxDays: 4,
      details: 'Max 4 days including sheet preparation and cement calculations.', holiday: 'skip' },
    { id: 'est', title: 'Estimation works and works of comparisons', type: 'office', mode: 'monthly', days: [20, 21, 22, 23], people: ['P', 'B'], start: DAY[0], end: DAY[1], details: 'Compulsory time allotment.', holiday: 'skip' },
    { id: 'meet-sunniva-2', title: 'Joint meet: Sunniva', type: 'meeting', mode: 'monthly', days: [24], people: ALLP, start: MEET[0], end: MEET[1], companies: ['sunniva-sdl'], details: meetDetail, holiday: 'shift', agenda: ag('Sunniva', A75) },
    { id: 'meet-kipl-2', title: 'Joint meet: KIPL', type: 'meeting', mode: 'monthly', days: [25], people: ALLP, start: MEET[0], end: MEET[1], companies: ['kipl-sdl', 'kipl-sol', 'kipl-misc'], details: meetDetail, holiday: 'shift', agenda: ag('KIPL', A75) },
    { id: 'meet-mahto-2', title: 'Joint meet: Mahto, other contractor bills', type: 'meeting', mode: 'monthly', days: [26], people: ALLP, start: MEET[0], end: MEET[1], companies: ['mahto-sol'].concat(OTHER), details: meetDetail, holiday: 'shift', agenda: ag('Mahto & other contractors', A75) },
    { id: 'site-c3', maxDays: 7, title: 'Site measurements C-3', type: 'site', mode: 'monthly', days: [24, 25, 26, 27, 28, 29, 30], people: ['N', 'R', 'S', 'P'], start: DAY[0], end: DAY[1], siteGroup: 'main', cycle: 'C-3',
      details: 'Main contractors with sheet preparation, cement calculation.', holiday: 'skip' },
    { id: 'review', title: 'Daily check by B', type: 'review', mode: 'daily', people: ['B'], start: '18:30', end: '19:00',
      details: 'B checks the day\'s work of everyone and maintains the timetable. Monday to Friday.' },
    { id: 'ppv-s', title: 'PPV works (S)', type: 'office', mode: 'weekly', perWeek: 2, people: ['S'], start: DAY[0], end: DAY[1], companies: ['ppv-works'], noSite: true,
      details: 'PPV works of 2 days a week, assigned to S on priority. Office work: S can do other office work on these days but no site measurement.' }
  ];

  g.DEFAULT_PLAN = {
    version: 5,
    title: 'Works timetable',
    settings: { start: '2026-11-05', end: '2026-12-09', workStart: '10:30', workEnd: '19:00',
      slots: [{ start: '10:30', end: '13:30' }, { start: '14:30', end: '19:00' }],
      lunchStart: '13:30', lunchEnd: '14:30', sundayOff: true, sundayStreak: true, maxHours: 9,
      targetDays: 7, targetPoints: 100, retentionDays: 45, bPin: '',
      // B's private admin hours: Saturday and Sunday, and Monday up to 12 noon
      adminHours: [{ dow: 6, start: '09:00', end: '19:00' }, { dow: 0, start: '09:00', end: '19:00' }, { dow: 1, start: '08:00', end: '12:00' }] },
    holidays: [{ date: '2026-11-08', name: 'Diwali' }, { date: '2026-11-09', name: 'Diwali' }, { date: '2026-11-10', name: 'Diwali' }, { date: '2026-11-11', name: 'Diwali' }],
    people, companies, responsibilities, tasks,
    notes: [
      'P & P1 are the same person.', 'Meetings 9.15 to 10.30. Working time 10.30 to 7 in two slots: 10.30 to 1.30 and 2.30 to 7.', 'Timetable from 5th Nov to 9th Dec.',
      'Diwali holidays 8, 9, 10, 11 November.', 'Sundays holidays but may be adjusted for work streak.', 'B works Monday to Friday; Saturday and Sunday free.',
      'P/P1 does no site measurement on billing and advance days.', 'S does no site measurement on PPV, billing, estimation, bank visit and valuation days.',
      'Person-wise timetable with time allotment per day, per week, per month.', 'Company-wise chart: each company gets separate days for work on site.',
      'Meeting timetable with agenda and minutes for each agenda item.', 'Timetable for each advance payment day for P1 & B.',
      'Timetable for each billing day for P1 & B.', 'Daily quick review agenda for B to check everyone\'s work.',
      'Anyone out of station does not join the meeting.', 'Past days are read only, with remarks on what was done.',
      'Each site measurement has a target of 7 days. Ticking "done in time" gives 100 points.',
      'B marks importance Low, Medium or High on everyone\'s work.', 'Clearance form checkbox for every daily task of N, R, S, P/P1.',
      'Daily records of N, R, S, P/P1 are deleted after 45 days. B\'s records are kept until B deletes them.',
      'B has a private admin schedule for Saturday, Sunday and Monday morning, opened with a pattern.',
      'On leave: the day\'s work moves to the next working day.'
    ],
    away: {}, overrides: {}, visitOverrides: {}, status: {}, reviews: {}, remarks: {}, extra: [],
    importance: {}, clear: {}, leave: {}, targets: {}, followups: {}, admin: {}
  };
})(window);
