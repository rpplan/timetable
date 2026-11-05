# Works timetable (version 3)

The office timetable from **B_planning_of_works.xlsx**: who measures which site, outstation trips, billing and advance days, and meetings.
It is a plain static website: no server, no login, no build step.

## Put it online

**GitHub Pages:** create a repository, upload everything in this folder (`index.html`, `assets/`, `data/`, `.nojekyll`), then go to **Settings → Pages → Deploy from a branch → main → / (root) → Save**.
The site appears at `https://<user>.github.io/<repository>/`. To use the address `spplan-timetable.github.io`, create an organisation called `spplan-timetable` and name the repository `spplan-timetable.github.io`.

**Cloudflare Pages (keeps the files private):** Workers & Pages → Create → Pages → **Upload assets**, then drag this folder in. To limit who can open it, add Cloudflare Access (Zero Trust → Access → Applications) with the office email addresses.

## The seven pages

| Page | What it shows |
| --- | --- |
| Today | One card per person: where they are (office, on site, outstation), their work in Slot 1 (10:30–13:30) and Slot 2 (14:30–19:00), with meetings at 9:15–10:30. Past days are grey and read only, with a status and remarks box for each work. Also the meeting with its agenda and B's daily check. |
| Week | People against the days of the week. Drag work to another day, or onto another person on the same day. |
| People | One person's hours per week and month, their companies, their outstation trips (switch on or off), and every day. They can add the timetable to a phone calendar or print it. |
| Companies | Main contractors, outstation sites and other contractors, each with its site days. Click a date to change it. |
| Meetings | The agendas. Each item can have one or more people. People who are out of station that day do not attend. |
| Billing days | Time slots for P1 and B on each advance and billing day, one per company, with ticks. |
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
- KIPL SDL is shared by N and R on separate days. N and R measure Mahto Dhanbad together on the same day.

## Sharing changes

Changes are saved in each browser, and every change can be undone.
To share them, use **Setup → Share & Excel**:
- **Copy share link**: send the link.
- **Download plan.json**: put the file in the `data` folder online, so everyone starts from it.

## Upgrading from version 2

Replace all the files, including `data/plan.json`. Changes already saved in a browser are kept and moved to the new times.
