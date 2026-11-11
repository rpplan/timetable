# Works timetable (version 13)

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

Only the light/dark choice is kept unencrypted. Backups (Settings → Excel & backup) are plain files: keep them safe.

## Security

- Login first; the page shows nothing before it. Log-off after **10 minutes** without use (Settings → Login & saving), or when the window/tab is closed.
- Wrong passwords: Firebase blocks repeated tries; local mode waits longer after 5 wrong tries.
- Strict Content-Security-Policy (only this site and Firebase may run scripts), no referrer, not indexed by search engines.
- The share link and the public `data/plan.json` of earlier versions were removed, because they exposed the timetable without a password.
- B's admin schedule also needs B's pattern, and it is kept in its own database document.

## Pages

| Page | What it does |
| --- | --- |
| **Today** | The daily timetable: one line at the top for the day's joint meeting (click it to open the meeting); each employee's work with priority, clearance form, notes, status and remark, an **On leave** tick and **Works completed today: Sufficient / Not sufficient**, and a space to add a task with a menu of all companies. Holidays and Sundays show a dark-grey card with a **Works today** tick. Below: yesterday's action points, billing ticks and the 6 pm follow-up (company engineers and action points for the next day). |
| **Month** | Every day of the month for everyone, in light colours per kind of work. Mark cells for target completion (positive = green and points, negative = orange). Commitments (◷) and action points (↳) in fine text. **+ Meeting** under a date adds a meeting that day. The **Week** tab shows one week in exactly the same layout. |
| Employees | All employees side by side: points for target completion, companies, outstation days, and every day with notes, commitments and action points. |
| **Companies** | Each company has its own **Billing list**, **Rate list 2025-26** and **Rate list 2026-27** upload buttons and a search box that shows whether a work is already billed and where it is in the rate lists. Under the site days, a button for each run of the month (e.g. "Nov: 20, 21, 22, 23 Nov") adds a day before or after, any other day, or takes a day out, for that month only; for outstation trips it also sets which company is visited on which day. Click a company for its monthly schedule, where the 6 pm follow-up points are written point by point. |
| **Meetings** | A list of every meeting by date. Click one to open it: name, day, **Meeting cancelled**, agenda (move items up or down; the times follow), **Commitments** (for each employee, only the work given to him; 0 days = same day) and the open **6 pm follow-up points**. The time slot of every meeting stays the same. |
| **Billing days** | Time, company and pointwise tasks with their own ticks on every row; add or remove rows; delete a whole day (asks to confirm). |
| **Link chart** | The team in the middle, companies around it in coloured islands, one line colour per employee. Click a line to make it **high priority (gold)**, move, copy, hand over or remove it; pull a line onto another company to move that work there; drag ⊕ onto a company to give work. |
| **B admin** | Opened with B's pattern: day schedule (weekday / weekend sections, Monday banking, officers meeting and goodwill visits, Tuesday site visit with agenda and hourly plan), one section over the next 10 days, work lists, **PPV Works** and **Architectural Works** monthly schedules. Its details are loaded once from `setup/update-nov-2026.json`. |
| Settings (button at the top) | Repeating work, who measures which company, company engineers, employees, hours, holidays and site windows, points and records, Excel, backup and update file, login. |

## Rules built in

- Timetable up to 31 December 2026. Meetings 9:15–10:30; work in Slot 1 (10:30–13:30) and Slot 2 (14:30–19:00).
- **Site windows**: main contractors only on days 1–11 and 21–31, other contractors only on days 12–20, outstation only on the trip days (2–5 and 20–23). Exact days are set in Settings → Hours, holidays & site windows; work outside them is refused.
- **C-1 and C-3**: each person does one main company for the whole run; the next run takes the next company. **C-2** (12–19): each person's other contractors one after the other in continuous blocks of days (for example one company on 12, 13, 14 Nov, then the next on 16, 17, 18, 19 Nov); the order is the order in Settings → Who measures which company, and starts one company further on each month.
- P does no site work on billing and advance days; S does no site work on PPV, billing, estimation, bank visit and valuation days. Sunday is a day off for everyone; B also has Saturday off.
- 100 points per positive mark in the monthly schedule. Priority is High or Normal. Clearance form tick for every daily task of N, R, S, P. On leave moves the day's work to the next working day.
- Daily records of N, R, S, P are deleted after 45 days; B's records only when B deletes them.
- Dark mode: the button at the top switches Auto / Light / Dark. Printing always uses light colours.
