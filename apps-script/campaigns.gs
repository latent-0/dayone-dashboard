/**
 * Dayone Command Centre: email campaign feed for ONE Gmail / Google Workspace mailbox.
 *
 * Reads the mailbox's own sent outreach and the replies to it, and publishes the stats as JSON
 * for the dashboard's "Email campaigns" view. Nothing is sent, changed or deleted in the mailbox.
 *
 * SETUP (about 5 minutes, done while signed in as the mailbox owner, e.g. kim@dayoneventurepartners.com):
 *   1. Go to https://script.google.com → New project. Name it "Dayone campaign feed".
 *   2. Paste this whole file over Code.gs and save.
 *   3. Project Settings → Script Properties → add FEED_KEY = a long random string (32+ characters).
 *   4. Run `setup` once from the editor and approve the Gmail + Drive read permissions.
 *      It builds the first snapshot and adds a trigger that refreshes it every 15 minutes.
 *   5. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *      Copy the /exec URL.
 *   6. In the dashboard set CAMPAIGN_FEEDS = <exec URL>?key=<FEED_KEY>
 *      (comma-separate several URLs to track several mailboxes) and redeploy.
 *
 * WHAT COUNTS AS A CAMPAIGN
 *   - Any thread carrying a Gmail label under "Campaign/" (e.g. Campaign/PE operating partners Q4)
 *     is grouped under that label. Labelling is the most reliable way to name campaigns.
 *   - Everything else is grouped by subject line, with the recipient's first name and company
 *     replaced by {name} / {company}, so a personalised mail merge still lands in one campaign.
 *   - Only threads that START with a message from this mailbox count as outreach. Replies to
 *     inbound enquiries are ignored.
 *
 * LIMITS: Gmail does not record opens or clicks; this reports sends, replies, bounces and auto-replies.
 */

var CONFIG = {
  days: 120,                       // how far back to look
  maxThreads: 1500,                // safety cap per run (Apps Script has a 6 minute limit)
  labelPrefix: 'Campaign/',        // labels under this prefix name a campaign
  extraQuery: '',                  // e.g. '-to:@dayoneventurepartners.com' to drop internal mail
  ignoreInternal: true,            // skip threads where every recipient shares this mailbox's domain
  snippetChars: 180,               // length of reply preview stored in the feed
  snapshotFile: 'dayone-campaign-feed.json',
};

var POSITIVE = /\b(interested|sounds (good|great|interesting)|let'?s (talk|chat|connect|meet|speak)|happy to (chat|talk|connect|meet)|keen to|would love to|set up a (call|time|meeting)|book a (call|time)|calendly|my calendar|what times?|when are you free|available (on|next|this)|send (me )?(more|details|the deck)|tell me more|yes,? please)\b/i;
var NEGATIVE = /\b(not interested|no thanks|no,? thank you|unsubscribe|remove me|take me off|stop (emailing|contacting)|do not (email|contact)|not a (good )?fit|not (the )?right (time|person)|we('| a)re all set|we will pass|we'll pass|please don'?t)\b/i;
var AUTO_SUBJECT = /^(automatic reply|auto.?reply|out of (the )?office|away from|autoreply|i('| a)m (currently )?(away|out)|on (annual )?leave|vacation)/i;
var BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery (subsystem|system))/i;
var BOUNCE_SUBJECT = /(delivery status notification|undeliver|delivery (has )?failed|returned mail|mail delivery failed|address not found|failure notice)/i;

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshSnapshot') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshSnapshot').timeBased().everyMinutes(15).create();
  refreshSnapshot();
}

function refreshSnapshot() {
  var data = buildFeed();
  var body = JSON.stringify(data);
  var files = DriveApp.getFilesByName(CONFIG.snapshotFile);
  if (files.hasNext()) files.next().setContent(body);
  else DriveApp.createFile(CONFIG.snapshotFile, body, 'application/json');
  return data;
}

function doGet(e) {
  var key = PropertiesService.getScriptProperties().getProperty('FEED_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return out({ ok: false, error: 'unauthorised' });
  var files = DriveApp.getFilesByName(CONFIG.snapshotFile);
  if (files.hasNext() && !e.parameter.rebuild) return ContentService.createTextOutput(files.next().getBlob().getDataAsString()).setMimeType(ContentService.MimeType.JSON);
  return out(refreshSnapshot());
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------------------------

function buildFeed() {
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  var myDomain = me.split('@')[1];
  var mine = {};
  mine[me] = true;
  GmailApp.getAliases().forEach(function (a) { mine[a.toLowerCase()] = true; });

  var query = 'in:sent newer_than:' + CONFIG.days + 'd ' + CONFIG.extraQuery;
  var threads = [];
  for (var start = 0; threads.length < CONFIG.maxThreads; start += 250) {
    var page = GmailApp.search(query, start, 250);
    threads = threads.concat(page);
    if (page.length < 250) break;
  }

  var bounced = collectBounces();
  var campaigns = {};
  var contacts = [];
  var daily = {};
  var day = function (d) { return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); };
  var bump = function (d, k) { var key = day(d); daily[key] = daily[key] || { d: key, sent: 0, followUps: 0, replies: 0, bounces: 0 }; daily[key][k]++; };

  for (var i = 0; i < threads.length; i += 100) {
    var batch = threads.slice(i, i + 100);
    var msgsList = GmailApp.getMessagesForThreads(batch);
    for (var j = 0; j < batch.length; j++) {
      var thread = batch[j], msgs = msgsList[j];
      if (!msgs.length || !isMine(msgs[0].getFrom(), mine)) continue;           // outreach starts with us
      var first = msgs[0];
      var to = parseAddresses(first.getTo());
      var external = to.filter(function (a) { return !CONFIG.ignoreInternal || a.email.split('@')[1] !== myDomain; });
      if (!external.length) continue;
      var rcpt = external[0];

      var camp = campaignFor(thread, first.getSubject(), rcpt);
      var c = campaigns[camp.id] = campaigns[camp.id] || { id: camp.id, name: camp.name, source: camp.source, sample: first.getSubject(), firstSent: null, lastSent: null };
      c.firstSent = min(c.firstSent, first.getDate());
      c.lastSent = max(c.lastSent, first.getDate());
      bump(first.getDate(), 'sent');

      var followUps = 0, reply = null, auto = null, bounce = null, sentiment = 'neutral';
      for (var k = 1; k < msgs.length; k++) {
        var m = msgs[k], from = m.getFrom();
        if (isMine(from, mine)) { if (!reply) { followUps++; bump(m.getDate(), 'followUps'); } continue; }
        if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(m.getSubject())) { bounce = bounce || m; continue; }
        if (isAuto(m)) { auto = auto || m; continue; }
        if (!reply) reply = m;
      }
      if (!bounce && bounced[rcpt.email]) bounce = { getDate: function () { return bounced[rcpt.email]; } };

      var status = reply ? 'replied' : bounce ? 'bounced' : auto ? 'auto' : 'awaiting';
      var snippet = '';
      if (reply) {
        var text = latestText(reply.getPlainBody());
        sentiment = NEGATIVE.test(text) ? 'negative' : POSITIVE.test(text) ? 'positive' : 'neutral';
        snippet = text.replace(/\s+/g, ' ').trim().slice(0, CONFIG.snippetChars);
        bump(reply.getDate(), 'replies');
      }
      if (bounce) bump(bounce.getDate(), 'bounces');

      contacts.push({
        campaignId: camp.id,
        threadId: thread.getId(),
        email: rcpt.email,
        name: rcpt.name,
        domain: rcpt.email.split('@')[1],
        subject: first.getSubject(),
        sentAt: first.getDate().toISOString(),
        lastActivity: thread.getLastMessageDate().toISOString(),
        followUps: followUps,
        status: status,
        sentiment: reply ? sentiment : null,
        repliedAt: reply ? reply.getDate().toISOString() : null,
        replyHours: reply ? Math.round((reply.getDate() - first.getDate()) / 36e5 * 10) / 10 : null,
        replyFrom: reply ? parseAddresses(reply.getFrom())[0].email : null,
        autoReply: !!auto,
        snippet: snippet,
      });
    }
  }

  return {
    ok: true,
    mailbox: me,
    generatedAt: new Date().toISOString(),
    windowDays: CONFIG.days,
    threadsScanned: threads.length,
    truncated: threads.length >= CONFIG.maxThreads,
    campaigns: Object.keys(campaigns).map(function (k) {
      var c = campaigns[k];
      return { id: c.id, name: c.name, source: c.source, sample: c.sample, firstSent: c.firstSent && c.firstSent.toISOString(), lastSent: c.lastSent && c.lastSent.toISOString() };
    }),
    contacts: contacts,
    daily: Object.keys(daily).sort().map(function (k) { return daily[k]; }),
  };
}

// Bounces often arrive in their own thread: map failed address → date.
function collectBounces() {
  var map = {};
  var threads = GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:' + CONFIG.days + 'd', 0, 300);
  GmailApp.getMessagesForThreads(threads).forEach(function (msgs) {
    msgs.forEach(function (m) {
      var body = m.getPlainBody() || '';
      var re = /(?:Final-Recipient:\s*rfc822;\s*|wasn'?t delivered to\s+|delivery to\s+(?:the following recipient[s]?\s+)?(?:failed\s+)?(?:permanently:?\s*)?|<)([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/ig, hit;
      while ((hit = re.exec(body))) {
        var addr = hit[1].toLowerCase();
        if (!BOUNCE_FROM.test(addr) && !map[addr]) map[addr] = m.getDate();
      }
    });
  });
  return map;
}

function campaignFor(thread, subject, rcpt) {
  var labels = thread.getLabels().map(function (l) { return l.getName(); }).filter(function (n) { return n.indexOf(CONFIG.labelPrefix) === 0; });
  if (labels.length) {
    var name = labels[0].slice(CONFIG.labelPrefix.length) || labels[0];
    return { id: 'label:' + name.toLowerCase(), name: name, source: 'label' };
  }
  var s = (subject || '(no subject)').replace(/^((re|fwd?|aw|wg)\s*:\s*)+/i, '').trim();
  var first = (rcpt.name || '').split(/\s+/)[0];
  if (first && first.length > 1) s = s.replace(new RegExp('\\b' + escapeRe(first) + '\\b', 'ig'), '{name}');
  var company = (rcpt.email.split('@')[1] || '').split('.')[0];
  if (company && company.length > 2) s = s.replace(new RegExp('\\b' + escapeRe(company) + '\\b', 'ig'), '{company}');
  s = s.replace(/\s+/g, ' ');
  return { id: 'subject:' + s.toLowerCase(), name: s, source: 'subject' };
}

function isAuto(m) {
  var h = function (n) { try { return m.getHeader(n) || ''; } catch (e) { return ''; } };
  var as = h('Auto-Submitted');
  return (as && !/^no$/i.test(as)) || !!h('X-Autoreply') || !!h('X-Autorespond') || /auto_reply|bulk/i.test(h('Precedence')) || AUTO_SUBJECT.test(m.getSubject().replace(/^((re|fwd?)\s*:\s*)+/i, ''));
}

function isMine(from, mine) {
  var a = parseAddresses(from)[0];
  return !!(a && mine[a.email]);
}

function parseAddresses(str) {
  var outList = [];
  (str || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).forEach(function (part) {
    var m = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    var email = (m ? m[2] : part).trim().toLowerCase();
    if (/@/.test(email)) outList.push({ name: m ? m[1].trim() : '', email: email });
  });
  return outList;
}

// Keep only the new text of a reply: drop the quoted thread and signatures.
function latestText(body) {
  var lines = (body || '').split(/\r?\n/), keep = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^On .+wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From:\s/.test(l) || /^_{5,}/.test(l) || /^>/.test(l)) break;
    if (/^--\s*$/.test(l)) break;
    keep.push(l);
  }
  return keep.join('\n').trim();
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function min(a, b) { return !a || b < a ? b : a; }
function max(a, b) { return !a || b > a ? b : a; }
