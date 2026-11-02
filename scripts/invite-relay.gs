/**
 * Yiyi's Universe ♡ — invite + calendar relay (Google Apps Script, free).
 * Runs as you (yiyitan076@gmail.com). It:
 *   • GET  ?action=availability&from=ISO&to=ISO → busy blocks only (start/end, never titles) from CALENDAR_IDS
 *     and, optionally, public iCloud calendar links saved in the ICLOUD_ICS_URLS script property
 *   • POST invite JSON → emails you; with slots [{start,end}] it also puts a "♡ Request" hold on your
 *     calendar for every proposed time
 *   • GET  ?action=accept&option=N|decline&id=…&token=… → a page to confirm; accepting one time sends the
 *     visitor a real Google Calendar invite and removes every hold, declining removes them all and emails
 *     the visitor a kind note.
 *
 * Setup — see README "Invites + calendar":
 *   1. https://script.google.com → New project → paste this file → Save.
 *   2. Deploy → New deployment → type "Web app"
 *        Execute as: Me      Who has access: Anyone
 *   3. Authorize (Gmail + Calendar + external requests), copy the Web app URL (ends in /exec)
 *   4. Paste it into links.inviteScriptUrl in src/data/content.ts and push.
 *   5. Optional, iCloud: paste your public iCloud links into ICLOUD_URLS_TO_SAVE (near the end), pick
 *      setIcloudUrls in the toolbar → Run, check the Execution log, then empty the list again and Save.
 *      It stores the links in the ICLOUD_ICS_URLS script property and syncs busy times daily (~5 AM).
 * After editing this file: Deploy → Manage deployments → ✏️ → Version: New version → Deploy
 * (the /exec URL stays the same). New permissions prompt for re-authorization.
 */

var CONFIG = {
  /** Busy times come from all of these. The first one is yours: holds and confirmed plans go there. */
  CALENDAR_IDS: ['primary'],
  TIME_ZONE: 'America/Toronto',
  /**
   * When plans can happen, in TIME_ZONE, by weekday (0 = Sunday … 6 = Saturday), in minutes after midnight.
   * A plan has to start and end inside its day's window. `work` days are work time until the window opens.
   * `earlyStartMin` replaces `startMin` for EARLY_ACTIVITIES.
   * Keep both in sync with BOOKABLE_HOURS / EARLY_ACTIVITIES in src/lib/calendar.ts.
   */
  BOOKABLE_HOURS: [
    { startMin: 9 * 60, endMin: 22 * 60, earlyStartMin: 6 * 60 }, // Sun
    { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Mon
    { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Tue
    { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Wed
    { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Thu
    { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Fri
    { startMin: 9 * 60, endMin: 22 * 60, earlyStartMin: 6 * 60 }, // Sat
  ],
  /** Activity ids (Tiny AI items and Connect options) that may use `earlyStartMin`: runs, hikes, snowboarding. */
  EARLY_ACTIVITIES: ['run', 'morning-run', 'trail-run', 'hike', 'all-day-hike', 'summit', 'snowboard'],
  /**
   * Optional iCloud busy times: script property ICLOUD_ICS_URLS = your public iCloud calendar link(s)
   * (webcal:// is fine), separated by commas or new lines. Save them with setIcloudUrls() below, never in this file.
   */
  ICLOUD_PROPERTY: 'ICLOUD_ICS_URLS',
  /** syncIcloud() stores busy times from now to this many days ahead; it runs daily around ICLOUD_SYNC_HOUR. */
  ICLOUD_SYNC_DAYS: 400,
  ICLOUD_SYNC_HOUR: 5,
  /** Longest range one availability query may cover (about one month view). */
  MAX_QUERY_DAYS: 62,
  /** How far ahead plans can be requested. */
  MAX_AHEAD_DAYS: 730,
  MAX_OPTIONS: 5,
  MAX_DURATION_MIN: 12 * 60,
  MIN_LEAD_MIN: 60,
  MAX_PER_HOUR: 30,
  /** Google Calendar color ids: '4' = Flamingo (pink), '3' = Grape. */
  HOLD_COLOR: '4',
  CONFIRMED_COLOR: '3',
  /** Optional: your site URL, linked in the decline note so they can pick another time. */
  SITE_URL: '',
  /** Optional: override the /exec URL used in Accept/Decline links (defaults to this deployment). */
  WEB_APP_URL: '',
};

var MIN_MS = 60 * 1000;
var DAY_MS = 24 * 60 * MIN_MS;
var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ───────────────────────── pure helpers (tested in scripts/invite-relay.test.mjs) ───────────────────────── */

function clip_(s, n) {
  return String(s == null ? '' : s).slice(0, n);
}

function isEmail_(s) {
  return EMAIL_RE.test(String(s || ''));
}

/** Strict ISO-8601 with an explicit offset → epoch ms, or NaN. */
function parseIso_(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return NaN;
  return Date.parse(s);
}

/** Sorts and merges overlapping/touching [start, end) intervals (epoch ms). */
function mergeIntervals_(list) {
  var sorted = list
    .filter(function (b) { return isFinite(b.start) && isFinite(b.end) && b.end > b.start; })
    .map(function (b) { return { start: b.start, end: b.end }; })
    .sort(function (a, b) { return a.start - b.start; });
  var out = [];
  sorted.forEach(function (b) {
    var last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push(b);
  });
  return out;
}

function overlapsAny_(start, end, busy) {
  return busy.some(function (b) { return start < b.end && end > b.start; });
}

var OFFSETS_ = {};
var SHIFTS_ = {};
var OFFSET_STEP_MS = 15 * 60 * 1000;

function rawOffset_(ms, zone) {
  return Date.parse(Utilities.formatDate(new Date(ms), zone, "yyyy-MM-dd'T'HH:mm:ss") + 'Z') - ms;
}

function dayOffset_(day, zone) {
  var key = zone + '@' + day;
  if (!(key in OFFSETS_)) OFFSETS_[key] = rawOffset_(day, zone);
  return OFFSETS_[key];
}

/**
 * UTC offset of `zone` at `ms`, with about one Utilities.formatDate call per zone and day (expanding a year
 * of iCloud events would otherwise take tens of thousands). Assumes the offset changes at most once per
 * UTC day, on a quarter hour, which holds for every real zone; the change itself is found by bisection.
 */
function offsetAt_(ms, zone) {
  var day = Math.floor(ms / DAY_MS) * DAY_MS;
  var a = dayOffset_(day, zone);
  var b = dayOffset_(day + DAY_MS, zone);
  if (a === b) return a;
  var key = zone + '@' + day;
  if (!(key in SHIFTS_)) {
    var lo = day;
    var hi = day + DAY_MS;
    while (hi - lo > OFFSET_STEP_MS) {
      var mid = lo + Math.floor((hi - lo) / 2 / OFFSET_STEP_MS) * OFFSET_STEP_MS;
      if (rawOffset_(mid, zone) === a) lo = mid;
      else hi = mid;
    }
    SHIFTS_[key] = hi;
  }
  return ms < SHIFTS_[key] ? a : b;
}

/** Wall-clock time in `tz` (default TIME_ZONE), expressed as if it were UTC ms (so day/minute math is plain arithmetic). */
function wallMs_(ms, tz) {
  if (tz === 'UTC') return ms;
  return ms + offsetAt_(ms, tz || CONFIG.TIME_ZONE);
}

/** Inverse of wallMs_: a wall-clock time in `tz` → the real instant. */
function zonedMs_(wall, tz) {
  if (tz === 'UTC') return wall;
  var guess = wall - (wallMs_(wall, tz) - wall);
  return wall - (wallMs_(guess, tz) - guess);
}

/**
 * null if [start, end) starts and ends inside the bookable window of the Toronto day it starts on,
 * otherwise 'work' (starts during weekday work time) or 'hours' (outside the window some other way).
 */
function bookingProblem_(start, end, early) {
  var a = wallMs_(start);
  var b = wallMs_(end);
  var day = Math.floor(a / DAY_MS) * DAY_MS;
  var w = CONFIG.BOOKABLE_HOURS[new Date(day).getUTCDay()];
  var open = early && w.earlyStartMin != null ? w.earlyStartMin : w.startMin;
  if (a < day + open * MIN_MS) return w.work ? 'work' : 'hours';
  return b <= day + w.endMin * MIN_MS ? null : 'hours';
}

/** Early weekend starts are decided here, from the activity id, never from anything else the client says. */
function startsEarly_(activityId) {
  return typeof activityId === 'string' && CONFIG.EARLY_ACTIVITIES.indexOf(activityId) >= 0;
}

/** "7 PM", "9:30 AM". */
function clockLabel_(min) {
  var h = Math.floor(min / 60) % 24;
  var m = min % 60;
  return (h % 12 || 12) + (m ? ':' + (m < 10 ? '0' : '') + m : '') + (h < 12 ? ' AM' : ' PM');
}

function hoursSummary_(early) {
  var weekend = CONFIG.BOOKABLE_HOURS[6];
  var label = function (from, w) { return clockLabel_(from) + '–' + clockLabel_(w.endMin); };
  return 'weekdays ' + label(CONFIG.BOOKABLE_HOURS[1].startMin, CONFIG.BOOKABLE_HOURS[1]) + ' or weekends ' +
    label(early && weekend.earlyStartMin != null ? weekend.earlyStartMin : weekend.startMin, weekend) + ' (Toronto)';
}

/** Clamps an availability window to start no earlier than now, end within MAX_AHEAD_DAYS, span ≤ MAX_QUERY_DAYS. */
function clampWindow_(fromIso, toIso, nowMs) {
  var from = parseIso_(fromIso);
  var to = parseIso_(toIso);
  from = isFinite(from) ? Math.max(from, nowMs) : nowMs;
  if (!isFinite(to)) to = from + 42 * DAY_MS;
  to = Math.min(to, from + CONFIG.MAX_QUERY_DAYS * DAY_MS, nowMs + (CONFIG.MAX_AHEAD_DAYS + 1) * DAY_MS);
  if (to <= from) return null;
  return { from: from, to: to };
}

/** Accepts `slots: [{start, end}]` or the older single `start`/`end`. */
function rawSlots_(d) {
  if (Array.isArray(d.slots)) return d.slots;
  if (d.start != null || d.end != null) return [{ start: d.start, end: d.end }];
  return [];
}

/** Validates an invite payload. Untimed invites (no slots) are plain emails. */
function validateRequest_(d, nowMs) {
  var replyTo = clip_(d.replyTo, 200).trim();
  var base = {
    ok: true,
    timed: false,
    name: clip_(d.name, 100).trim(),
    replyTo: isEmail_(replyTo) ? replyTo : '',
    subject: clip_(d.subject, 150),
    message: clip_(d.message, 5000),
    source: clip_(d.source, 100),
    activity: clip_(d.activity, 120).trim(),
    early: startsEarly_(d.activityId),
    timeZone: /^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(String(d.timeZone || '')) ? String(d.timeZone) : '',
  };
  var raw = rawSlots_(d);
  if (!raw.length) return base;
  var bad = function (message) { return { ok: false, code: 'invalid', message: message }; };
  if (raw.length > CONFIG.MAX_OPTIONS) return bad('Suggest up to ' + CONFIG.MAX_OPTIONS + ' times.');
  if (!base.replyTo) return bad('Add your email so the calendar invite can reach you.');

  var slots = [];
  for (var i = 0; i < raw.length; i++) {
    var s = raw[i] || {};
    var start = parseIso_(s.start);
    var end = parseIso_(s.end);
    if (!isFinite(start) || !isFinite(end)) return bad('That date/time looks off. Pick it again?');
    if (end <= start) return bad('The plan has to end after it starts.');
    if (end - start > CONFIG.MAX_DURATION_MIN * MIN_MS) return bad('Plans can be up to 12 hours.');
    if (start < nowMs + CONFIG.MIN_LEAD_MIN * MIN_MS) return bad('Pick a time a little further in the future.');
    if (start > nowMs + CONFIG.MAX_AHEAD_DAYS * DAY_MS) return bad('That is a bit too far ahead. Pick something in the next two years.');
    var problem = bookingProblem_(start, end, base.early);
    if (problem === 'work') return { ok: false, code: 'work', message: 'Weekdays until ' + clockLabel_(CONFIG.BOOKABLE_HOURS[1].startMin) + ' (Toronto) are work hours. Plans fit ' + hoursSummary_(base.early) + '.' };
    if (problem) return { ok: false, code: 'hours', message: 'Plans fit ' + hoursSummary_(base.early) + '. Pick another time?' };
    slots.push({ start: start, end: end });
  }
  slots.sort(function (a, b) { return a.start - b.start; });
  for (var j = 1; j < slots.length; j++) {
    if (slots[j].start < slots[j - 1].end) return bad('Two of your times overlap. Pick times that don\'t.');
  }

  base.timed = true;
  base.slots = slots;
  return base;
}

function holdTitle_(activity, name, n, total) {
  return '♡ Request' + (total > 1 ? ' (option ' + n + '/' + total + ')' : '') + ': ' + (activity || 'Plans') + ' with ' + (name || 'a visitor');
}

function confirmedTitle_(activity, name) {
  return '♡ ' + (activity || 'Plans') + ' with ' + (name || 'a visitor');
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ───────────────────────── web app entry points ───────────────────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'availability') return json_(availability_(p.from, p.to));
    if (p.action === 'accept' || p.action === 'decline') return reviewPage_(p.action, p.id, p.token, Number(p.option));
    return json_({ success: true, message: "Yiyi's Universe relay is running ♡" });
  } catch (err) {
    return json_({ success: false, message: 'Something went wrong.' });
  }
}

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.website) return json_({ success: true }); // honeypot: bots fill hidden fields

    var cache = CacheService.getScriptCache();
    var count = Number(cache.get('count') || 0);
    if (count >= CONFIG.MAX_PER_HOUR) return json_({ success: false, code: 'rate', message: 'Too many invites right now, try again later.' });
    cache.put('count', String(count + 1), 3600);

    var r = validateRequest_(d, Date.now());
    if (!r.ok) return json_({ success: false, code: r.code, message: r.message });
    if (!r.timed) {
      sendOwnerEmail_(r, null);
      return json_({ success: true });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var busy = getBusy_(r.slots[0].start, Math.max.apply(null, r.slots.map(function (s) { return s.end; })), true).busy;
      var conflicts = r.slots.filter(function (s) { return overlapsAny_(s.start, s.end, busy); });
      if (conflicts.length) {
        return json_({
          success: false,
          code: 'conflict',
          message: conflicts.length > 1 ? 'Some of those times just got booked. Pick others?' : 'One of those times just got booked. Pick another one?',
          conflicts: conflicts.map(function (s) { return new Date(s.start).toISOString(); }),
        });
      }
      var req = createHolds_(r);
      sendOwnerEmail_(r, req);
    } finally {
      lock.releaseLock();
    }
    cleanupRequests_();
    return json_({ success: true, pending: true, options: r.slots.length });
  } catch (err) {
    return json_({ success: false, message: 'Something went wrong.' });
  }
}

/** Called from the Accept/Decline review page via google.script.run. `option` is 1-based. */
function respondToRequest(action, id, token, option) {
  var rec = loadRequest_(id, token);
  if (!rec) return { ok: false, message: 'This link has expired or was already used.' };
  var cal = ownerCalendar_();
  var holds = rec.eventIds.map(function (eid) { return cal.getEventById(eid); });
  var removeHolds = function () { holds.forEach(function (h) { if (h) h.deleteEvent(); }); };

  if (action === 'accept') {
    var slot = rec.slots[option - 1];
    if (!slot) return { ok: false, message: 'That option does not exist.' };
    var picked = holds[option - 1];
    var opts = { description: picked ? picked.getDescription() : '', sendInvites: true };
    if (isEmail_(rec.email)) opts.guests = rec.email;
    var ev = cal.createEvent(confirmedTitle_(rec.activity, rec.name), new Date(slot.start), new Date(slot.end), opts);
    try { ev.setColor(CONFIG.CONFIRMED_COLOR); } catch (err) { /* color is cosmetic */ }
    removeHolds();
    forgetRequest_(token);
    bumpAvailability_();
    return { ok: true, message: "It's a date! " + (rec.name || 'They') + ' just got a Google Calendar invite ♡' };
  }

  if (action === 'decline') {
    removeHolds();
    if (isEmail_(rec.email)) {
      var tz = rec.timeZone || CONFIG.TIME_ZONE;
      var times = rec.slots.map(function (s) { return '  • ' + (safeFormat_(s.start, s.end, tz) || formatWhen_(s.start, s.end, CONFIG.TIME_ZONE)); }).join('\n');
      MailApp.sendEmail({
        to: rec.email,
        replyTo: Session.getEffectiveUser().getEmail(),
        name: 'Yiyi',
        subject: 'About ' + (rec.activity || 'our plans') + ' ♡',
        body:
          'Hi ' + (rec.name || 'there') + ',\n\n' +
          'Thank you so much for the invite to ' + (rec.activity || 'hang out') + '! ' +
          (rec.slots.length > 1 ? "Those times don't work for me, sorry:\n" : "That time doesn't work for me, sorry:\n") +
          times + '\n\n' +
          'Reply to this email if you want to suggest another time' + (CONFIG.SITE_URL ? ', or pick a new one here: ' + CONFIG.SITE_URL : '') + '.\n\n' +
          '— Yiyi ♡',
      });
    }
    forgetRequest_(token);
    bumpAvailability_();
    return { ok: true, message: 'Declined. The holds are gone and ' + (rec.name || 'they') + ' got a kind note ♡' };
  }
  return { ok: false, message: 'Unknown action.' };
}

/* ───────────────────────── calendar ───────────────────────── */

function availability_(fromIso, toIso) {
  var win = clampWindow_(fromIso, toIso, Date.now());
  if (!win) return { success: true, busy: [], calendarsMissing: [], icloudErrors: 0, icloudSyncedAt: null };
  var cache = CacheService.getScriptCache();
  var key = 'av:' + (cache.get('gen') || '0') + ':' + win.from + ':' + win.to;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var res = getBusy_(win.from, win.to);
  var out = {
    success: true,
    timeZone: CONFIG.TIME_ZONE,
    busy: res.busy.map(function (b) { return { start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString() }; }),
    calendarsMissing: res.missing,
    icloudErrors: res.icloudErrors,
    icloudSyncedAt: res.icloudSyncedAt,
  };
  try { cache.put(key, JSON.stringify(out), 60); } catch (err) { /* too big to cache */ }
  return out;
}

/**
 * Merged busy blocks across CALENDAR_IDS plus any iCloud links in ICLOUD_ICS_URLS.
 * Google: free/busy API first, CalendarApp as a fallback. iCloud: the daily snapshot, or with `live`
 * (used right before holds are created) a fresh fetch that falls back to the snapshot.
 */
function getBusy_(from, to, live) {
  var google;
  try {
    google = freeBusyApi_(from, to);
  } catch (err) {
    google = calendarAppBusy_(from, to);
  }
  var icloud = live ? icloudLive_(from, to) : icloudStored_(from, to);
  return {
    busy: mergeIntervals_(google.busy.concat(icloud.busy)),
    missing: google.missing,
    icloudErrors: icloud.errors,
    icloudSyncedAt: icloud.syncedAt ? new Date(icloud.syncedAt).toISOString() : null,
  };
}

function freeBusyApi_(from, to) {
  var res = UrlFetchApp.fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      items: CONFIG.CALENDAR_IDS.map(function (id) { return { id: id }; }),
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('freeBusy ' + res.getResponseCode());
  var cals = JSON.parse(res.getContentText()).calendars || {};
  var busy = [];
  var missing = [];
  CONFIG.CALENDAR_IDS.forEach(function (id) {
    var c = cals[id];
    if (!c || (c.errors && c.errors.length)) { missing.push(id); return; }
    (c.busy || []).forEach(function (b) { busy.push({ start: Date.parse(b.start), end: Date.parse(b.end) }); });
  });
  return { busy: mergeIntervals_(busy), missing: missing };
}

function calendarAppBusy_(from, to) {
  var busy = [];
  var missing = [];
  CONFIG.CALENDAR_IDS.forEach(function (id) {
    var cal = null;
    try { cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id); } catch (err) { cal = null; }
    if (!cal) { missing.push(id); return; }
    cal.getEvents(new Date(from), new Date(to)).forEach(function (ev) {
      if (ev.isAllDayEvent()) return; // all-day markers (birthdays, OOO notes) don't block slots
      try { if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; } catch (err) { /* free/busy-only view */ }
      busy.push({ start: ev.getStartTime().getTime(), end: ev.getEndTime().getTime() });
    });
  });
  return { busy: mergeIntervals_(busy), missing: missing };
}

/* ───────────────────────── iCloud (public calendar links, RFC 5545) ───────────────────────── */

var ICS_KEEP_RE = /^(BEGIN|END|DTSTART|DTEND|DURATION|RRULE|RDATE|EXDATE|UID|RECURRENCE-ID|STATUS|TRANSP)[;:]/i;
var ICS_WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
var ICS_ZONE_RE = /(?:^|\/)((?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/;
/** TZIDs that aren't IANA names (Windows/Outlook names, old aliases), lowercased. */
var ICS_ZONE_ALIASES = {
  'utc': 'UTC', 'gmt': 'UTC', 'z': 'UTC', 'etc/utc': 'UTC', 'etc/gmt': 'UTC', 'coordinated universal time': 'UTC',
  'eastern standard time': 'America/New_York', 'us/eastern': 'America/New_York', 'canada/eastern': 'America/Toronto',
  'central standard time': 'America/Chicago', 'us/central': 'America/Chicago',
  'mountain standard time': 'America/Denver', 'us/mountain': 'America/Denver', 'us mountain standard time': 'America/Phoenix',
  'pacific standard time': 'America/Los_Angeles', 'us/pacific': 'America/Los_Angeles', 'canada/pacific': 'America/Vancouver',
  'atlantic standard time': 'America/Halifax', 'newfoundland standard time': 'America/St_Johns',
  'alaskan standard time': 'America/Anchorage', 'hawaiian standard time': 'Pacific/Honolulu',
  'gmt standard time': 'Europe/London', 'w. europe standard time': 'Europe/Berlin', 'romance standard time': 'Europe/Paris',
  'central europe standard time': 'Europe/Budapest', 'central european standard time': 'Europe/Warsaw',
  'china standard time': 'Asia/Shanghai', 'taipei standard time': 'Asia/Taipei', 'tokyo standard time': 'Asia/Tokyo',
  'korea standard time': 'Asia/Seoul', 'india standard time': 'Asia/Kolkata', 'singapore standard time': 'Asia/Singapore',
  'aus eastern standard time': 'Australia/Sydney',
};
var ICS_MAX_URLS = 10;
var ICS_MAX_PERIODS = 50000;
var ICLOUD_CHUNK_CHARS = 8500; // Script Properties allow 9 KB per value
var ICLOUD_MAX_CHARS = 400000; // …and 500 KB in total, shared with pending requests
var ICLOUD_META = 'icloud_meta';

/** TZID parameter → a time zone Utilities.formatDate understands. Unknown or missing → TIME_ZONE. */
function icsZone_(tzid) {
  var id = String(tzid || '').replace(/^"|"$/g, '').trim();
  if (!id) return CONFIG.TIME_ZONE;
  var alias = ICS_ZONE_ALIASES[id.toLowerCase()];
  if (alias) return alias;
  var m = ICS_ZONE_RE.exec(id);
  return m ? m[1] : CONFIG.TIME_ZONE;
}

/** Unfolds lines and keeps only what busy times need (no titles, notes, locations or attendees). */
function icsMinify_(text) {
  return String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
    .filter(function (line) { return ICS_KEEP_RE.test(line); })
    .join('\n');
}

/** "DTSTART;TZID=America/Toronto:20261107T090000" → { name, params, value }. */
function icsLine_(line) {
  var quoted = false;
  var cut = -1;
  for (var i = 0; i < line.length; i++) {
    var c = line.charAt(i);
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) { cut = i; break; }
  }
  if (cut < 0) return null;
  var head = line.slice(0, cut).match(/("[^"]*"|[^;])+/g) || [''];
  var params = {};
  head.slice(1).forEach(function (kv) {
    var eq = kv.indexOf('=');
    if (eq > 0) params[kv.slice(0, eq).trim().toUpperCase()] = kv.slice(eq + 1).replace(/^"|"$/g, '');
  });
  return { name: head[0].trim().toUpperCase(), params: params, value: line.slice(cut + 1).trim() };
}

/** Property lists of every VEVENT (properties of nested VALARMs etc. are ignored). */
function icsEvents_(text) {
  var events = [];
  var stack = [];
  var cur = null;
  icsMinify_(text).split('\n').forEach(function (raw) {
    var p = raw && icsLine_(raw);
    if (!p) return;
    if (p.name === 'BEGIN') {
      stack.push(p.value.toUpperCase());
      if (p.value.toUpperCase() === 'VEVENT') cur = {};
    } else if (p.name === 'END') {
      if (stack.pop() === 'VEVENT' && cur) { events.push(cur); cur = null; }
    } else if (cur && stack[stack.length - 1] === 'VEVENT') {
      (cur[p.name] = cur[p.name] || []).push(p);
    }
  });
  return events;
}

/**
 * A DATE or DATE-TIME value → { wall, tz, date }: `wall` is the wall clock as if it were UTC ms.
 * 'Z' → UTC, TZID → that zone, floating → TIME_ZONE, all-day (VALUE=DATE) → midnight in TIME_ZONE.
 */
function icsTime_(value, params) {
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value || '').trim());
  if (!m) return null;
  var date = !m[4] || String((params && params.VALUE) || '').toUpperCase() === 'DATE';
  var wall = date ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  var tz = date ? CONFIG.TIME_ZONE : m[7] ? 'UTC' : icsZone_(params && params.TZID);
  return { wall: wall, tz: tz, date: date };
}

/** Every value of EXDATE/RDATE lines (comma lists, PERIOD values use their start). */
function icsTimes_(props) {
  var out = [];
  (props || []).forEach(function (p) {
    p.value.split(',').forEach(function (v) {
      var t = icsTime_(v.split('/')[0], p.params);
      if (t) out.push(t);
    });
  });
  return out;
}

/** "P1DT2H" → { nominal: days/weeks (wall clock), exact: hours/minutes/seconds }. Negative → null. */
function icsDuration_(s) {
  var m = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s || '').trim().toUpperCase());
  if (!m) return null;
  return {
    nominal: ((+m[1] || 0) * 7 + (+m[2] || 0)) * DAY_MS,
    exact: ((+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) * 1000,
  };
}

/** RRULE value → rule, or null if it isn't one we can expand (then only DTSTART counts). */
function icsRule_(s) {
  var r = { freq: '', interval: 1, count: 0, until: null, byday: [], bymonthday: [], bymonth: [], bysetpos: [], wkst: 1 };
  var ints = function (v) { return v.split(',').map(Number).filter(function (n) { return n && isFinite(n); }); };
  String(s || '').split(';').forEach(function (kv) {
    var eq = kv.indexOf('=');
    if (eq < 0) return;
    var k = kv.slice(0, eq).trim().toUpperCase();
    var v = kv.slice(eq + 1).trim().toUpperCase();
    if (k === 'FREQ') r.freq = v;
    else if (k === 'INTERVAL') r.interval = Math.max(1, Math.floor(Number(v)) || 1);
    else if (k === 'COUNT') r.count = Math.max(0, Math.floor(Number(v)) || 0);
    else if (k === 'UNTIL') r.until = icsTime_(v, {});
    else if (k === 'BYMONTHDAY') r.bymonthday = ints(v);
    else if (k === 'BYMONTH') r.bymonth = ints(v);
    else if (k === 'BYSETPOS') r.bysetpos = ints(v);
    else if (k === 'WKST' && v in ICS_WEEKDAYS) r.wkst = ICS_WEEKDAYS[v];
    else if (k === 'BYDAY') {
      r.byday = v.split(',').map(function (x) {
        var m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim());
        return m ? { n: m[1] ? Number(m[1]) : 0, wd: ICS_WEEKDAYS[m[2]] } : null;
      }).filter(Boolean);
    }
  });
  return /^(DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(r.freq) ? r : null;
}

function icsEvent_(props) {
  var one = function (name) { return props[name] ? props[name][0] : null; };
  var ds = one('DTSTART');
  var start = ds && icsTime_(ds.value, ds.params);
  if (!start) return null;
  var rid = one('RECURRENCE-ID');
  var ev = {
    uid: one('UID') ? one('UID').value : '',
    start: start,
    skip: /^TRANSPARENT$/i.test(one('TRANSP') ? one('TRANSP').value : '') || /^CANCELLED$/i.test(one('STATUS') ? one('STATUS').value : ''),
    nominal: 0,
    exact: 0,
    recurrenceId: rid ? icsTime_(rid.value, rid.params) : null,
    rule: one('RRULE') && !rid ? icsRule_(one('RRULE').value) : null,
    exdates: icsTimes_(props.EXDATE),
    rdates: icsTimes_(props.RDATE),
  };
  var de = one('DTEND');
  var end = de && icsTime_(de.value, de.params);
  var du = one('DURATION') && icsDuration_(one('DURATION').value);
  if (end && (start.date || end.date || end.tz === start.tz)) ev.nominal = end.wall - start.wall;
  else if (end) ev.exact = zonedMs_(end.wall, end.tz) - zonedMs_(start.wall, start.tz);
  else if (du) { ev.nominal = du.nominal; ev.exact = du.exact; }
  else if (start.date) ev.nominal = DAY_MS;
  return ev;
}

function icsMonthDayMatch_(d, len, list) {
  return list.some(function (md) { return md > 0 ? md === d : len + md + 1 === d; });
}

/** Days of month `m` (0-based) a MONTHLY rule (or YEARLY with BYMONTH) produces, as UTC-midnight walls. */
function icsMonthDays_(y, m, r, md0) {
  var len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  var list;
  if (r.byday.length) {
    list = [];
    r.byday.forEach(function (b) {
      var all = [];
      for (var d = 1; d <= len; d++) if (new Date(Date.UTC(y, m, d)).getUTCDay() === b.wd) all.push(d);
      if (!b.n) list = list.concat(all);
      else if (all[b.n > 0 ? b.n - 1 : all.length + b.n]) list.push(all[b.n > 0 ? b.n - 1 : all.length + b.n]);
    });
    if (r.bymonthday.length) list = list.filter(function (d) { return icsMonthDayMatch_(d, len, r.bymonthday); });
  } else if (r.bymonthday.length) {
    list = r.bymonthday.map(function (md) { return md > 0 ? md : len + md + 1; });
  } else {
    list = [md0];
  }
  return list.filter(function (d) { return d >= 1 && d <= len; }).map(function (d) { return Date.UTC(y, m, d); });
}

function icsYearDays_(y, r, m0, md0) {
  var concat = function (months) {
    return months.reduce(function (all, mo) { return all.concat(icsMonthDays_(y, mo, r, md0)); }, []);
  };
  if (r.bymonth.length) return concat(r.bymonth.map(function (mo) { return mo - 1; }));
  if (r.bymonthday.length && !r.byday.length) return concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (r.byday.length) {
    var out = [];
    r.byday.forEach(function (b) {
      var all = [];
      for (var t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += DAY_MS) if (new Date(t).getUTCDay() === b.wd) all.push(t);
      if (!b.n) out = out.concat(all);
      else if (all[b.n > 0 ? b.n - 1 : all.length + b.n]) out.push(all[b.n > 0 ? b.n - 1 : all.length + b.n]);
    });
    return out;
  }
  return icsMonthDays_(y, m0, r, md0);
}

/** Period k of a rule: its first day and the (sorted) days it produces. */
function icsPeriod_(r, k, d0, ws0) {
  var first = new Date(d0);
  var y0 = first.getUTCFullYear();
  var m0 = first.getUTCMonth();
  var md0 = first.getUTCDate();
  var start;
  var days;
  if (r.freq === 'DAILY') {
    start = d0 + k * r.interval * DAY_MS;
    days = [start];
  } else if (r.freq === 'WEEKLY') {
    start = ws0 + k * r.interval * 7 * DAY_MS;
    var wds = r.byday.length ? r.byday.map(function (b) { return b.wd; }) : [first.getUTCDay()];
    days = wds.map(function (wd) { return start + ((wd - r.wkst + 7) % 7) * DAY_MS; });
  } else if (r.freq === 'MONTHLY') {
    var mi = m0 + k * r.interval;
    var y = y0 + Math.floor(mi / 12);
    start = Date.UTC(y, mi % 12, 1);
    days = icsMonthDays_(y, mi % 12, r, md0);
  } else {
    start = Date.UTC(y0 + k * r.interval, 0, 1);
    days = icsYearDays_(y0 + k * r.interval, r, m0, md0);
  }
  days = days.filter(function (t) {
    var d = new Date(t);
    if (r.bymonth.length && r.bymonth.indexOf(d.getUTCMonth() + 1) < 0) return false;
    if (r.freq === 'DAILY' && r.byday.length && !r.byday.some(function (b) { return b.wd === d.getUTCDay(); })) return false;
    if ((r.freq === 'DAILY' || r.freq === 'WEEKLY') && r.bymonthday.length) {
      return icsMonthDayMatch_(d.getUTCDate(), new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), r.bymonthday);
    }
    return true;
  }).sort(function (a, b) { return a - b; }).filter(function (t, i, all) { return i === 0 || t !== all[i - 1]; });
  if (r.bysetpos.length) {
    days = r.bysetpos.map(function (p) { return days[p > 0 ? p - 1 : days.length + p]; })
      .filter(function (t) { return t != null; })
      .sort(function (a, b) { return a - b; });
  }
  return { start: start, days: days };
}

/** Last allowed start (wall clock of the event's zone) for an UNTIL value. */
function icsUntil_(u, start) {
  if (!u) return Infinity;
  if (u.date) return u.wall + DAY_MS - 1;
  return u.tz === 'UTC' ? wallMs_(u.wall, start.tz) : u.wall;
}

/** Start walls of every instance of `ev` (from its RRULE, or just DTSTART) that fall in [lo, hi]. */
function icsExpand_(ev, lo, hi) {
  var r = ev.rule;
  var s0 = ev.start.wall;
  var out = [];
  var keep = function (w) { if (w >= lo && w <= hi) out.push(w); };
  if (!r) { keep(s0); return out; }
  var limit = icsUntil_(r.until, ev.start);
  var tod = s0 - Math.floor(s0 / DAY_MS) * DAY_MS;
  var d0 = s0 - tod;
  var ws0 = d0 - ((new Date(d0).getUTCDay() - r.wkst + 7) % 7) * DAY_MS;
  var k = 0;
  if (!r.count) {
    // Without COUNT nothing before the range matters, so jump straight to it.
    var a = new Date(d0);
    var b = new Date(lo);
    var units = r.freq === 'DAILY' ? Math.floor((lo - d0) / DAY_MS)
      : r.freq === 'WEEKLY' ? Math.floor((lo - ws0) / (7 * DAY_MS))
      : r.freq === 'MONTHLY' ? (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth()
      : b.getUTCFullYear() - a.getUTCFullYear();
    k = Math.max(0, Math.floor(units / r.interval) - 1);
  }
  var n = 1; // DTSTART is always the first instance
  keep(s0);
  for (var guard = 0; guard < ICS_MAX_PERIODS; guard++, k++) {
    var p = icsPeriod_(r, k, d0, ws0);
    if (p.start + tod > hi || p.start + tod > limit) break;
    for (var i = 0; i < p.days.length; i++) {
      var w = p.days[i] + tod;
      if (w <= s0) continue;
      if (w > limit) return out;
      if (r.count && ++n > r.count) return out;
      keep(w);
    }
  }
  return out;
}

/** A DATE/DATE-TIME as a wall clock in the zone of `start`. */
function icsInZone_(t, start) {
  if (t.date || start.date || t.tz === start.tz) return t.wall;
  return wallMs_(zonedMs_(t.wall, t.tz), start.tz);
}

/**
 * Busy blocks (epoch ms, merged) from an .ics feed that overlap [from, to). Skips TRANSPARENT and CANCELLED
 * events, honours RRULE/RDATE/EXDATE and RECURRENCE-ID overrides. Only start/end ever leave this function.
 */
function icsBusy_(text, from, to, stats) {
  var memo = {};
  var wallAt = function (ms, tz) {
    var key = tz + '@' + ms;
    if (!(key in memo)) memo[key] = wallMs_(ms, tz);
    return memo[key];
  };
  var events = icsEvents_(text).map(icsEvent_).filter(Boolean);
  if (stats) stats.events = events.length;
  var moved = {};
  events.forEach(function (ev) {
    if (ev.recurrenceId && ev.uid) (moved[ev.uid] = moved[ev.uid] || []).push(ev.recurrenceId);
  });
  var busy = [];
  events.forEach(function (ev) {
    var span = ev.nominal + ev.exact;
    if (ev.skip || span <= 0) return;
    var tz = ev.start.tz;
    var lo = wallAt(from, tz) - span - DAY_MS;
    var hi = wallAt(to, tz) + DAY_MS;
    var starts = icsExpand_(ev, lo, hi);
    if (!ev.recurrenceId) {
      ev.rdates.forEach(function (t) {
        var w = icsInZone_(t, ev.start);
        if (w >= lo && w <= hi) starts.push(w);
      });
    }
    if (!starts.length) return;
    var gone = ev.recurrenceId ? [] : ev.exdates.concat(moved[ev.uid] || []).map(function (t) {
      return { date: t.date, key: t.date ? t.wall : zonedMs_(t.wall, t.tz) };
    });
    starts.forEach(function (w) {
      var start = zonedMs_(w, tz);
      var day = Math.floor(w / DAY_MS) * DAY_MS;
      if (gone.some(function (g) { return g.date ? g.key === day : g.key === start; })) return;
      var end = zonedMs_(w + ev.nominal, tz) + ev.exact;
      if (start < to && end > from) busy.push({ start: start, end: end });
    });
  });
  return mergeIntervals_(busy);
}

/** ICLOUD_ICS_URLS → https URLs (webcal:// converted), plus how many entries weren't links. */
function icloudUrls_() {
  var raw = '';
  try { raw = PropertiesService.getScriptProperties().getProperty(CONFIG.ICLOUD_PROPERTY) || ''; } catch (err) { raw = ''; }
  var urls = [];
  var bad = 0;
  String(raw).split(/[\s,]+/).forEach(function (u) {
    if (!u) return;
    var url = u.replace(/^webcals?:\/\//i, 'https://');
    if (/^https?:\/\/[^\s/]+\/\S*$/i.test(url) && urls.length < ICS_MAX_URLS) urls.push(url);
    else bad++;
  });
  return { urls: urls, bad: bad };
}

/** Fetches every feed in parallel → [{ text } | { error }]. One unreachable host doesn't sink the others. */
function icloudFetch_(urls) {
  var request = function (url) {
    return { url: url, muteHttpExceptions: true, followRedirects: true, headers: { Accept: 'text/calendar' } };
  };
  var read = function (res) {
    var code = res.getResponseCode();
    if (code !== 200) return { error: 'HTTP ' + code };
    var text = res.getContentText();
    return text.indexOf('BEGIN:VCALENDAR') < 0 ? { error: 'not a calendar feed' } : { text: text };
  };
  try {
    return UrlFetchApp.fetchAll(urls.map(request)).map(read);
  } catch (err) {
    return urls.map(function (url) {
      try { return read(UrlFetchApp.fetch(url, request(url))); } catch (e) { return { error: 'could not connect' }; }
    });
  }
}

/** Busy blocks in [from, to) read straight from the feeds, with per-calendar counts (never titles). */
function icloudRead_(urls, from, to) {
  var busy = [];
  var calendars = icloudFetch_(urls).map(function (res) {
    if (res.error) return { ok: false, error: res.error };
    try {
      var stats = {};
      busy = busy.concat(icsBusy_(res.text, from, to, stats));
      return { ok: true, events: stats.events };
    } catch (err) {
      return { ok: false, error: 'could not read it' };
    }
  });
  return {
    busy: mergeIntervals_(busy),
    calendars: calendars,
    errors: calendars.filter(function (c) { return !c.ok; }).length,
  };
}

/** Busy blocks as "startMinute+minutes" in base 36: ~10 characters each. Rounded outwards to whole minutes. */
function encodeBusy_(busy) {
  return busy.map(function (b) {
    var a = Math.floor(b.start / MIN_MS);
    return a.toString(36) + '+' + (Math.ceil(b.end / MIN_MS) - a).toString(36);
  }).join(',');
}

function decodeBusy_(text) {
  return text ? text.split(',').map(function (x) {
    var p = x.split('+');
    var a = parseInt(p[0], 36);
    return { start: a * MIN_MS, end: (a + parseInt(p[1], 36)) * MIN_MS };
  }) : [];
}

/**
 * The last syncIcloud() result: { at, from, until, busy, errors }, or null.
 * Stored as chunked Script Properties rather than a Drive file: reading them is fast on every availability
 * request and needs no extra Drive permission, and a year of merged busy blocks is only tens of KB.
 */
function readSnapshot_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var meta;
  try { meta = JSON.parse(all[ICLOUD_META] || 'null'); } catch (err) { meta = null; }
  if (!meta) return null;
  var parts = [];
  for (var i = 0; i < meta.n; i++) {
    var part = all['icloud_' + meta.gen + '_' + i];
    if (part == null) return null; // a sync is swapping chunks right now
    parts.push(part);
  }
  return { at: meta.at, from: meta.from, until: meta.until, busy: decodeBusy_(parts.join('')), errors: meta.errors };
}

function writeSnapshot_(snap) {
  var props = PropertiesService.getScriptProperties();
  var busy = snap.busy;
  var until = snap.until;
  var text = encodeBusy_(busy);
  while (text.length > ICLOUD_MAX_CHARS && busy.length) {
    until = busy[busy.length - 1].start;
    busy = busy.slice(0, -1);
    text = encodeBusy_(busy);
  }
  var gen = Date.now().toString(36);
  var values = {};
  var n = Math.ceil(text.length / ICLOUD_CHUNK_CHARS);
  for (var i = 0; i < n; i++) values['icloud_' + gen + '_' + i] = text.slice(i * ICLOUD_CHUNK_CHARS, (i + 1) * ICLOUD_CHUNK_CHARS);
  props.setProperties(values);
  props.setProperty(ICLOUD_META, JSON.stringify({ at: snap.at, from: snap.from, until: until, gen: gen, n: n, errors: snap.errors }));
  Object.keys(props.getProperties()).forEach(function (k) {
    if (/^icloud_[a-z0-9]+_\d+$/.test(k) && k.indexOf('icloud_' + gen + '_') !== 0) props.deleteProperty(k);
  });
  return { busy: busy, until: until };
}

/**
 * Daily job (see installDailySync): reads every ICLOUD_ICS_URLS feed, expands busy times from now to
 * ICLOUD_SYNC_DAYS ahead and stores them (start/end only). A calendar that can't be read keeps the busy
 * times from the previous snapshot, so a flaky fetch never opens up times that were blocked.
 */
function syncIcloud() {
  var list = icloudUrls_();
  var now = Date.now();
  if (!list.urls.length) {
    writeSnapshot_({ at: now, from: now, until: now, busy: [], errors: list.bad });
    return { calendars: [], read: 0, events: 0, blocks: 0, errors: list.bad, syncedAt: now, until: now };
  }
  var until = now + CONFIG.ICLOUD_SYNC_DAYS * DAY_MS;
  var res = icloudRead_(list.urls, now, until);
  var busy = res.busy;
  if (res.errors) {
    var old = readSnapshot_();
    if (old) busy = mergeIntervals_(busy.concat(old.busy.filter(function (b) { return b.end > now; })));
  }
  var saved = writeSnapshot_({ at: now, from: now, until: until, busy: busy, errors: res.errors + list.bad });
  bumpAvailability_();
  return {
    calendars: res.calendars,
    read: res.calendars.length - res.errors,
    events: res.calendars.reduce(function (n, c) { return n + (c.events || 0); }, 0),
    blocks: saved.busy.length,
    errors: res.errors + list.bad,
    syncedAt: now,
    until: saved.until,
  };
}

/** iCloud busy times for availability: the snapshot, plus a live read for anything past its horizon (or if none yet). */
function icloudStored_(from, to) {
  var list = icloudUrls_();
  if (!list.urls.length) return { busy: [], errors: list.bad, syncedAt: null };
  var snap = readSnapshot_();
  if (!snap) {
    var live = icloudRead_(list.urls, from, to);
    return { busy: live.busy, errors: live.errors + list.bad, syncedAt: null };
  }
  var busy = snap.busy.filter(function (b) { return b.start < to && b.end > from; });
  var errors = snap.errors;
  if (to > snap.until) {
    var later = icloudRead_(list.urls, Math.max(from, snap.until), to);
    busy = busy.concat(later.busy);
    errors = Math.max(errors, later.errors + list.bad);
  }
  return { busy: busy, errors: errors, syncedAt: snap.at };
}

/** iCloud busy times read fresh (so a same-day event can't be double-booked); unreadable feeds fall back to the snapshot. */
function icloudLive_(from, to) {
  var list = icloudUrls_();
  if (!list.urls.length) return { busy: [], errors: list.bad, syncedAt: null };
  var live = icloudRead_(list.urls, from, to);
  var busy = live.busy;
  var snap = live.errors ? readSnapshot_() : null;
  if (snap) busy = busy.concat(snap.busy.filter(function (b) { return b.start < to && b.end > from; }));
  return { busy: busy, errors: live.errors + list.bad, syncedAt: snap ? snap.at : null };
}

/** Creates the daily syncIcloud trigger (~ICLOUD_SYNC_HOUR in TIME_ZONE). Safe to run again: it replaces the old one. */
function installDailySync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncIcloud') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncIcloud').timeBased().everyDays(1).atHour(CONFIG.ICLOUD_SYNC_HOUR).inTimezone(CONFIG.TIME_ZONE).create();
}

/* ───────────────────────── one-time iCloud setup (run from the editor) ───────────────────────── */

// Must be empty in the repo. Paste links between the brackets, run setIcloudUrls once, then empty it again and Save.
const ICLOUD_URLS_TO_SAVE = [ /* paste links, run setIcloudUrls once, then empty again */ ];

/**
 * Saves ICLOUD_URLS_TO_SAVE into the ICLOUD_ICS_URLS script property, installs the daily sync, syncs once
 * and logs a summary (counts only, no titles or links). Pick it in the toolbar and click Run.
 */
function setIcloudUrls(urls) {
  var list = (Array.isArray(urls) ? urls : ICLOUD_URLS_TO_SAVE)
    .map(function (u) { return String(u || '').trim(); })
    .filter(Boolean);
  if (!list.length) {
    Logger.log('ICLOUD_URLS_TO_SAVE is empty. Paste your iCloud links into it, Save, then run setIcloudUrls again.');
    return null;
  }
  PropertiesService.getScriptProperties().setProperty(CONFIG.ICLOUD_PROPERTY, list.join('\n'));
  installDailySync();
  var r = syncIcloud();
  var lines = [
    'Saved ' + list.length + ' iCloud link' + (list.length > 1 ? 's' : '') + ' in Script Properties (ICLOUD_ICS_URLS).',
    'Daily sync is on (about ' + clockLabel_(CONFIG.ICLOUD_SYNC_HOUR * 60) + ' Toronto time).',
    'Calendars read: ' + r.read + ' of ' + list.length + ' · events: ' + r.events + ' · busy blocks: ' + r.blocks + ' · errors: ' + r.errors,
  ];
  r.calendars.forEach(function (c, i) {
    lines.push('  Calendar ' + (i + 1) + ': ' + (c.ok ? c.events + ' event' + (c.events === 1 ? '' : 's') : 'not read (' + c.error + ')'));
  });
  if (r.errors) lines.push('Fix or remove the links that were not read, then run setIcloudUrls again.');
  lines.push('Now empty ICLOUD_URLS_TO_SAVE again and click Save.');
  Logger.log(lines.join('\n'));
  return r;
}

function ownerCalendar_() {
  var id = CONFIG.CALENDAR_IDS[0];
  return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
}

function randomHex_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function createHolds_(r) {
  var description =
    'Pending request from ' + (r.name || 'a visitor') + ' <' + r.replyTo + '>\n' +
    'Via: ' + r.source + '\n' +
    (r.timeZone ? 'Their time zone: ' + r.timeZone + '\n' : '') +
    (r.slots.length > 1 ? 'They suggested ' + r.slots.length + ' times; accepting one removes the other holds.\n' : '') +
    '\n' + r.message;
  var cal = ownerCalendar_();
  var eventIds = r.slots.map(function (s, i) {
    var ev = cal.createEvent(holdTitle_(r.activity, r.name, i + 1, r.slots.length), new Date(s.start), new Date(s.end), { description: description });
    try { ev.setColor(CONFIG.HOLD_COLOR); } catch (err) { /* color is cosmetic */ }
    return ev.getId();
  });

  var id = randomHex_().slice(0, 16);
  var token = randomHex_();
  PropertiesService.getScriptProperties().setProperty('req_' + token, JSON.stringify({
    id: id,
    eventIds: eventIds,
    slots: r.slots,
    email: r.replyTo,
    name: r.name,
    activity: r.activity,
    timeZone: r.timeZone,
  }));
  bumpAvailability_();
  return { id: id, token: token };
}

function loadRequest_(id, token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  var raw = PropertiesService.getScriptProperties().getProperty('req_' + token);
  if (!raw) return null;
  var rec = JSON.parse(raw);
  return rec.id === id ? rec : null;
}

function forgetRequest_(token) {
  PropertiesService.getScriptProperties().deleteProperty('req_' + token);
}

/** Drops request records whose last proposed time ended more than a day ago. */
function cleanupRequests_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('req_') !== 0) return;
    try {
      var last = Math.max.apply(null, JSON.parse(all[k]).slots.map(function (s) { return s.end; }));
      if (last < Date.now() - DAY_MS) props.deleteProperty(k);
    } catch (err) {
      props.deleteProperty(k);
    }
  });
}

function bumpAvailability_() {
  CacheService.getScriptCache().put('gen', String(Date.now()), 21600);
}

/* ───────────────────────── email + pages ───────────────────────── */

function formatWhen_(start, end, tz) {
  var s = new Date(start);
  var e = new Date(end);
  var sameDay = Utilities.formatDate(s, tz, 'yyyyMMdd') === Utilities.formatDate(e, tz, 'yyyyMMdd');
  return Utilities.formatDate(s, tz, 'EEE, MMM d, yyyy, h:mm a') + ' – ' +
    Utilities.formatDate(e, tz, sameDay ? 'h:mm a z' : 'EEE, MMM d, h:mm a z');
}

function safeFormat_(start, end, tz) {
  try { return tz ? formatWhen_(start, end, tz) : ''; } catch (err) { return ''; }
}

function webAppUrl_() {
  return CONFIG.WEB_APP_URL || ScriptApp.getService().getUrl();
}

function sendOwnerEmail_(r, req) {
  var footer =
    '———\n' +
    'From: ' + (r.name || 'A visitor') + (r.replyTo ? ' <' + r.replyTo + '>' : '') + '\n' +
    'Sent via: ' + r.source + '\n' +
    'Reply to this email to answer them directly.';
  var mail = {
    to: Session.getEffectiveUser().getEmail(),
    subject: '♡ ' + r.subject,
    body: r.message + '\n\n' + footer,
    name: "Yiyi's Universe",
  };
  if (r.replyTo) mail.replyTo = r.replyTo;

  if (req) {
    var base = webAppUrl_() + '?id=' + req.id + '&token=' + req.token;
    var theirTz = r.timeZone && r.timeZone !== CONFIG.TIME_ZONE ? r.timeZone : '';
    var options = r.slots.map(function (s, i) {
      return {
        n: i + 1,
        when: formatWhen_(s.start, s.end, CONFIG.TIME_ZONE),
        theirs: theirTz ? safeFormat_(s.start, s.end, theirTz) : '',
        accept: base + '&action=accept&option=' + (i + 1),
      };
    });
    var decline = base + '&action=decline';
    var many = options.length > 1;
    if (!many) mail.subject = '♡ ' + r.subject + ' · ' + Utilities.formatDate(new Date(r.slots[0].start), CONFIG.TIME_ZONE, 'EEE MMM d, h:mm a');

    mail.body =
      r.message + '\n\n' +
      (many ? 'They suggested ' + options.length + ' times (Toronto). Accept the one that works:\n\n' : '') +
      options.map(function (o) {
        return (many ? 'Option ' + o.n + ': ' : 'When (Toronto): ') + o.when + '\n' +
          (o.theirs ? '  Their time (' + theirTz + '): ' + o.theirs + '\n' : '') +
          '  Accept this time (sends them a Google Calendar invite): ' + o.accept + '\n';
      }).join('\n') +
      '\n' + (many ? 'Decline all' : 'Decline') + ' (removes the hold' + (many ? 's' : '') + ', sends a kind note): ' + decline + '\n\n' +
      'Each time has a "♡ Request" hold on your calendar until you choose.\n\n' +
      footer;

    var pill = 'display:inline-block;border:2px solid #21151D;border-radius:999px;padding:8px 16px;font-weight:bold;text-decoration:none;';
    mail.htmlBody =
      '<div style="font-family:Helvetica,Arial,sans-serif;color:#21151D;max-width:560px">' +
      '<p style="white-space:pre-wrap;font-size:15px">' + esc_(r.message) + '</p>' +
      '<p style="margin:16px 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8B1E55"><b>' +
      (many ? 'They suggested ' + options.length + ' times' : 'Requested time') + '</b></p>' +
      options.map(function (o) {
        return '<div style="background:#FFF0F7;border:2px solid #21151D;border-radius:16px;padding:14px;margin:0 0 10px">' +
          (many ? '<p style="margin:0 0 2px;font-size:12px;color:#8B1E55"><b>Option ' + o.n + '</b></p>' : '') +
          '<p style="margin:0;font-size:17px"><b>' + esc_(o.when) + '</b></p>' +
          (o.theirs ? '<p style="margin:4px 0 0;font-size:13px">Their time (' + esc_(theirTz) + '): ' + esc_(o.theirs) + '</p>' : '') +
          '<p style="margin:10px 0 0"><a href="' + esc_(o.accept) + '" style="' + pill + 'background:#FF4FA3;color:#FFFDF8">Accept this time ♡</a></p>' +
          '</div>';
      }).join('') +
      '<p style="margin:12px 0"><a href="' + esc_(decline) + '" style="' + pill + 'background:#FFFDF8;color:#21151D">' + (many ? 'Decline all' : 'Decline') + '</a></p>' +
      '<p style="font-size:12px;color:#8B1E55;white-space:pre-wrap">' + esc_(footer) + '</p></div>';
  }
  MailApp.sendEmail(mail);
}

function reviewPage_(action, id, token, option) {
  var rec = loadRequest_(id, token);
  var slot = rec && action === 'accept' ? rec.slots[option - 1] : null;
  var body;
  if (!rec || (action === 'accept' && !slot)) {
    body = '<h1>Hmm ♡</h1><p>This link has expired or was already used.</p>';
  } else {
    var many = rec.slots.length > 1;
    var when = action === 'accept'
      ? '<p class="when">' + esc_(formatWhen_(slot.start, slot.end, CONFIG.TIME_ZONE)) + '</p>'
      : rec.slots.map(function (s) { return '<p class="when">' + esc_(formatWhen_(s.start, s.end, CONFIG.TIME_ZONE)) + '</p>'; }).join('');
    var verb = action === 'accept' ? 'Accept this time ♡' : many ? 'Decline all' : 'Decline';
    body =
      '<p class="k">' + (action === 'accept' ? (many ? 'Option ' + option + ' of ' + rec.slots.length + ' · say yes?' : 'Say yes?') : 'Not this time?') + '</p>' +
      '<h1>' + esc_(rec.activity || 'Plans') + '</h1>' +
      '<p>with <b>' + esc_(rec.name || 'a visitor') + '</b> · ' + esc_(rec.email) + '</p>' +
      when +
      '<p class="s">' + (action === 'accept'
        ? 'They get a real Google Calendar invite from you' + (many ? ', and the other holds are removed.' : '.')
        : 'The hold' + (many ? 's are' : ' is') + ' removed and they get a kind "that doesn\'t work" email from you.') + '</p>' +
      '<button id="go" class="' + action + '">' + verb + '</button>' +
      '<p id="out" role="status"></p>' +
      '<script>' +
      'document.getElementById("go").onclick=function(){var b=this;b.disabled=true;b.textContent="One sec…";' +
      'google.script.run.withSuccessHandler(function(r){b.remove();document.getElementById("out").textContent=r.message;})' +
      '.withFailureHandler(function(){b.disabled=false;b.textContent="Try again";document.getElementById("out").textContent="Something went wrong.";})' +
      '.respondToRequest(' + JSON.stringify(action) + ',' + JSON.stringify(id) + ',' + JSON.stringify(token) + ',' + JSON.stringify(option || 0) + ');};' +
      '</script>';
  }
  var html =
    '<!doctype html><html><head><base target="_top"><style>' +
    'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FFD6EA;font-family:Helvetica,Arial,sans-serif;color:#21151D}' +
    '.card{background:#FFFDF8;border:3px solid #21151D;border-radius:28px;box-shadow:8px 8px 0 #21151D;padding:28px;max-width:420px;margin:24px}' +
    'h1{font-size:30px;margin:4px 0 8px}.k{margin:0;color:#8B1E55;font-weight:bold;text-transform:uppercase;letter-spacing:.15em;font-size:12px}' +
    '.when{background:#FFF0F7;border:2px solid #21151D;border-radius:14px;padding:10px 12px;font-weight:bold;margin:8px 0}.s{font-size:14px;opacity:.75}' +
    'button{font:inherit;font-weight:bold;font-size:17px;border:2px solid #21151D;border-radius:999px;padding:12px 22px;cursor:pointer;box-shadow:4px 4px 0 #21151D}' +
    'button.accept{background:#FF4FA3;color:#FFFDF8}button.decline{background:#FFFDF8;color:#21151D}#out{font-weight:bold;font-size:18px}' +
    '</style></head><body><div class="card">' + body + '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle("Yiyi's Universe ♡")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
