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
├── scripts/garmin_sync.py      # Fetches recent hikes from Garmin Connect (weekly sync)
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
```

## Editing content

You shouldn't need to touch any component to personalise the site.

- **`src/data/content.ts`** holds the name, tagline, bio, links (email, LinkedIn, GitHub, Instagram), skills, projects, PRs, founder story and more. Change the `site.name` / `site.title` fields to rename the whole site (also update the `<title>` and meta tags in `index.html`, and regenerate `public/og-image.png` if you want the social preview to match).
- **`src/data/hikes.json`** holds hikes (name, location, distance, elevation, difficulty, notes, photos) and the "dream adventures" bucket list.
- **Photos:** drop files into `public/images/` and reference them in the data files as `images/your-file.jpg` (no leading slash — the site adds the correct base path automatically). Leave `src: ''` to show an illustrated placeholder instead. WebP/JPEG around 1200px wide keeps things fast.
- **Placeholders:** any text wrapped in `[square brackets]` (e.g. `[Your city]`) is a placeholder. It's automatically highlighted with a dashed pink outline on the site so you can spot what still needs real info — replace it and the highlight disappears.

## Invites straight to Gmail

The Tiny AI's **Invite Yiyi ♡** button and the Connect page send invites through your own Google Apps Script relay. It runs as you, so every invite is sent **from your Gmail to your Gmail**, and replying to it answers the visitor. It's free and doesn't need a server. Set it up once:

1. Open [script.google.com](https://script.google.com), click **New project**, paste in `scripts/invite-relay.gs`, and save.
2. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy** and authorize.
3. Copy the **Web app URL** (it ends in `/exec`) into `links.inviteScriptUrl` in `src/data/content.ts`, then commit and push.

Until `inviteScriptUrl` is set, the form opens the visitor's own email app with the invite already written. If the relay is ever unreachable, the form shows a "send it from your email app" link.

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

## Garmin auto-sync (weekly)

`.github/workflows/garmin-sync.yml` runs every Monday at 06:00 UTC. It logs in to Garmin Connect, fetches your hiking, walking and mountaineering activities from the last 14 days (with GPX tracks for real elevation profiles), and merges them into `src/data/hikes.json`. If anything changed, it builds the site, commits the update to `main` and redeploys GitHub Pages. If nothing changed, it does nothing.

The merge never touches what you wrote by hand. Names, locations, photos, experience, takeaway and a difficulty you set yourself are kept. Only Garmin's numbers are refreshed: date, distance, elevation, times and the elevation profile. New hikes are added with `[placeholder]` text and an empty photo for you to fill in. A Garmin activity is linked to an existing hike by its Garmin ID, or, the first time, by a matching name on a hike whose date is still a placeholder (e.g. "Niagara Falls Hiking" → "Niagara Falls").

### One-time setup

1. In your repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `GARMIN_EMAIL`: the email you use to sign in to Garmin Connect
   - `GARMIN_PASSWORD`: your Garmin Connect password
2. Make sure **Settings → Pages → Source** is **GitHub Actions** (same as for the normal deploy).
3. The workflow file must be on `main`. GitHub only runs scheduled workflows from the default branch.

### Run it manually

**Actions** tab → **Garmin weekly sync** → **Run workflow**. You can change how many days back to look, and tick *force_deploy* to rebuild the site even when no hikes changed. If you have the [GitHub CLI](https://cli.github.com/): `gh workflow run garmin-sync.yml -f days=60`.

To do the same thing on your own computer:

```bash
pip install "garminconnect>=0.3,<0.4"
GARMIN_EMAIL=you@example.com GARMIN_PASSWORD='…' python scripts/garmin_sync.py --out garmin-export --days 30
node scripts/import-garmin.mjs garmin-export --dry-run   # preview, then run again without --dry-run
```

### Caveats

- **Unofficial connection.** Garmin has no public API for personal accounts, so this uses the community [`garminconnect`](https://github.com/cyberjunky/python-garminconnect) library, which signs in the way the Garmin website does. Garmin can change its login, add a captcha or block GitHub's servers at any time, and the sync will then stop working until the library catches up. When it fails, the run turns red with a plain-English reason at the top of the run page, and nothing is committed or deployed. Your site keeps working, it just doesn't get new hikes. You can always fall back to exporting files by hand and running `npm run import:garmin`.
- **Two-step verification (MFA) must be off or handled.** A scheduled run can't type the code Garmin sends you, so with MFA on, the login fails with "Garmin asked for an MFA code". Either turn MFA off for your Garmin account, or handle it with saved login tokens:
  1. On your own computer, run `GARMIN_EMAIL=… GARMIN_PASSWORD='…' python scripts/garmin_sync.py --save-tokens` and enter the MFA code when asked.
  2. Copy the JSON it prints into a third repo secret named `GARMIN_TOKENS`. The workflow uses it instead of a fresh password login. When the tokens eventually expire (the log will say login failed), run step 1 again.
- Your password is stored only as an encrypted GitHub secret and is never printed in logs. Garmin may email you about a "new sign-in" the first few times the workflow runs.
