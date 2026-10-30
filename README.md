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

## Hiking data from Garmin



```bash
GARMIN_API_KEY='GCDC_...' python scripts/garmin_sync.py --out garmin-export --days 90
npm run import:garmin -- garmin-export --min-km 2 --dry-run   # preview, then run again without --dry-run
```
