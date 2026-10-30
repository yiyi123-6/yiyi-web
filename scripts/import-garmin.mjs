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
 *
 * Hand-written fields (name, location, photos, experience, takeaway, difficulty) are never
 * overwritten. Stats, date and elevation profile are refreshed from Garmin.
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
  const opts = { data: 'src/data/hikes.json', out: null, dryRun: false, as: null, imperial: false, allTypes: false, since: null, inputs: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--data') opts.data = argv[++i]
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--as') opts.as = argv[++i]
    else if (a === '--imperial') opts.imperial = true
    else if (a === '--all-types') opts.allTypes = true
    else if (a === '--since') opts.since = argv[++i]
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

const isPlaceholder = (v) => v == null || v === '' || (typeof v === 'string' && /^\[.*\]$/.test(v.trim()))

function findExisting(hikes, rec, slugId, opts) {
  if (opts.as) return hikes.find((h) => h.id === opts.as) ?? null
  if (rec.activityId) {
    const byGarmin = hikes.find((h) => String(h.garminActivityId ?? '') === rec.activityId)
    if (byGarmin) return byGarmin
  }
  const byId = hikes.find((h) => h.id === slugId)
  if (byId) return byId
  // "Niagara Falls Hiking" → existing "Niagara Falls" hike that hasn't been linked to Garmin yet.
  const title = ` ${slugify(rec.name).replace(/-/g, ' ')} `
  return (
    hikes.find((h) => {
      if (h.garminActivityId || !isPlaceholder(h.date)) return false
      const words = slugify(h.name).split('-').filter((w) => w.length > 2)
      return words.length > 0 && words.every((w) => title.includes(` ${w} `))
    }) ?? null
  )
}

function statsFor(rec, units) {
  const imperial = units?.distance === 'mi'
  const s = {
    distance: round(imperial ? rec.distanceKm / 1.609344 : rec.distanceKm, 1),
    elevationGain: round(imperial ? rec.elevationGainM / 0.3048 : rec.elevationGainM),
    maxElevation: round(imperial ? rec.maxElevationM / 0.3048 : rec.maxElevationM),
    date: rec.startLocal ? displayDate(rec.startLocal) : undefined,
    startTime: rec.startLocal,
    movingTime: rec.movingSec,
    elapsedTime: rec.elapsedSec,
    start: rec.start,
    profile: rec.profile && imperial ? rec.profile.map((e) => Math.round(e / 0.3048)) : rec.profile,
    garminActivityId: rec.activityId,
    source: 'garmin',
  }
  for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k]
  return s
}

export function mergeHikes(data, records, opts = {}) {
  const hikes = data.hikes
  const report = []
  const added = []
  for (const rec of records) {
    const slugId = slugify(`${rec.name} ${rec.startLocal?.slice(0, 10) ?? ''}`)
    const existing = findExisting(hikes, rec, slugId, opts)
    const stats = statsFor(rec, data.units)
    if (existing) {
      const before = JSON.stringify(existing)
      Object.assign(existing, stats)
      if (isPlaceholder(existing.difficulty)) existing.difficulty = autoDifficulty(rec.distanceKm, rec.elevationGainM, rec.movingSec)
      if (isPlaceholder(existing.location) && rec.locationName) existing.location = rec.locationName
      report.push({ action: before === JSON.stringify(existing) ? 'unchanged' : 'updated', hike: existing, rec })
    } else {
      const hike = {
        id: slugId,
        name: rec.name,
        location: rec.locationName || '[Where was this?]',
        ...stats,
        difficulty: autoDifficulty(rec.distanceKm, rec.elevationGainM, rec.movingSec),
        photos: [{ src: '', alt: '[Describe the photo]', caption: '[caption]' }],
        experience: '[What was the day like? Who were you with? What surprised you?]',
        takeaway: '[Your personal takeaway]',
      }
      // Keep a stable, readable key order for new entries.
      const ordered = {}
      for (const k of ['id', 'name', 'location', 'date', 'distance', 'elevationGain', 'difficulty', 'photos', 'experience', 'takeaway']) ordered[k] = hike[k]
      Object.assign(ordered, hike)
      added.push(ordered)
      report.push({ action: 'added', hike: ordered, rec })
    }
  }
  added.sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')))
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

function printReport(report, skipped, units) {
  const rows = report.map(({ action, hike }) => [
    action, hike.id, hike.startTime?.slice(0, 10) ?? hike.date, `${hike.distance} ${units.distance}`,
    `${hike.elevationGain} ${units.elevation}`, fmtDur(hike.movingTime), hike.profile ? `${hike.profile.length} pts` : '—', hike.difficulty,
  ])
  const head = ['action', 'id', 'date', 'distance', 'gain', 'moving', 'profile', 'difficulty']
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ')
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

  const combined = combine(records)
  if (opts.as && combined.length !== 1) throw new Error(`--as needs exactly one activity, got ${combined.length}`)

  const data = JSON.parse(fs.readFileSync(opts.data, 'utf8'))
  data.units ??= { distance: 'km', elevation: 'm' }
  const report = mergeHikes(data, combined, opts)
  printReport(report, skipped, data.units)

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
