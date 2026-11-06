# Works timetable (version 4)

The office timetable from **B_planning_of_works.xlsx**: who measures which site, outstation trips, billing and advance days, and meetings.
It is a plain static website: no server, no login, no build step.

## Put it online

**GitHub Pages:** create a repository, upload everything in this folder (`index.html`, `assets/`, `data/`, `.nojekyll`), then go to **Settings → Pages → Deploy from a branch → main → / (root) → Save**.
The site appears at `https://<user>.github.io/<repository>/`. To use the address `spplan-timetable.github.io`, create an organisation called `spplan-timetable` and name the repository `spplan-timetable.github.io`.

**Cloudflare Pages (keeps the files private):** Workers & Pages → Create → Pages → **Upload assets**, then drag this folder in. To limit who can open it, add Cloudflare Access (Zero Trust → Access → Applications) with the office email addresses.

## The pages

| Page | What it shows |
| --- | --- |
| Today | One card per person: where they are (office, on site, outstation), their work in Slot 1 (10:30–13:30) and Slot 2 (14:30–19:00), with meetings at 9:15–10:30. Past days are grey and read only, with a status and remarks box for each work. Also the meeting with its agenda and B's daily check. |
| Week | People against the days of the week. Drag work to another day, or onto another person on the same day. |
| People | One person's hours per week and month, their companies, their outstation trips (switch on or off), and every day. They can add the timetable to a phone calendar or print it. |
| Companies | Main contractors, outstation sites and other contractors, each with its site days. Click a date to change it. |
| Meetings | The agendas. Each item can have one or more people. People who are out of station that day do not attend. |
| Billing days | Time slots for P1 and B on each advance and billing day, one per company, with ticks. |
| Month | Everyone's work for the whole month, day by day, with importance and clearance ticks. |
| Company schedule | Click a company name on the Companies page: its monthly timetable, importance, and a 6 pm follow-up box for each day. |
| B admin | B's private hourly schedule for Saturday, Sunday and Monday up to 12 noon. Opened with B's pattern. |
| Setup | Repeating work, who does which company, weekly days off, the two working slots, holidays, problems, Excel download, sharing and backup. |

## Rules built in

- Outstation sites: Sunniva Dhule, KIPL Dhule, Mahto Dhanbad and ETPL Dholpur. Everything else is in town.
- Anyone who is outstation that day does not join the meeting and does no in-town site work. Switch a trip off on the People page (or in the trip's window) when the person stays in town.
- Meetings 9:15–10:30. Work is in two slots, 10:30–13:30 and 14:30–19:00; two different works can share a day, one per slot.
- When work is added by hand (or its time is changed), everyone's other work that day is moved around it automatically.
- B works Monday to Friday. Meetings, billing and advances that fall on a Saturday, Sunday or holiday move to the next day everyone works; B's daily check is Monday to Friday only.
- P/P1 does no site measurement on billing and advance days. S does no site measurement on PPV, billing, estimation, bank visit and valuation days. PPV works are placed for S first, two days a week.
- Office work for someone who is outstation that day moves to another day.
- Past days are grey and cannot be changed; fill in the status and remarks instead. Remarks are also in the Excel download.
- Other contractors: Classic-1, Tekade, Aashish, Borkar, Unity, Classic-2, AKS, Rana, Aashish Stone, Vee L C, Pethe, plus Jaiswal and PPV Works.
- C-2: on every C-2 day each of N, R, S and P/P1 measures one of their own other contractors (for example N: Classic-1 or Tekade), taking them in turn. If someone has more contractors than C-2 days, two share a day (Slot 1 and Slot 2), so none is left out.
- KIPL SDL is shared by N and R on separate days. N and R measure Mahto Dhanbad together on the same day.

## Version 4

- **B mode**: the B button at the top opens B mode with B's pattern (drawn the first time, at least 4 dots). In B mode, B sets importance Low / Medium / High on everyone's work, opens the admin schedule and can delete his own records. "Forgot the pattern?" resets it, and deletes the admin schedule so it stays private.
- **7-day site target and points**: every company site measurement must be done within 7 days of the start of the run. From the site day until the 7th day each person sees a tick box ("measured within 7 days"); after that it disappears. Each tick = 100 points. Points are on the Today page, the People page and in Excel. Days and points can be changed in Setup → Records & points.
- **Clearance form** tick box on every daily task of N, R, S and P/P1 (today and past days).
- **On leave** button on each person's card (N, R, S, P/P1). That day's work moves to the person's next working day; meetings are simply missed. A site day goes to the other days of the same run.
- **Clean-up**: daily records of N, R, S, P/P1 older than 45 days are deleted automatically each day. B's records and the points are never deleted automatically; B can delete them in Setup → Records & points.
- **Print / save PDF** button on Today (daily), Week, Month, People (personal), Company schedule and B admin. In the print window choose "Save as PDF". Pages print on A4 landscape.

The pattern only keeps the admin page out of casual view; it is not a password. The admin schedule stays in B's browser and backups, and is left out of plan.json and share links.

## Sharing changes

Changes are saved in each browser, and every change can be undone.
To share them, use **Setup → Share & Excel**:
- **Copy share link**: send the link.
- **Download plan.json**: put the file in the `data` folder online, so everyone starts from it.

## Upgrading

Replace all the files, including `data/plan.json` (two new scripts were added: `bmode.js` and `pages.js`). Changes already saved in a browser are kept and moved to the new times.
