# Works timetable (version 7)

The office timetable from **B_planning_of_works.xlsx**: who measures which company, outstation trips, billing and advance days, meetings, targets and points.
A plain static website (no build step) for GitHub Pages. **Only B can open it**: nothing is shown until B logs in.

## Put it online (GitHub Pages)

Upload everything in this `website` folder (`index.html`, `assets/`, `.nojekyll`, this README) to a repository, then **Settings → Pages → Deploy from a branch → main → / (root) → Save**.
The website files contain **no office data** (no names, companies or work). That data is loaded once after login from `setup/starting-plan.json` (in the zip, **do not upload the setup folder**) and then lives in the database.

## Where the data is saved

| Mode | Where | Who can read it |
| --- | --- | --- |
| **Firebase** (after `setup/FIREBASE_SETUP.md`) | Cloud Firestore in your Firebase project, collection `timetable` | Only B's account (Firestore security rules). Same data on every device B uses. |
| **Local** (until Firebase is connected) | This browser's storage, **encrypted** with B's password (AES-256, key from PBKDF2 with 310 000 rounds) | Nobody without the password. Only on this one browser; clearing site data deletes it, so save backups. |

Only the light/dark choice is kept unencrypted. Backups (Edit → Excel & backup) are plain files: keep them safe.

## Security

- Login first; the page shows nothing before it. Log-off after **10 minutes** without use (Edit → Login & saving), or when the window/tab is closed.
- Wrong passwords: Firebase blocks repeated tries; local mode waits longer after 5 wrong tries.
- Strict Content-Security-Policy (only this site and Firebase may run scripts), no referrer, not indexed by search engines.
- The share link and the public `data/plan.json` of earlier versions were removed, because they exposed the timetable without a password.
- B's admin schedule also needs B's pattern, and it is kept in its own database document.

## Pages

| Page | What it does |
| --- | --- |
| Today | One day, slot by slot, for every employee; meetings; B's daily check. |
| Week | Everyone against the seven days of a week. |
| Month | Everyone's work for every day of the month (print as the monthly schedule). |
| Employees | One person: companies, trips, 7-day targets and points, every day. Phone calendar and PDF. |
| Companies | The three groups with their days, who measures each company, and its site days. Click a name for the company's monthly schedule. |
| Meetings | Dates, attendance and agendas with minutes. |
| Billing days | P1 and B's time slots per company on advance and billing days. |
| **Link chart** | Employees and companies as boxes and lines, with a time bar (half hour, day, month) and Play. Drag to arrange, drag from an employee's dot onto a company to give work, click a line to hand over, remove or copy it. |
| **Edit** | Every input in one place, in six sections: **Day** (leave, trip, importance, clearance, targets, billing ticks, remarks, B's check), **Week** (drag to move or hand over), **Companies** (who measures it, site days, importance, 6 pm follow-ups), **Plan** (repeating work and meeting agendas), **Settings** (hours, holidays, site windows, employees, points, records, Excel, backup, login), **B admin**. *Problems* appears only when there is one. |

Every page has a one-line description at the top; tap "About this page" for its purpose. Works on phones: the Week page becomes a day list, wide tables turn into cards, and the Link chart switches to a tall layout. On a laptop the Link chart fits the window. Every change, wherever it is made, is used by all pages, the chart, Excel and the PDFs.

## Rules built in

- Meetings 9:15–10:30; work in Slot 1 (10:30–13:30) and Slot 2 (14:30–19:00).
- **Site windows**: main contractors only on days 1–11 and 21–31, other contractors only on days 12–20, outstation only on the trip days (2–5 and 20–23). Exact days are set in Edit → Hours, holidays & site windows; work outside them is refused.
- **C-1 and C-3**: each person does one main company for the whole run; the next run takes the next company. **C-2** (12–19): one other contractor per day, in turn; what does not fit comes first next month.
- P/P1 does no site work on billing and advance days; S does no site work on PPV, billing, estimation, bank visit and valuation days. B works Monday to Friday.
- 7-day target per site measurement, 100 points per tick. Clearance form tick for every daily task of N, R, S, P/P1. On leave moves the day's work to the next working day.
- Daily records of N, R, S, P/P1 are deleted after 45 days; B's records only when B deletes them.
- Dark mode: the button at the top switches Auto / Light / Dark. Printing always uses light colours.
