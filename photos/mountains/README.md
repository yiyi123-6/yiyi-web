# Mountains photos

Drop photos for a hike into its folder and they appear on that hike's journal page (no code to edit).

- Formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.gif`. iPhone `.heic` doesn't show in browsers, so export or convert to JPEG first.
- Order: by filename, so prefix them: `01-summit.jpg`, `02-trail-snacks.jpg`.
- Caption: the filename minus the number and extension (`02-trail-snacks.jpg` → "trail snacks"). Name a file just `01.jpg` for no caption.
- The first photo is shown large; the rest go below it in a two-column grid.
- Keep each file under about 1 MB (roughly 1600 px on the long side) so the page stays fast.
- A new hike from the Garmin sync gets a folder name equal to its `id` in `src/data/hikes.json`; create the folder yourself if it isn't here yet.

Then commit and push to `main` (or upload the files on GitHub: open the folder → **Add file → Upload files**). The site redeploys automatically.

| Folder | Hike | Location |
|---|---|---|
| `gros-morne-mountain/` | Gros Morne Mountain | Gros Morne National Park, Newfoundland, Canada |
| `woody-point-lookout/` | Woody Point Lookout | Woody Point, Bonne Bay, Newfoundland, Canada |
| `tablelands/` | Tablelands | Gros Morne National Park, Newfoundland, Canada |
| `norris-point/` | Norris Point | Norris Point, Bonne Bay, Newfoundland, Canada |
| `devil-s-bridge/` | Devil's Bridge | Sedona, Arizona, USA |
| `cathedral-rock/` | Cathedral Rock | Sedona, Arizona, USA |
| `subway-cave/` | Subway Cave | Boynton Canyon, Sedona, Arizona, USA |
| `chapel-trail/` | Chapel Trail | Sedona, Arizona, USA |
| `bell-rock-pathway/` | Bell Rock Pathway | Sedona, Arizona, USA |
| `bell-rock-loop/` | Bell Rock Loop | Sedona, Arizona, USA |
| `west-sedona/` | West Sedona | Sedona, Arizona, USA |
| `grand-canyon-south-rim/` | Grand Canyon South Rim | Grand Canyon National Park, Arizona, USA |
| `horseshoe-bend/` | Horseshoe Bend | Page, Arizona, USA |
| `zion-canyon/` | Zion Canyon | Zion National Park, Utah, USA |
| `la-jolla-cabrillo/` | La Jolla Cove & Cabrillo | San Diego, California, USA |
| `los-angeles/` | Hollywood Hills | Los Angeles, California, USA |
| `niagara/` | Niagara Falls | Niagara Falls, Ontario, Canada |
| `caledon-hills/` | Caledon Hills | Caledon, Ontario, Canada |
| `toronto-waterfront-trail/` | Toronto Waterfront Trail | Toronto, Ontario, Canada |
| `humber-river-valley/` | Humber River Valley | Toronto, Ontario, Canada |
| `tommy-thompson-park/` | Tommy Thompson Park | Toronto, Ontario, Canada |
| `toronto-ravines/` | Toronto Ravines | Toronto, Ontario, Canada |
| `toronto-ravines-round-2/` | Toronto Ravines, Round 2 | Toronto, Ontario, Canada |
| `ravines-to-downtown/` | Ravines to Downtown | Toronto, Ontario, Canada |
