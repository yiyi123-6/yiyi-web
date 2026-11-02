/**
 * Yiyi's Universe ♡ — invite + calendar relay (Google Apps Script, free).
 * Runs as you (yiyitan076@gmail.com). It:
 *   • GET  ?action=availability&from=ISO&to=ISO → busy blocks only (start/end, never titles) from CALENDAR_IDS
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
 * After editing this file: Deploy → Manage deployments → ✏️ → Version: New version → Deploy
 * (the /exec URL stays the same). New permissions prompt for re-authorization.
 */

var CONFIG = {
  /** Busy times come from all of these. The first one is yours: holds and confirmed plans go there. */
  CALENDAR_IDS: ['primary', 'ee.official67@gmail.com'],
  TIME_ZONE: 'America/Toronto',
  /**
   * Never bookable, in TIME_ZONE. Days: 0 = Sunday … 6 = Saturday. Minutes after midnight.
   * Keep in sync with WORK_HOURS in src/lib/calendar.ts.
   */
  WORK_HOURS: { DAYS: [1, 2, 3, 4, 5], START_MIN: 9 * 60, END_MIN: 19 * 60 },
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

/** Wall-clock time in TIME_ZONE, expressed as if it were UTC ms (so day/minute math is plain arithmetic). */
function wallMs_(ms) {
  return Date.parse(Utilities.formatDate(new Date(ms), CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss") + 'Z');
}

/** True if [start, end) touches the work-hours window on any day it spans. */
function overlapsWorkHours_(start, end) {
  var w = CONFIG.WORK_HOURS;
  var a = wallMs_(start);
  var b = wallMs_(end);
  for (var day = Math.floor(a / DAY_MS) * DAY_MS; day < b; day += DAY_MS) {
    if (w.DAYS.indexOf(new Date(day).getUTCDay()) < 0) continue;
    if (a < day + w.END_MIN * MIN_MS && b > day + w.START_MIN * MIN_MS) return true;
  }
  return false;
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
    if (overlapsWorkHours_(start, end)) return { ok: false, code: 'work', message: 'Weekdays 9 AM–7 PM (Toronto) are work hours. Pick a morning, evening or weekend?' };
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
      var conflicts = r.slots.filter(function (s) { return overlapsAny_(s.start, s.end, getBusy_(s.start, s.end).busy); });
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
  if (!win) return { success: true, busy: [], calendarsMissing: [] };
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
  };
  try { cache.put(key, JSON.stringify(out), 60); } catch (err) { /* too big to cache */ }
  return out;
}

/** Merged busy blocks across CALENDAR_IDS. Free/busy API first (works with "See only free/busy" sharing). */
function getBusy_(from, to) {
  try {
    return freeBusyApi_(from, to);
  } catch (err) {
    return calendarAppBusy_(from, to);
  }
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
