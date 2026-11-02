/**
 * Yiyi's Universe ♡ — invite + calendar relay (Google Apps Script, free).
 * Runs as you (yiyitan076@gmail.com). It:
 *   • GET  ?action=availability&from=ISO&to=ISO → busy blocks only (start/end, never titles) from CALENDAR_IDS
 *   • POST invite JSON → emails you; with start/end it also puts a "♡ Request" hold on your calendar
 *   • GET  ?action=accept|decline&id=…&token=… → a page to confirm; accepting sends the visitor a real
 *     Google Calendar invite, declining deletes the hold and emails them a kind note.
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
  MAX_WINDOW_DAYS: 60,
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

/** Clamps a requested availability window to [now, now + MAX_WINDOW_DAYS]. */
function clampWindow_(fromIso, toIso, nowMs) {
  var max = nowMs + CONFIG.MAX_WINDOW_DAYS * DAY_MS;
  var from = parseIso_(fromIso);
  var to = parseIso_(toIso);
  from = isFinite(from) ? Math.max(from, nowMs) : nowMs;
  to = isFinite(to) ? Math.min(to, max) : Math.min(nowMs + 42 * DAY_MS, max);
  if (to <= from) return null;
  return { from: from, to: to };
}

/** Validates an invite payload. Untimed invites (no start/end) are plain emails. */
function validateRequest_(d, nowMs) {
  var hasTime = d.start != null || d.end != null;
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
  if (!hasTime) return base;

  var start = parseIso_(d.start);
  var end = parseIso_(d.end);
  if (!isFinite(start) || !isFinite(end)) return { ok: false, code: 'invalid', message: 'That date/time looks off. Pick it again?' };
  if (end <= start) return { ok: false, code: 'invalid', message: 'The plan has to end after it starts.' };
  if (end - start > CONFIG.MAX_DURATION_MIN * MIN_MS) return { ok: false, code: 'invalid', message: 'Plans can be up to 12 hours.' };
  if (start < nowMs + CONFIG.MIN_LEAD_MIN * MIN_MS) return { ok: false, code: 'invalid', message: 'Pick a time a little further in the future.' };
  if (start > nowMs + CONFIG.MAX_WINDOW_DAYS * DAY_MS) return { ok: false, code: 'invalid', message: 'That is too far ahead. Pick something in the next few weeks.' };
  if (!base.replyTo) return { ok: false, code: 'invalid', message: 'Add your email so the calendar invite can reach you.' };

  base.timed = true;
  base.start = start;
  base.end = end;
  return base;
}

function holdTitle_(activity, name) {
  return '♡ Request: ' + (activity || 'Plans') + ' with ' + (name || 'a visitor');
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
    if (p.action === 'accept' || p.action === 'decline') return reviewPage_(p.action, p.id, p.token);
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
      var busy = getBusy_(r.start, r.end).busy;
      if (overlapsAny_(r.start, r.end, busy)) {
        return json_({ success: false, code: 'conflict', message: 'That time just got booked. Pick another one?' });
      }
      var hold = createHold_(r);
      sendOwnerEmail_(r, hold);
    } finally {
      lock.releaseLock();
    }
    cleanupRequests_();
    return json_({ success: true, pending: true });
  } catch (err) {
    return json_({ success: false, message: 'Something went wrong.' });
  }
}

/** Called from the Accept/Decline review page via google.script.run. */
function respondToRequest(action, id, token) {
  var rec = loadRequest_(id, token);
  if (!rec) return { ok: false, message: 'This link has expired or was already used.' };
  var cal = ownerCalendar_();
  var hold = cal.getEventById(rec.eventId);

  if (action === 'accept') {
    var opts = { description: hold ? hold.getDescription() : '', sendInvites: true };
    if (isEmail_(rec.email)) opts.guests = rec.email;
    var ev = cal.createEvent(confirmedTitle_(rec.activity, rec.name), new Date(rec.start), new Date(rec.end), opts);
    try { ev.setColor(CONFIG.CONFIRMED_COLOR); } catch (err) { /* color is cosmetic */ }
    if (hold) hold.deleteEvent();
    forgetRequest_(token);
    return { ok: true, message: "It's a date! " + (rec.name || 'They') + ' just got a Google Calendar invite ♡' };
  }

  if (action === 'decline') {
    if (hold) hold.deleteEvent();
    if (isEmail_(rec.email)) {
      MailApp.sendEmail({
        to: rec.email,
        replyTo: Session.getEffectiveUser().getEmail(),
        name: 'Yiyi',
        subject: 'About ' + (rec.activity || 'our plans') + ' ♡',
        body:
          'Hi ' + (rec.name || 'there') + ',\n\n' +
          'Thank you so much for the invite to ' + (rec.activity || 'hang out') + ' on ' + (safeFormat_(rec.start, rec.end, rec.timeZone) || formatWhen_(rec.start, rec.end, CONFIG.TIME_ZONE)) + '! ' +
          "That time doesn't work for me, sorry.\n\n" +
          'Reply to this email if you want to suggest another time' + (CONFIG.SITE_URL ? ', or pick a new one here: ' + CONFIG.SITE_URL : '') + '.\n\n' +
          '— Yiyi ♡',
      });
    }
    forgetRequest_(token);
    bumpAvailability_();
    return { ok: true, message: 'Declined. The hold is gone and ' + (rec.name || 'they') + ' got a kind note ♡' };
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

function createHold_(r) {
  var description =
    'Pending request from ' + (r.name || 'a visitor') + ' <' + r.replyTo + '>\n' +
    'Via: ' + r.source + '\n' +
    (r.timeZone ? 'Their time zone: ' + r.timeZone + '\n' : '') +
    '\n' + r.message;
  var ev = ownerCalendar_().createEvent(holdTitle_(r.activity, r.name), new Date(r.start), new Date(r.end), { description: description });
  try { ev.setColor(CONFIG.HOLD_COLOR); } catch (err) { /* color is cosmetic */ }

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('req_' + token, JSON.stringify({
    eventId: ev.getId(),
    email: r.replyTo,
    name: r.name,
    activity: r.activity,
    start: r.start,
    end: r.end,
    timeZone: r.timeZone,
  }));
  bumpAvailability_();
  return { eventId: ev.getId(), token: token };
}

function loadRequest_(id, token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  var raw = PropertiesService.getScriptProperties().getProperty('req_' + token);
  if (!raw) return null;
  var rec = JSON.parse(raw);
  return rec.eventId === id ? rec : null;
}

function forgetRequest_(token) {
  PropertiesService.getScriptProperties().deleteProperty('req_' + token);
}

/** Drops request records whose plan ended more than a day ago. */
function cleanupRequests_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('req_') !== 0) return;
    try { if (JSON.parse(all[k]).end < Date.now() - DAY_MS) props.deleteProperty(k); } catch (err) { props.deleteProperty(k); }
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
  return Utilities.formatDate(s, tz, 'EEE, MMM d, h:mm a') + ' – ' +
    Utilities.formatDate(e, tz, sameDay ? 'h:mm a z' : 'EEE, MMM d, h:mm a z');
}

function webAppUrl_() {
  return CONFIG.WEB_APP_URL || ScriptApp.getService().getUrl();
}

function sendOwnerEmail_(r, hold) {
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

  if (hold) {
    var when = formatWhen_(r.start, r.end, CONFIG.TIME_ZONE);
    var theirs = r.timeZone && r.timeZone !== CONFIG.TIME_ZONE ? safeFormat_(r.start, r.end, r.timeZone) : '';
    var q = '&id=' + encodeURIComponent(hold.eventId) + '&token=' + hold.token;
    var accept = webAppUrl_() + '?action=accept' + q;
    var decline = webAppUrl_() + '?action=decline' + q;
    mail.subject = '♡ ' + r.subject + ' · ' + Utilities.formatDate(new Date(r.start), CONFIG.TIME_ZONE, 'EEE MMM d, h:mm a');
    mail.body =
      r.message + '\n\n' +
      'When (Toronto): ' + when + '\n' +
      (theirs ? 'Their time (' + r.timeZone + '): ' + theirs + '\n' : '') +
      'A "♡ Request" hold is on your calendar.\n\n' +
      'Accept (sends them a Google Calendar invite): ' + accept + '\n' +
      'Decline (removes the hold, sends a kind note): ' + decline + '\n\n' +
      footer;
    mail.htmlBody =
      '<div style="font-family:Helvetica,Arial,sans-serif;color:#21151D;max-width:560px">' +
      '<p style="white-space:pre-wrap;font-size:15px">' + esc_(r.message) + '</p>' +
      '<div style="background:#FFF0F7;border:2px solid #21151D;border-radius:16px;padding:16px;margin:16px 0">' +
      '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8B1E55"><b>Requested time</b></p>' +
      '<p style="margin:0;font-size:18px"><b>' + esc_(when) + '</b></p>' +
      (theirs ? '<p style="margin:4px 0 0;font-size:13px">Their time (' + esc_(r.timeZone) + '): ' + esc_(theirs) + '</p>' : '') +
      '<p style="margin:16px 0 0">' +
      '<a href="' + esc_(accept) + '" style="display:inline-block;background:#FF4FA3;color:#FFFDF8;border:2px solid #21151D;border-radius:999px;padding:10px 18px;font-weight:bold;text-decoration:none">Accept ♡</a> ' +
      '<a href="' + esc_(decline) + '" style="display:inline-block;background:#FFFDF8;color:#21151D;border:2px solid #21151D;border-radius:999px;padding:10px 18px;font-weight:bold;text-decoration:none">Decline</a>' +
      '</p></div>' +
      '<p style="font-size:12px;color:#8B1E55;white-space:pre-wrap">' + esc_(footer) + '</p></div>';
  }
  MailApp.sendEmail(mail);
}

function safeFormat_(start, end, tz) {
  try { return formatWhen_(start, end, tz); } catch (err) { return ''; }
}

function reviewPage_(action, id, token) {
  var rec = loadRequest_(id, token);
  var body;
  if (!rec) {
    body = '<h1>Hmm ♡</h1><p>This link has expired or was already used.</p>';
  } else {
    var verb = action === 'accept' ? 'Accept' : 'Decline';
    body =
      '<p class="k">' + (action === 'accept' ? 'Say yes?' : 'Not this time?') + '</p>' +
      '<h1>' + esc_(rec.activity || 'Plans') + '</h1>' +
      '<p>with <b>' + esc_(rec.name || 'a visitor') + '</b> · ' + esc_(rec.email) + '</p>' +
      '<p class="when">' + esc_(formatWhen_(rec.start, rec.end, CONFIG.TIME_ZONE)) + '</p>' +
      '<p class="s">' + (action === 'accept'
        ? 'They get a real Google Calendar invite from you.'
        : 'The hold is removed and they get a kind "that time doesn\'t work" email from you.') + '</p>' +
      '<button id="go" class="' + action + '">' + verb + (action === 'accept' ? ' ♡' : '') + '</button>' +
      '<p id="out" role="status"></p>' +
      '<script>' +
      'document.getElementById("go").onclick=function(){var b=this;b.disabled=true;b.textContent="One sec…";' +
      'google.script.run.withSuccessHandler(function(r){b.remove();document.getElementById("out").textContent=r.message;})' +
      '.withFailureHandler(function(){b.disabled=false;b.textContent="Try again";document.getElementById("out").textContent="Something went wrong.";})' +
      '.respondToRequest(' + JSON.stringify(action) + ',' + JSON.stringify(id) + ',' + JSON.stringify(token) + ');};' +
      '</script>';
  }
  var html =
    '<!doctype html><html><head><base target="_top"><style>' +
    'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FFD6EA;font-family:Helvetica,Arial,sans-serif;color:#21151D}' +
    '.card{background:#FFFDF8;border:3px solid #21151D;border-radius:28px;box-shadow:8px 8px 0 #21151D;padding:28px;max-width:420px;margin:24px}' +
    'h1{font-size:30px;margin:4px 0 8px}.k{margin:0;color:#8B1E55;font-weight:bold;text-transform:uppercase;letter-spacing:.15em;font-size:12px}' +
    '.when{background:#FFF0F7;border:2px solid #21151D;border-radius:14px;padding:10px 12px;font-weight:bold}.s{font-size:14px;opacity:.75}' +
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
