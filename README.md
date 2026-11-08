# Works timetable (version 9)

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
| **Today** | The daily timetable, and the place where daily changes are made: each employee's work in Slot 1 and Slot 2 with High / Normal priority, clearance form, status and remark, 7-day target ticks, and a space to add a task. Below: meetings, billing ticks, 6 pm follow-ups and **B's daily check** (on leave, works completed today, sufficient / not sufficient, completed on time, timetable updated for tomorrow). |
| Week | Everyone against the seven days of a week. Holidays and days without work are thin dark-grey columns; days off are dark grey. |
| Month | Every day of the month for everyone; holidays and empty days are thin dark-grey rows. |
| Employees | All employees side by side: points, companies, outstation days with companies, 7-day targets, and every day. Print one employee with the button above the name. |
| Companies | The three groups, who measures each company and its site days; click a company for its monthly schedule. |
| **Meetings** | All editable: name, time, dates of the month, move or delete a single meeting day, agenda with minutes and people. |
| **Billing days** | All editable: time, company and tasks of every row, add or remove rows, done ticks, delete a whole day (asks to confirm). |
| **Link chart** | See and arrange who works where and when; give work by dragging, move, change, hand over, remove or copy it. |
| **B admin** | B's private hourly schedule (Saturday, Sunday, Monday morning), opened with B's pattern. |
| Settings (button at the top) | Repeating work, who measures which company, employees, hours, holidays and site windows, points and records, Excel and backup, login. |

## Rules built in

- Meetings 9:15–10:30; work in Slot 1 (10:30–13:30) and Slot 2 (14:30–19:00).
- **Site windows**: main contractors only on days 1–11 and 21–31, other contractors only on days 12–20, outstation only on the trip days (2–5 and 20–23). Exact days are set in Edit → Hours, holidays & site windows; work outside them is refused.
- **C-1 and C-3**: each person does one main company for the whole run; the next run takes the next company. **C-2** (12–19): each person's other contractors one after the other in continuous blocks of days (for example one company on 12, 13, 14 Nov, then the next on 16, 17, 18, 19 Nov); the order is the order in Settings → Who measures which company, and starts one company further on each month.
- P/P1 does no site work on billing and advance days; S does no site work on PPV, billing, estimation, bank visit and valuation days. Sunday is a day off for everyone; B also has Saturday off.
- 7-day target per site measurement, 100 points per tick. Priority is High or Normal. Clearance form tick for every daily task of N, R, S, P/P1. On leave moves the day's work to the next working day.
- Daily records of N, R, S, P/P1 are deleted after 45 days; B's records only when B deletes them.
- Dark mode: the button at the top switches Auto / Light / Dark. Printing always uses light colours.
