# Works timetable (version 2)

The office timetable from **B_planning_of_works.xlsx**: who measures which site, outstation trips, billing and advance days, and meetings.
It is a plain static website: no server, no login, no build step.

## Put it online

**GitHub Pages:** create a repository, upload everything in this folder (`index.html`, `assets/`, `data/`, `.nojekyll`), then go to **Settings → Pages → Deploy from a branch → main → / (root) → Save**.
The site appears at `https://<user>.github.io/<repository>/`. To use the address `spplan-timetable.github.io`, create an organisation called `spplan-timetable` and name the repository `spplan-timetable.github.io`.

**Cloudflare Pages (keeps the files private):** Workers & Pages → Create → Pages → **Upload assets**, then drag this folder in. To limit who can open it, add Cloudflare Access (Zero Trust → Access → Applications) with the office email addresses.

## The seven pages

| Page | What it shows |
| --- | --- |
| Today | One card per person: where they are (office, on site, outstation), their work hour by hour, and lunch 13:30–14:30. Also the meeting with its agenda and B's daily check. |
| Week | People against the days of the week. Drag work to another day, or onto another person on the same day. |
| People | One person's hours per week and month, their companies, their outstation trips (switch on or off), and every day. They can add the timetable to a phone calendar or print it. |
| Companies | Main contractors, outstation sites and other contractors, each with its site days. Click a date to change it. |
| Meetings | The agendas. Each item can have one or more people. People who are out of station that day do not attend. |
| Billing days | Time slots for P1 and B on each advance and billing day, one per company, with ticks. |
| Setup | Repeating work, who does which company, office hours, lunch, holidays, problems, Excel download, sharing and backup. |

## Rules built in

- Outstation sites: Sunniva Dhule, KIPL Dhule, Mahto Dhanbad and ETPL Dholpur. Everything else is in town.
- Anyone who is outstation that day does not join the meeting and does no in-town site work. Switch a trip off on the People page (or in the trip's window) when the person stays in town.
- Lunch 13:30–14:30 is kept free in every timetable. Work cannot be set to start inside lunch.
- Other contractors: Classic-1, Tekade, Aashish, Borkar, Unity, Classic-2, AKS, Rana, Aashish Stone, Vee L C, Pethe, plus Jaiswal and PPV Works.
- KIPL SDL is shared by N and R on separate days. N and R measure Mahto Dhanbad together on the same day.

## Sharing changes

Changes are saved in each browser, and every change can be undone.
To share them, use **Setup → Share & Excel**:
- **Copy share link**: send the link.
- **Download plan.json**: put the file in the `data` folder online, so everyone starts from it.
