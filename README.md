# Yiyi's Universe ♡

**Data, Dumbbells & Big Dreams.** An interactive, pink, slightly chaotic personal website: four "worlds" to explore (Brain, Gym, Mountains, Founder), a tiny in-browser recommender AI, a rep-counting mini game, a hike journal, a founder scrapbook, badges to collect and a handful of hidden easter eggs.

Built with React 18, Vite, TypeScript, Tailwind CSS v4 and Motion. It's a fully static site with hash routing (`#/gym`, `#/mountains`, …), so it runs on GitHub Pages with no server and no 404 tricks.

---

## Folder structure

```
.
├── index.html                  # HTML shell, SEO + social (Open Graph) tags
├── public/                     # Copied as-is into the build
│   ├── favicon.svg
│   ├── og-image.png            # Social preview image (1200×630)
│   ├── images/                 # ← your photos go here
│   ├── robots.txt
│   └── .nojekyll
├── src/
│   ├── main.tsx                # Entry: fonts, global CSS, <App/>
│   ├── App.tsx                 # Layout, page transitions, disco mode, badges
│   ├── index.css               # Tailwind theme (colors, fonts) + shared styles
│   ├── data/
│   │   ├── content.ts          # ✎ almost every word, link and photo on the site
│   │   └── hikes.json          # ✎ hikes + dream adventures for the Mountains world
│   ├── lib/                    # Router, badge/secret state, confetti, asset paths
│   ├── components/             # Nav, Footer, badges widget, avatar, photo frames…
│   └── sections/               # One folder/file per page
│       ├── Home.tsx, About.tsx, Connect.tsx
│       ├── brain/              # The Brain + the "Train my tiny AI" demo
│       ├── gym/                # The Gym + "Beat my reps" game
│       ├── mountains/          # The Mountains journal + map
│       └── founder/            # The Founder scrapbook
├── scripts/
│   ├── import-garmin.mjs       # Garmin export (CSV/GPX/TCX) → hikes.json
│   ├── garmin_sync.py          # Downloads recent hikes via Garmin's Personal API (weekly sync)
│   └── fixtures/               # Sample Garmin files used by the importer tests
└── .github/workflows/
    ├── deploy.yml              # Auto-deploy to GitHub Pages
    └── garmin-sync.yml         # Weekly Garmin → hikes.json sync + redeploy
```

## Run it locally

Requires Node 20+ (22 recommended).

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build locally
npm run typecheck    # TypeScript only
npm run import:garmin -- <files>   # merge Garmin exports into hikes.json (see below)
npm run test:garmin  # importer tests (run against temp copies, never the real data)
```

## Editing content

You shouldn't need to touch any component to personalise the site.

- **`src/data/content.ts`** holds the name, tagline, bio, links (email, LinkedIn, GitHub, Instagram), skills, projects, PRs, founder story and more. Change the `site.name` / `site.title` fields to rename the whole site (also update the `<title>` and meta tags in `index.html`, and regenerate `public/og-image.png` if you want the social preview to match).
- **`src/data/hikes.json`** holds hikes (name, location, distance, elevation, difficulty, notes, photos) and the "dream adventures" bucket list. Real stats can come straight from Garmin, see [Hiking data from Garmin](#hiking-data-from-garmin).
- **Photos:** drop files into `public/images/` and reference them in the data files as `images/your-file.jpg` (no leading slash — the site adds the correct base path automatically). Leave `src: ''` to show an illustrated placeholder instead. WebP/JPEG around 1200px wide keeps things fast.
- **Placeholders:** any text wrapped in `[square brackets]` (e.g. `[Your city]`) is a placeholder. It's automatically highlighted with a dashed pink outline on the site so you can spot what still needs real info — replace it and the highlight disappears.

## Invites + calendar

The Tiny AI's **Invite Yiyi ♡** button and the Connect page have a date & time picker. It starts folded up as a **Pick a date & time** button (on Connect it's marked optional). Opening it shows a month calendar with ‹ › arrows, so visitors can go to any month from now up to two years ahead. They pick a day, then a start time (6:00–22:00 Toronto time, 30-minute steps; plans of 5+ hours only start in the morning). After each pick it folds back into a chip, and they can **add another time**, up to 5 options with one shared duration. Yiyi accepts the one that works. The duration defaults to the activity (e.g. 9 hrs for the all-day hike, 1.5 hrs for a lifting session) and visitors can change it. Times are shown in your time (Toronto) and in the visitor's own time when it's different.

**Work hours are never bookable:** Monday–Friday 9:00–19:00 Toronto time. Any slot that touches that window shows as "work hours", and the relay rejects it too. Weekday mornings before 9, evenings after 7 and weekends stay open. Plans longer than 3 hours can't fit around work, so the picker says weekdays are work days and big adventures live on weekends. The rule is `WORK_HOURS` in `src/lib/calendar.ts` and `CONFIG.WORK_HOURS` in `scripts/invite-relay.gs`. Change both together.

Everything goes through your own Google Apps Script relay, `scripts/invite-relay.gs`. It runs as **yiyitan076@gmail.com**, is free, and doesn't need a server.

**How a booking works**

1. When a visitor opens the picker, it asks the relay for busy times from **both** calendars (yiyitan076@gmail.com and ee.official67@gmail.com) for the month they're looking at, and greys those slots out. One query covers at most 62 days.
2. The visitor sends 1–5 proposed times. The relay checks every time again (future, ≤ 12 hours, outside work hours, not overlapping each other, not busy on either calendar). If one was just taken, the visitor is asked to replace it.
3. Each time gets a pink **"♡ Request (option N/M): <activity> with <name>"** hold on your yiyitan076 calendar (just "♡ Request: …" when there's one time). You get **one** email listing every option, each with its own **Accept this time** button, plus one **Decline all**. The visitor is not invited yet.
4. **Accept this time** sends the visitor a real Google Calendar invite from you for that time (titled "♡ <activity> with <name>") and removes all the holds. **Decline all** removes every hold and emails them a kind "those times don't work" note from your Gmail. Each link opens a confirmation page first, so nothing happens until you click the button there. Once you've accepted or declined, all of that request's links stop working.

**Setup (once)**

1. **Share the second calendar.** Sign in as **ee.official67@gmail.com** → [Google Calendar](https://calendar.google.com) → ⚙️ **Settings** → under *Settings for my calendars* pick the calendar → **Share with specific people or groups** → **Add people** → `yiyitan076@gmail.com` with **See only free/busy (hide details)** (that's enough; "See all event details" works too) → **Send**. If yiyitan076 gets an email about it, open it and add the calendar.
2. **Paste the script.** Open [script.google.com](https://script.google.com) as **yiyitan076@gmail.com**. Open your existing invite project (or click **New project**), replace everything with `scripts/invite-relay.gs`, and save. The calendars are set at the top in `CONFIG.CALENDAR_IDS` (`'primary'` is yiyitan076's own calendar and is where holds go; then `'ee.official67@gmail.com'`).
3. **Deploy.**
   - First time: **Deploy → New deployment → Web app**, **Execute as: Me**, **Who has access: Anyone** → **Deploy**.
   - Already deployed before: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The `/exec` URL stays the same. Saving the file alone does **not** update the live web app.
4. **Authorize.** Google asks for permission to send email, manage your calendars and connect to an external service (the Calendar free/busy API). The script now needs Calendar access, so you'll be asked to authorize again even if you did before. If you see "Google hasn't verified this app", click **Advanced → Go to (project name)**; it's your own script.
5. Copy the **Web app URL** (it ends in `/exec`) into `links.inviteScriptUrl` in `src/data/content.ts`, then commit and push.

To check it works, open `<your /exec URL>?action=availability` in a browser. You should see `"success":true` and a list of busy blocks. If `calendarsMissing` lists `ee.official67@gmail.com`, the share from step 1 hasn't reached yiyitan076 yet; the site keeps working with just your own busy times.

**Privacy.** The public availability endpoint only ever returns busy start/end times, merged across both calendars. Event titles, descriptions, guests and locations are never sent to the website. There are no keys or secrets in the site's code: the relay runs inside your Google account, and Accept/Decline links use one-time random tokens stored in the script's properties. The honeypot field and the 30-invites-per-hour limit are still in place.

**Before the relay is set up** (`inviteScriptUrl: ''`), the picker still works without live busy times. Sending opens the visitor's email app with every proposed time (in both time zones) already written. They also get a **Google Calendar** and an **.ics** button for each time that add yiyitan076@gmail.com as a guest, so you receive real calendar invites and accept the one that works. If the relay is ever unreachable, the form shows a "send it from your email app" link.

Relay tests (runs the script's logic in Node with fake Google services): `npm run test:invite`.

## Easter eggs

1. **The heart in the footer** — click it 5 times.
2. **"don't click me"** — the dumbbell sticker in the Gym. Click it anyway (your cursor gets swole).
3. **The mountains** — hover (or keyboard-focus) the peaks in the Mountains world.
4. **Type `disco`** anywhere on the site (not inside a text field) for DISCO PINK MODE.
5. **"psst… plot twist?"** — the little button in the footer.
6. **Four world badges** — visit Brain, Gym, Mountains and Founder to collect all four (progress is saved in your browser; see the widget in the bottom-left corner).

## Deploy to GitHub Pages

The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to `main`. It figures out the right base path automatically.

**One-time setup:** in your repo go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

### Option A — project site (`https://<username>.github.io/<repo-name>/`)

Push this repo as-is (e.g. `yiyi-web`). The workflow builds with base path `/<repo-name>/`, and the site appears at `https://<username>.github.io/<repo-name>/`.

### Option B — user site (`https://<username>.github.io/`)

Create (or rename) a repo called exactly `<username>.github.io` and push this code to it. The workflow detects the `.github.io` suffix and builds with base path `/`.

To build manually for a sub-path: `VITE_BASE=/my-repo/ npm run build`.

You can re-run a deploy any time from the **Actions** tab ("Deploy to GitHub Pages" → *Run workflow*).

## Hiking data from Garmin



```bash
GARMIN_API_KEY='GCDC_...' python scripts/garmin_sync.py --out garmin-export --days 90
npm run import:garmin -- garmin-export --min-km 2 --dry-run   # preview, then run again without --dry-run
```
