/**
 * Yiyi's Universe ♡ — invite relay (Google Apps Script, free).
 * Sends every website invite straight to your Gmail inbox, from your own Gmail account.
 *
 * Setup (once, ~3 minutes) — see README "Invites straight to Gmail":
 *   1. https://script.google.com → New project → paste this file → Save.
 *   2. Deploy → New deployment → type "Web app"
 *        Execute as: Me      Who has access: Anyone
 *   3. Authorize, copy the Web app URL (ends in /exec)
 *   4. Paste it into links.inviteScriptUrl in src/data/content.ts and push.
 */

var MAX_PER_HOUR = 30;

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.website) return json_({ success: true }); // honeypot: bots fill hidden fields

    var cache = CacheService.getScriptCache();
    var count = Number(cache.get('count') || 0);
    if (count >= MAX_PER_HOUR) return json_({ success: false, message: 'Too many invites right now, try again later.' });
    cache.put('count', String(count + 1), 3600);

    var clip = function (s, n) { return String(s || '').slice(0, n); };
    var replyTo = clip(d.replyTo, 200);
    var validReply = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo);

    var body =
      clip(d.message, 5000) + '\n\n' +
      '———\n' +
      'From: ' + (clip(d.name, 100) || 'A visitor') + (validReply ? ' <' + replyTo + '>' : '') + '\n' +
      'Sent via: ' + clip(d.source, 100) + '\n' +
      'Reply to this email to answer them directly.';

    var mail = {
      to: Session.getEffectiveUser().getEmail(),
      subject: '♡ ' + clip(d.subject, 150),
      body: body,
      name: "Yiyi's Universe",
    };
    if (validReply) mail.replyTo = replyTo;
    MailApp.sendEmail(mail);
    return json_({ success: true });
  } catch (err) {
    return json_({ success: false, message: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
