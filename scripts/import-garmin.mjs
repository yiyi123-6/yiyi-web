#!/usr/bin/env node
/**
 * Import hikes from Garmin Connect exports into src/data/hikes.json.
 *
 *   npm run import:garmin -- <files or folders...> [options]
 *
 * Accepts:
 *   *.csv   Garmin Connect > Activities > Export CSV (one row per activity)
 *   *.gpx   Garmin Connect > activity > ⚙ > Export to GPX  (gives the real elevation profile)
 *   *.tcx   Garmin Connect > activity > ⚙ > Export to TCX
 *   *.json  Activity summaries written by scripts/garmin_sync.py (the GitHub Action)
 *
 * Options:
 *   --data <file>    hikes.json to merge into (default: src/data/hikes.json)
 *   --out <file>     write the result somewhere else instead of overwriting --data
 *   --dry-run        print what would change, write nothing
 *   --as <id>        attach a single imported activity to an existing hike id
 *   --imperial       CSV distances are in miles and ascent/elevation in feet
 *   --all-types      don't filter to hiking / walking / trail running
 *   --since <date>   ignore activities before YYYY-MM-DD
 *   --min-km <n>     ignore activities shorter than n km. Shorter pieces that share a name and
 *                    day with a longer one (watch restarted mid-hike) are merged into it instead.
 *   --with-dates     also write the date, start time and start GPS point of each hike.
 *                    Off by default: hikes.json is public, so it only gets stats and the profile.
 *   --private        the default; accepted so scripts can say it explicitly
 *
 * Same-name activities on the same day are merged into one hike when one of them is under
 * --min-km or the second starts within 10 minutes of the first ending.
 *
 * Hand-written fields (name, location, photos, experience, takeaway, difficulty) are never
 * overwritten. Stats and elevation profile are refreshed from Garmin.
 */
import fs from 'node:fs'
import path from 'node:path'

const HIKE_TYPES = new Set([
  'hiking', 'walking', 'trail_running', 'trail running', 'mountaineering',
  'casual_walking', 'speed_walking', 'backcountry_snowboarding', 'snowshoeing', 'rucking',
])
const PROFILE_POINTS = 60

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const opts = { data: 'src/data/hikes.json', out: null, dryRun: false, as: null, imperial: false, allTypes: false, since: null, withDates: false, inputs: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--data') opts.data = argv[++i]
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--as') opts.as = argv[++i]
    else if (a === '--imperial') opts.imperial = true
    else if (a === '--all-types') opts.allTypes = true
    else if (a === '--since') opts.since = argv[++i]
    else if (a === '--min-km') opts.minKm = Number(argv[++i])
    else if (a === '--with-dates') opts.withDates = true
    else if (a === '--private' || a === '--no-dates') opts.withDates = false
    else if (a === '-h' || a === '--help') opts.help = true
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`)
    else opts.inputs.push(a)
  }
  return opts
}

function collectFiles(inputs) {
  const out = []
  const walk = (p) => {
    const st = fs.statSync(p)
    if (st.isDirectory()) for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f))
    else if (/\.(csv|gpx|tcx|json|fit)$/i.test(p)) out.push(p)
  }
  for (const i of inputs) walk(i)
  return out
}

// ---------------------------------------------------------------- helpers

const R = 6371008.8
function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? undefined : Math.round(n * 10 ** d) / 10 ** d)

function num(v) {
  if (v == null) return undefined
  const s = String(v).trim().replace(/,/g, '')
  if (!s || s === '--') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** "1:02:03", "02:03", "1:02:03.4" → seconds */
function hms(v) {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!s || s === '--') return undefined
  const parts = s.split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return undefined
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0))
}

const tag = (xml, name) => xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1]?.trim()
const decode = (s) =>
  s?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Local wall-clock time "YYYY-MM-DD HH:MM:SS" → ISO-ish string without zone (kept as local). */
function localIso(s) {
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}` : undefined
}

/** Without a timezone in GPX, approximate local time from longitude so the calendar date is right. */
function utcToApproxLocal(utc, lon) {
  const offsetH = lon == null ? 0 : Math.round(lon / 15)
  return new Date(Date.parse(utc) + offsetH * 3600e3).toISOString().slice(0, 19)
}

function displayDate(local) {
  const [y, m, d] = local.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function autoDifficulty(km, gain, movingSec) {
  // Effort-km: 1 km flat ≈ 100 m of climbing (Naismith-ish), plus a nudge for very long days.
  const effort = (km ?? 0) + (gain ?? 0) / 100 + Math.max(0, ((movingSec ?? 0) / 3600 - 5) * 1.5)
  if (effort < 8) return 'Easy'
  if (effort < 18) return 'Moderate'
  if (effort < 30) return 'Hard'
  return 'Epic'
}

// ---------------------------------------------------------------- track maths

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  return s[s.length >> 1]
}

/** Median filter then distance-weighted moving average, to kill GPS/baro jitter before summing climbs. */
export function smoothElevations(points) {
  const ele = points.map((p) => p.ele)
  const med = ele.map((_, i) => {
    const k = Math.min(2, i, ele.length - 1 - i)
    return median(ele.slice(i - k, i + k + 1))
  })
  const out = new Array(med.length)
  const WINDOW_M = 40
  let lo = 0, hi = 0, sum = 0
  for (let i = 0; i < med.length; i++) {
    while (hi < med.length && points[hi].dist - points[i].dist <= WINDOW_M) sum += med[hi++]
    while (points[i].dist - points[lo].dist > WINDOW_M) sum -= med[lo++]
    out[i] = sum / (hi - lo)
  }
  return out
}

/** Sum of climbs, ignoring wiggles smaller than `threshold` metres (hysteresis). */
export function elevationGain(smoothed, threshold = 3) {
  let gain = 0
  let ref = smoothed[0]
  for (const e of smoothed) {
    if (e - ref >= threshold) {
      gain += e - ref
      ref = e
    } else if (ref - e >= threshold) ref = e
  }
  return gain
}

function resampleProfile(points, smoothed, n = PROFILE_POINTS) {
  const total = points[points.length - 1].dist
  if (!(total > 0)) return undefined
  const out = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1)
    while (j < points.length - 2 && points[j + 1].dist < d) j++
    const a = points[j], b = points[j + 1] ?? a
    const t = b.dist > a.dist ? (d - a.dist) / (b.dist - a.dist) : 0
    const ea = smoothed[j], eb = smoothed[j + 1] ?? ea
    out.push(Math.round(ea + (eb - ea) * t))
  }
  return out
}

/** points: [{lat, lon, ele?, time?, dist?}] → stats */
export function analyzeTrack(raw) {
  const pts = raw.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (pts.length < 2) return null
  let dist = 0
  pts[0].dist = 0
  for (let i = 1; i < pts.length; i++) {
    dist += haversine(pts[i - 1], pts[i])
    pts[i].dist = dist
  }

  let moving = 0
  const times = pts.map((p) => (p.time ? Date.parse(p.time) : NaN))
  for (let i = 1; i < pts.length; i++) {
    const dt = (times[i] - times[i - 1]) / 1000
    if (!(dt > 0) || dt > 120) continue
    if ((pts[i].dist - pts[i - 1].dist) / dt >= 0.2) moving += dt
  }
  const t0 = times.find(Number.isFinite)
  const t1 = [...times].reverse().find(Number.isFinite)

  const withEle = pts.filter((p) => Number.isFinite(p.ele))
  let gain, maxEle, profile
  if (withEle.length >= 2) {
    const smoothed = smoothElevations(withEle)
    gain = elevationGain(smoothed)
    maxEle = Math.max(...smoothed)
    profile = resampleProfile(withEle, smoothed)
  }

  return {
    distanceM: dist,
    elevationGainM: gain,
    maxElevationM: maxEle,
    movingSec: moving > 0 ? Math.round(moving) : undefined,
    elapsedSec: Number.isFinite(t0) && Number.isFinite(t1) ? Math.round((t1 - t0) / 1000) : undefined,
    startUtc: Number.isFinite(t0) ? new Date(t0).toISOString() : undefined,
    start: { lat: round(pts[0].lat, 4), lon: round(pts[0].lon, 4) },
    profile,
  }
}

// ---------------------------------------------------------------- parsers

function activityIdFromFile(file) {
  return path.basename(file).match(/(?:activity_)?(\d{6,})/)?.[1]
}

function parseGpx(xml, file) {
  const trk = tag(xml, 'trk') ?? xml
  const name = decode(tag(trk, 'name')) ?? decode(tag(tag(xml, 'metadata') ?? '', 'name'))
  const type = decode(tag(trk, 'type'))
  const points = []
  for (const m of xml.matchAll(/<(?:\w+:)?trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?trkpt>)/g)) {
    const attrs = m[1]
    const body = m[2] ?? ''
    points.push({
      lat: Number(attrs.match(/lat="([^"]+)"/)?.[1]),
      lon: Number(attrs.match(/lon="([^"]+)"/)?.[1]),
      ele: num(tag(body, 'ele')),
      time: tag(body, 'time'),
    })
  }
  return toRecordFromTrack({ file, name, type, points, activityId: activityIdFromFile(file) })
}

function parseTcx(xml, file) {
  const sport = xml.match(/<Activity\b[^>]*Sport="([^"]+)"/)?.[1]
  const name = decode(tag(xml, 'Notes')) ?? decode(tag(tag(xml, 'Creator') ?? '', 'Name'))
  const points = []
  for (const m of xml.matchAll(/<(?:\w+:)?Trackpoint>([\s\S]*?)<\/(?:\w+:)?Trackpoint>/g)) {
    const b = m[1]
    points.push({
      lat: num(tag(b, 'LatitudeDegrees')),
      lon: num(tag(b, 'LongitudeDegrees')),
      ele: num(tag(b, 'AltitudeMeters')),
      time: tag(b, 'Time'),
    })
  }
  // TCX has no "hiking" sport, so its type isn't used for filtering.
  return toRecordFromTrack({ file, name: name ?? path.basename(file, path.extname(file)), type: sport === 'Other' ? undefined : sport?.toLowerCase(), points, activityId: activityIdFromFile(file), untyped: true })
}

function toRecordFromTrack({ file, name, type, points, activityId, untyped }) {
  const t = analyzeTrack(points)
  if (!t) return { file, skip: 'no GPS track points' }
  return {
    file,
    source: path.extname(file).slice(1).toLowerCase(),
    activityId,
    name: name || 'Untitled hike',
    type: untyped ? undefined : type?.toLowerCase(),
    startLocal: t.startUtc ? utcToApproxLocal(t.startUtc, t.start.lon) : undefined,
    startUtc: t.startUtc,
    distanceKm: t.distanceM / 1000,
    elevationGainM: t.elevationGainM,
    maxElevationM: t.maxElevationM,
    movingSec: t.movingSec,
    elapsedSec: t.elapsedSec,
    start: t.start,
    profile: t.profile,
  }
}

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

function parseActivitiesCsv(text, file, opts) {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''))
  const col = (...names) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase())
      if (i >= 0) return i
    }
    return -1
  }
  const c = {
    type: col('Activity Type'), date: col('Date'), title: col('Title'), distance: col('Distance'),
    time: col('Time', 'Total Time'), moving: col('Moving Time'), elapsed: col('Elapsed Time'),
    ascent: col('Total Ascent', 'Elev Gain'), maxEle: col('Max Elevation', 'Max Elev'),
  }
  if (c.date < 0 || c.distance < 0) throw new Error(`${file}: doesn't look like a Garmin Activities CSV (no Date/Distance columns)`)
  const km = opts.imperial ? 1.609344 : 1
  const m = opts.imperial ? 0.3048 : 1
  const get = (r, i) => (i >= 0 ? r[i] : undefined)
  return rows.map((r, n) => {
    const startLocal = localIso(get(r, c.date))
    const dist = num(get(r, c.distance))
    if (!startLocal || dist == null) return { file: `${file}#${n + 2}`, skip: 'missing date or distance' }
    return {
      file: `${file}#${n + 2}`,
      source: 'csv',
      name: get(r, c.title)?.trim() || 'Untitled hike',
      type: get(r, c.type)?.trim().toLowerCase(),
      startLocal,
      distanceKm: dist * km,
      elevationGainM: num(get(r, c.ascent)) != null ? num(get(r, c.ascent)) * m : undefined,
      maxElevationM: num(get(r, c.maxEle)) != null ? num(get(r, c.maxEle)) * m : undefined,
      movingSec: hms(get(r, c.moving)) ?? hms(get(r, c.time)),
      elapsedSec: hms(get(r, c.elapsed)) ?? hms(get(r, c.time)),
    }
  })
}

/** Garmin Connect API activity summaries (as saved by garmin_sync.py). */
function parseSummaryJson(json, file) {
  const list = Array.isArray(json) ? json : json.activities
  if (!Array.isArray(list)) throw new Error(`${file}: expected an array of Garmin activities`)
  return list.map((a) => ({
    file: `${file}#${a.activityId}`,
    source: 'garmin-api',
    activityId: a.activityId != null ? String(a.activityId) : undefined,
    name: a.activityName || 'Untitled hike',
    type: a.activityType?.typeKey,
    startLocal: localIso(a.startTimeLocal),
    startUtc: a.startTimeGMT ? `${localIso(a.startTimeGMT)}Z` : undefined,
    distanceKm: a.distance != null ? a.distance / 1000 : undefined,
    elevationGainM: a.elevationGain,
    maxElevationM: a.maxElevation,
    movingSec: a.movingDuration != null ? Math.round(a.movingDuration) : a.duration != null ? Math.round(a.duration) : undefined,
    elapsedSec: a.elapsedDuration != null ? Math.round(a.elapsedDuration) : a.duration != null ? Math.round(a.duration) : undefined,
    start: a.startLatitude != null ? { lat: round(a.startLatitude, 4), lon: round(a.startLongitude, 4) } : undefined,
    locationName: a.locationName,
  }))
}

function readRecords(file, opts) {
  const text = fs.readFileSync(file, 'utf8')
  const ext = path.extname(file).toLowerCase()
  if (ext === '.gpx') return [parseGpx(text, file)]
  if (ext === '.tcx') return [parseTcx(text, file)]
  if (ext === '.csv') return parseActivitiesCsv(text, file, opts)
  if (ext === '.json') return parseSummaryJson(JSON.parse(text), file)
  return [{ file, skip: 'FIT files are not supported — export the activity as GPX instead (⚙ > Export to GPX)' }]
}

// ---------------------------------------------------------------- combine & merge

const timeOf = (r) => (r.startUtc ? Date.parse(r.startUtc) : r.startLocal ? Date.parse(`${r.startLocal}Z`) : NaN)

/** Same activity seen in several files (e.g. CSV row + GPX)? CSV/API stats win; GPX adds the profile. */
function sameActivity(a, b) {
  if (a.activityId && b.activityId) return a.activityId === b.activityId
  const dt = Math.abs(timeOf(a) - timeOf(b)) / 3600e3
  const dd = Math.abs((a.distanceKm ?? 0) - (b.distanceKm ?? 0)) / Math.max(a.distanceKm ?? 0, b.distanceKm ?? 0, 0.1)
  return dt <= 14 && dd <= 0.15
}

const PRIORITY = { 'garmin-api': 3, csv: 2, gpx: 1, tcx: 1 }
function combine(records) {
  const groups = []
  for (const r of records) {
    const g = groups.find((g) => sameActivity(g[0], r))
    g ? g.push(r) : groups.push([r])
  }
  return groups.map((g) => {
    g.sort((a, b) => PRIORITY[b.source] - PRIORITY[a.source])
    const out = {}
    for (const r of [...g].reverse()) for (const [k, v] of Object.entries(r)) if (v !== undefined) out[k] = v
    out.profile = g.find((r) => r.profile)?.profile
    out.files = g.map((r) => r.file)
    return out
  })
}

const RESTART_GAP_MIN = 10
const dayOf = (r) => r.startLocal?.slice(0, 10)
const endOf = (r) => timeOf(r) + (r.elapsedSec ?? r.movingSec ?? 0) * 1000
const sameName = (a, b) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase()

/**
 * One outing recorded as several activities (watch restarted, or a short add-on with the same
 * auto-generated name) → one record. Separate same-day hikes of real length stay separate.
 */
export function groupOutings(records, minKm = 0) {
  const isFragment = (r) => (r.distanceKm ?? 0) < minKm
  const groups = []
  for (const r of [...records].sort((a, b) => timeOf(a) - timeOf(b))) {
    const g = groups.findLast((g) => {
      const last = g[g.length - 1]
      if (!dayOf(r) || dayOf(r) !== dayOf(last) || !sameName(r, last)) return false
      return isFragment(r) || g.some(isFragment) || (timeOf(r) - endOf(last)) / 60e3 <= RESTART_GAP_MIN
    })
    g ? g.push(r) : groups.push([r])
  }
  return groups.map(joinSegments)
}

function joinProfiles(segs) {
  const pts = []
  let offset = 0
  for (const s of segs) {
    if (!(s.profile?.length > 1) || !(s.distanceKm > 0)) continue
    const n = s.profile.length
    s.profile.forEach((ele, i) => pts.push({ dist: offset + (s.distanceKm * i) / (n - 1), ele }))
    offset += s.distanceKm
  }
  return pts.length > 1 ? resampleProfile(pts, pts.map((p) => p.ele)) : undefined
}

function joinSegments(segs) {
  if (segs.length === 1) return segs[0]
  const main = segs.reduce((a, b) => ((b.distanceKm ?? 0) > (a.distanceKm ?? 0) ? b : a))
  const sum = (k) => (segs.every((s) => s[k] == null) ? undefined : segs.reduce((acc, s) => acc + (s[k] ?? 0), 0))
  const highs = segs.map((s) => s.maxElevationM).filter(Number.isFinite)
  return {
    ...main,
    activityIds: segs.map((s) => s.activityId).filter(Boolean),
    startLocal: segs[0].startLocal,
    startUtc: segs[0].startUtc,
    start: segs[0].start,
    distanceKm: sum('distanceKm'),
    elevationGainM: sum('elevationGainM'),
    movingSec: sum('movingSec'),
    elapsedSec: sum('elapsedSec'),
    maxElevationM: highs.length ? Math.max(...highs) : undefined,
    profile: joinProfiles(segs),
    files: segs.flatMap((s) => s.files ?? [s.file]),
    segments: segs,
  }
}

const isPlaceholder = (v) => v == null || v === '' || (typeof v === 'string' && /^\[.*\]$/.test(v.trim()))

const DATE_FIELDS = ['date', 'startTime', 'start']
const linkedIds = (h) => (h.garminActivityIds ?? (h.garminActivityId != null ? [h.garminActivityId] : [])).map(String)
const idsOf = (rec) => rec.activityIds ?? (rec.activityId ? [rec.activityId] : [])

function findExisting(hikes, rec, slugId, opts) {
  if (opts.as) return hikes.find((h) => h.id === opts.as) ?? null
  const ids = idsOf(rec)
  if (ids.length) {
    const byGarmin = hikes.find((h) => linkedIds(h).some((id) => ids.includes(id)))
    if (byGarmin) return byGarmin
  }
  const byId = hikes.find((h) => h.id === slugId && (!linkedIds(h).length || !ids.length))
  if (byId) return byId
  // "Niagara Falls Hiking" → existing "Niagara Falls" hike that hasn't been linked to Garmin yet.
  const title = ` ${slugify(rec.name).replace(/-/g, ' ')} `
  return (
    hikes.find((h) => {
      if (linkedIds(h).length || !isPlaceholder(h.date)) return false
      const words = slugify(h.name).split('-').filter((w) => w.length > 2)
      return words.length > 0 && words.every((w) => title.includes(` ${w} `))
    }) ?? null
  )
}

const ACTIVITY_SUFFIX = /\s+(hiking|hike|walking|walk|mountaineering|trail running|trail run|trek|trekking)$/i

/** "chapel trail" → "Chapel Trail", "Yavapai County Hiking" (Garmin's auto-name) → "Yavapai County Trails". */
export function niceName(raw, locationName) {
  const stripped = String(raw ?? '').trim().replace(ACTIVITY_SUFFIX, '').trim()
  let name = stripped || locationName || 'Untitled'
  if (name === name.toLowerCase()) name = name.replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
  const auto = !stripped || (locationName && stripped.toLowerCase() === String(locationName).toLowerCase())
  return auto ? `${name.split(',')[0].trim()} Trails` : name
}

/** Reuse the full "Town, Province, Country" already written on another hike when Garmin only knows "Town". */
function placeFor(locationName, hikes) {
  if (!locationName) return '[Where was this?]'
  const prefix = `${locationName.toLowerCase()},`
  return hikes.find((h) => typeof h.location === 'string' && h.location.toLowerCase().startsWith(prefix))?.location ?? locationName
}

const TAKEAWAYS = {
  Easy: 'Every trail counts.',
  Moderate: 'Steady steps add up.',
  Hard: 'The view is better after the climb.',
  Epic: 'Legs: tired. Data: excellent.',
}

function factLine(stats, units) {
  const parts = [`${stats.distance.toLocaleString('en-US')} ${units.distance}`]
  if (stats.elevationGain != null) parts.push(`${stats.elevationGain.toLocaleString('en-US')} ${units.elevation} of climbing`)
  return `${parts.join(' and ')}.`
}

function statsFor(rec, units, opts = {}) {
  const imperial = units?.distance === 'mi'
  const ids = idsOf(rec)
  const s = {
    distance: round(imperial ? rec.distanceKm / 1.609344 : rec.distanceKm, 1),
    elevationGain: round(imperial ? rec.elevationGainM / 0.3048 : rec.elevationGainM),
    maxElevation: round(imperial ? rec.maxElevationM / 0.3048 : rec.maxElevationM),
    date: opts.withDates && rec.startLocal ? displayDate(rec.startLocal) : undefined,
    startTime: opts.withDates ? rec.startLocal : undefined,
    movingTime: rec.movingSec,
    elapsedTime: rec.elapsedSec,
    start: opts.withDates ? rec.start : undefined,
    profile: rec.profile && imperial ? rec.profile.map((e) => Math.round(e / 0.3048)) : rec.profile,
    garminActivityId: rec.activityId,
    garminActivityIds: ids.length > 1 ? ids : undefined,
    source: 'garmin',
  }
  for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k]
  return s
}

export function mergeHikes(data, records, opts = {}) {
  const hikes = data.hikes
  const units = data.units ?? { distance: 'km', elevation: 'm' }
  const report = []
  const added = []
  const owners = (rec) => new Set(hikes.filter((h) => linkedIds(h).some((id) => idsOf(rec).includes(id))))
  // Pieces of one outing that were already curated as separate hikes stay separate.
  const recs = records.flatMap((r) => (r.segments && owners(r).size > 1 ? r.segments : [r]))
  for (const rec of recs) {
    const name = niceName(rec.name, rec.locationName)
    const day = rec.startLocal?.slice(0, 10) ?? ''
    const slugBase = (n) => slugify(opts.withDates ? `${n} ${day}` : n)
    const ids = idsOf(rec)
    const existing = findExisting(hikes, rec, slugBase(name), opts)
    if (existing) {
      if (!opts.as && linkedIds(existing).some((id) => !ids.includes(id))) {
        report.push({ action: 'unchanged', hike: existing, rec })
        continue
      }
      const before = JSON.stringify(existing)
      const stats = statsFor(rec, units, opts)
      if (!opts.withDates) for (const k of DATE_FIELDS) delete existing[k]
      if (!stats.garminActivityIds) delete existing.garminActivityIds
      Object.assign(existing, stats)
      if (isPlaceholder(existing.difficulty)) existing.difficulty = autoDifficulty(rec.distanceKm, rec.elevationGainM, rec.movingSec)
      if (isPlaceholder(existing.location) && rec.locationName) existing.location = placeFor(rec.locationName, hikes)
      report.push({ action: before === JSON.stringify(existing) ? 'unchanged' : 'updated', hike: existing, rec })
    } else {
      const all = [...hikes, ...added]
      const names = new Set(all.map((h) => h.name))
      let display = name
      for (let n = 2; names.has(display); n++) display = `${name}, Round ${n}`
      const taken = new Set(all.map((h) => h.id))
      const slugId = slugBase(display)
      let id = slugId
      for (let n = 2; taken.has(id); n++) id = `${slugId}-${n}`
      const stats = statsFor(rec, units, opts)
      const difficulty = autoDifficulty(rec.distanceKm, rec.elevationGainM, rec.movingSec)
      const hike = {
        id,
        name: display,
        location: placeFor(rec.locationName, all),
        ...stats,
        difficulty,
        photos: [{ src: '', alt: display, caption: `#${slugify(rec.locationName || display).replace(/-/g, '')}` }],
        experience: factLine(stats, units),
        takeaway: TAKEAWAYS[difficulty],
      }
      // Keep a stable, readable key order for new entries.
      const ordered = {}
      for (const k of ['id', 'name', 'location', 'date', 'distance', 'elevationGain', 'difficulty', 'photos', 'experience', 'takeaway']) ordered[k] = hike[k]
      Object.assign(ordered, hike)
      added.push(ordered)
      report.push({ action: 'added', hike: ordered, rec })
    }
  }
  const startOf = new Map(report.map((r) => [r.hike, timeOf(r.rec)]))
  added.sort((a, b) => (startOf.get(a) || 0) - (startOf.get(b) || 0))
  hikes.push(...added)
  return report
}

// ---------------------------------------------------------------- output

/** Pretty JSON that keeps leaf objects and number arrays on one line, like the hand-written file. */
export function formatJson(value, indent = '') {
  const next = indent + '  '
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (value.every((v) => v === null || typeof v !== 'object')) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
    return `[\n${value.map((v) => next + formatJson(v, next)).join(',\n')}\n${indent}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    if (!entries.length) return '{}'
    if (entries.every(([, v]) => v === null || typeof v !== 'object')) {
      return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`
    }
    return `{\n${entries.map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, next)}`).join(',\n')}\n${indent}}`
  }
  return JSON.stringify(value)
}

const fmtDur = (s) => (s == null ? '—' : `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`)

function printReport(report, skipped, units, opts = {}) {
  const rows = report.map(({ action, hike, rec }) => [
    action, hike.id, ...(opts.withDates ? [hike.startTime?.slice(0, 10) ?? hike.date] : []), `${hike.distance} ${units.distance}`,
    `${hike.elevationGain} ${units.elevation}`, fmtDur(hike.movingTime), hike.profile ? `${hike.profile.length} pts` : '—', hike.difficulty,
    rec.segments ? `${rec.segments.length} merged` : '',
  ])
  const head = ['action', 'id', ...(opts.withDates ? ['date'] : []), 'distance', 'gain', 'moving', 'profile', 'difficulty', 'pieces']
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd()
  if (rows.length) console.log(`\n${line(head)}\n${w.map((n) => '-'.repeat(n)).join('  ')}\n${rows.map(line).join('\n')}`)
  for (const s of skipped) console.log(`skipped  ${s.file}: ${s.skip}`)
  const count = (a) => report.filter((r) => r.action === a).length
  console.log(`\n${count('added')} added, ${count('updated')} updated, ${count('unchanged')} unchanged, ${skipped.length} skipped`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || !opts.inputs.length) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ''))
    process.exit(opts.inputs.length || opts.help ? 0 : 1)
  }
  const files = collectFiles(opts.inputs)
  if (!files.length) throw new Error('No .csv/.gpx/.tcx/.json files found in the given paths')

  const skipped = []
  const records = []
  for (const f of files) {
    try {
      for (const r of readRecords(f, opts)) {
        if (r.skip) skipped.push(r)
        else if (!opts.allTypes && r.type && !HIKE_TYPES.has(r.type)) skipped.push({ file: r.file, skip: `type "${r.type}" is not a hike (use --all-types)` })
        else if (opts.since && r.startLocal && r.startLocal.slice(0, 10) < opts.since) skipped.push({ file: r.file, skip: `before --since ${opts.since}` })
        else records.push(r)
      }
    } catch (e) {
      skipped.push({ file: f, skip: e.message })
    }
  }

  let combined = groupOutings(combine(records), opts.minKm)
  if (opts.minKm > 0) {
    for (const r of combined) if (r.distanceKm < opts.minKm) skipped.push({ file: r.name, skip: `${round(r.distanceKm, 1)} km is under --min-km ${opts.minKm}` })
    combined = combined.filter((r) => !(r.distanceKm < opts.minKm))
  }
  if (opts.as && combined.length !== 1) throw new Error(`--as needs exactly one activity, got ${combined.length}`)

  const data = JSON.parse(fs.readFileSync(opts.data, 'utf8'))
  data.units ??= { distance: 'km', elevation: 'm' }
  const report = mergeHikes(data, combined, opts)
  printReport(report, skipped, data.units, opts)

  const target = opts.out ?? opts.data
  if (opts.dryRun) console.log('(dry run — nothing written)')
  else if (report.some((r) => r.action !== 'unchanged') || opts.out) {
    fs.writeFileSync(target, formatJson(data) + '\n')
    console.log(`wrote ${target}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('import-garmin.mjs')) {
  main().catch((e) => {
    console.error(`import-garmin: ${e.message}`)
    process.exit(1)
  })
}
