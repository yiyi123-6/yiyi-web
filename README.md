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

The Tiny AI's **Invite Yiyi ♡** button and the Connect page use the exact same date & time picker (`src/components/SlotPicker.tsx`, with all rules in `src/lib/calendar.ts`). It starts folded up as a **Pick a date & time** button. Picking a time is optional on both, so a plain message still works. Opening it shows a month calendar with ‹ › arrows, so visitors can go to any month from now up to two years ahead. They pick a day, then a start time (30-minute steps inside that day's bookable hours, Toronto time; plans of 5+ hours only start in the morning, by 10:00). After each pick it folds back into a chip, and they can **add another time**, up to 5 options with one shared duration. Yiyi accepts the one that works. The duration defaults to the activity (e.g. 9 hrs for the all-day hike, 1.5 hrs for a lifting session) and visitors can change it. Times are shown in your time (Toronto) and in the visitor's own time when it's different.

**Bookable hours (Toronto time):** weekdays **19:00–22:00** (before that is work, shown as "Until 7 PM · work hours"). Saturday and Sunday open at **9:00** for most plans and at **6:00** for runs, hikes and snowboarding (Tiny AI's all-day hike, sunrise summit hike, snowboarding day and morning run, and Connect's "Let's go hiking"), until **22:00**. For other plans the weekend time list starts with a greyed "Before 9 AM · early starts are for runs, hikes & snowboarding" row. A plan has to start and end inside its day's window, and the relay rejects anything else too. So a 9-hour hike can start 6:00–10:00 on a weekend. Plans longer than 3 hours can't fit into a weekday evening, so the picker says weekdays are work days and big adventures live on weekends. On Connect, switching to another option keeps the picked times that still fit the new plan and gently says which ones were taken off.

The rules are two lists, kept identical in `src/lib/calendar.ts` and `scripts/invite-relay.gs`: `BOOKABLE_HOURS` (per weekday; `earlyStartMin` is the early weekend start) and `EARLY_ACTIVITIES` (the activity ids that may start early). The site sends the activity id with each request and the relay checks it against its **own** list, so editing the page can't unlock early times for a coffee. Change both files together (`npm run test:invite` fails if they differ).

Everything goes through your own Google Apps Script relay, `scripts/invite-relay.gs`. It runs as **yiyitan076@gmail.com**, is free, and doesn't need a server.

**How a booking works**

1. When a visitor opens the picker, it asks the relay for busy times from your Google calendar (yiyitan076@gmail.com) plus any iCloud calendars you've linked (see below) for the month they're looking at, and greys those slots out. One query covers at most 62 days.
2. The visitor sends 1–5 proposed times. The relay checks every time again (future, ≤ 12 hours, inside bookable hours, not overlapping each other, not busy on any calendar, with iCloud read fresh at that moment). If one was just taken, the visitor is asked to replace it.
3. Each time gets a pink **"♡ Request (option N/M): <activity> with <name>"** hold on your yiyitan076 calendar (just "♡ Request: …" when there's one time). You get **one** email listing every option, each with its own **Accept this time** button, plus one **Decline all**. The visitor is not invited yet.
4. **Accept this time** sends the visitor a real Google Calendar invite from you for that time (titled "♡ <activity> with <name>") and removes all the holds. **Decline all** removes every hold and emails them a kind "those times don't work" note from your Gmail. Each link opens a confirmation page first, so nothing happens until you click the button there. Once you've accepted or declined, all of that request's links stop working.

**Setup (once)**

1. **Paste the script.** Open [script.google.com](https://script.google.com) as **yiyitan076@gmail.com**. Open your existing invite project (or click **New project**), replace everything with `scripts/invite-relay.gs`, and save. Busy times and holds use your own calendar (`CONFIG.CALENDAR_IDS: ['primary']`).
2. **Deploy.**
   - First time: **Deploy → New deployment → Web app**, **Execute as: Me**, **Who has access: Anyone** → **Deploy**.
   - Already deployed before: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The `/exec` URL stays the same. Saving the file alone does **not** update the live web app.
3. **Authorize.** Google asks for permission to send email, manage your calendars, connect to an external service (the Calendar free/busy API and iCloud) and run while you're away (the daily iCloud sync). New permissions mean you'll be asked again even if you authorized before. If you see "Google hasn't verified this app", click **Advanced → Go to (project name)**; it's your own script.
4. Copy the **Web app URL** (it ends in `/exec`) into `links.inviteScriptUrl` in `src/data/content.ts`, then commit and push.

To check it works, open `<your /exec URL>?action=availability` in a browser. You should see `"success":true` and a list of busy blocks.

**Optional: iCloud calendar busy times**

The relay can also read your iCloud calendars directly, so events you add on your iPhone block those times on the site.

1. **Make the iCloud calendar public and copy its link.** Either:
   - **iCloud.com:** sign in at [icloud.com](https://www.icloud.com) → **Calendar** → in the calendar list on the left, click the **share icon** (the little person) next to the calendar → tick **Public Calendar** → **Copy Link**.
   - **iPhone:** open the **Calendar** app → **Calendars** (bottom) → tap **ⓘ** next to the calendar → turn on **Public Calendar** → **Share Link…** → **Copy**.

   The link starts with `webcal://p…-caldav.icloud.com/published/…`. That's fine as is. Repeat for each iCloud calendar you want included.
2. **Save the links in the relay (once).** In the Apps Script project:
   1. Paste the latest `scripts/invite-relay.gs` over everything (if you haven't already).
   2. Near the end, find `const ICLOUD_URLS_TO_SAVE = [ … ];` and paste your links between the brackets, each in quotes with a comma after it, e.g. `'webcal://p01-caldav.icloud.com/published/2/…',`. Click **Save** (💾).
   3. In the toolbar, choose **setIcloudUrls** in the function dropdown (next to **Debug**) → click **Run**.
   4. First time: **Review permissions** → pick yiyitan076 → **Advanced → Go to (project name) (unsafe)** → **Allow**.
   5. Check the **Execution log** at the bottom. It says how many calendars were read, plus events, busy blocks and errors, and lists any calendar that couldn't be read. It never shows titles or links. An empty calendar shows "0 events", which is fine.
   6. Empty the list again (`const ICLOUD_URLS_TO_SAVE = [ ];`) and click **Save**, so the links only live in **Project Settings → Script Properties → `ICLOUD_ICS_URLS`**.
   7. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.

   To change the links later, do the same again, or edit `ICLOUD_ICS_URLS` under **Project Settings** (⚙️) **→ Script Properties**. To stop using iCloud, delete that property.
3. **Check it.** Open `<your /exec URL>?action=availability`. Your iCloud events show up as busy blocks, `icloudSyncedAt` says when the last sync ran, and `"icloudErrors":0` means every link was read. A number above 0 means that many links couldn't be fetched (or weren't links), and those are skipped while everything else keeps working.

Never put the links in this repo. They live only in the script properties of your Google account.

**How the sync works.** `setIcloudUrls` installs a daily trigger (`installDailySync`, safe to run again) that runs `syncIcloud` around 5 AM Toronto time. It reads every link, works out your busy times from now to 400 days ahead, and stores only start/end times (no titles) as a few small Script Properties: about 10 characters per busy block, so a year of seven calendars is a few KB. That's well inside the 9 KB per value / 500 KB total limits, and reading them is fast, with no extra Drive permission. The month view reads that stored snapshot. Months beyond it, or everything before the first sync, are read live. Right before holds are created for a request, the relay reads iCloud **live**, so an event you added this afternoon still blocks that time. If iCloud can't be reached then, it uses the morning's snapshot. If a calendar fails during the daily sync, its busy times from the day before are kept. You can also run `syncIcloud` by hand any time from the toolbar.

It understands times in any time zone (the IANA names iCloud uses, like `America/Toronto`, `America/Los_Angeles` and `America/Vancouver`, no `VTIMEZONE` needed), all-day events (they block the whole day in Toronto), repeating events (daily/weekly/monthly/yearly, like "every 2nd Monday" or "last Friday"), skipped and moved occurrences, and ignores cancelled events and events marked **Free**.

*Privacy tradeoff:* a public iCloud link is long and unguessable, but anyone who has it can read that calendar's events (titles included). Only the relay sees it, and the website only ever gets busy start/end times. If you'd rather not publish a link, you can instead subscribe to the iCloud calendar inside Google Calendar (**Other calendars → + → From URL**) and add its **Calendar ID** (Google Calendar ⚙️ Settings → that calendar → *Integrate calendar*) to `CONFIG.CALENDAR_IDS`. Google only refreshes subscribed calendars every 8–24 hours, though, so the direct link is much fresher.

**Privacy.** The public availability endpoint only ever returns busy start/end times, merged across your calendars. Event titles, descriptions, guests and locations are never sent to the website. There are no keys or secrets in the site's code: the relay runs inside your Google account, and Accept/Decline links use one-time random tokens stored in the script's properties. The honeypot field and the 30-invites-per-hour limit are still in place.

**Requests only go through yiyitan076@gmail.com.** The forms never open the visitor's email app or calendar. Before the relay is set up (`inviteScriptUrl: ''`), visitors can still write a message and pick times, but instead of a send button they see "Booking opens soon ♡ Yiyi is setting up her calendar". If the relay is ever unreachable, the form asks them to try again.

Relay tests (runs the script's logic in Node with fake Google services, including a synthetic year of iCloud feeds): `npm run test:invite`. Picker rules: `npm run test:calendar`.

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
