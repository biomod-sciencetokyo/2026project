/**
 * @OnlyCurrentDoc
 * ↑ limits this script's permission to this one spreadsheet (not all of your Google Sheets)
 *
 * miRNA Princess guestbook — Google Apps Script backend for princess.html
 *
 * 1) Guestbook: the secret page posts { nickname, hearts } once per visit and reads the list back.
 *    Each visit is one row in the "guestbook" tab:  A: time | B: nickname | C: hearts | D: hide
 *    To hide an entry (e.g. an inappropriate nickname), type anything in column D,
 *    or simply delete the row.
 * 2) Everyone's total taps: the page sends { type: 'taps', count } in small batches.
 *    The running total lives in cell B1 of the "stats" tab (you can see or correct it there).
 *
 * Setup steps: see README.md in this folder.
 */

const SHEET_NAME = 'guestbook';
const STATS_SHEET = 'stats';
const MAX_NICKNAME = 20;      // characters
const MAX_HEARTS = 9999;      // per visit
const MAX_TAPS_PER_POST = 300; // per batch of taps
const LIST_LIMIT = 100;       // newest N entries returned to the page
const ANONYMOUS = 'Anonymous';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['time', 'nickname', 'hearts', 'hide']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// "stats" tab: A1 label, B1 = everyone's total taps
function getTotalCell_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STATS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(STATS_SHEET);
    sheet.getRange('A1:B1').setValues([['total taps (everyone)', 0]]);
  }
  return sheet.getRange('B1');
}

function getTotal_() {
  return Math.max(0, Math.floor(Number(getTotalCell_().getValue()) || 0));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Read the list (oldest → newest, at most LIST_LIMIT of the latest visible rows) and the total
function doGet() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 4).getValues();
  const entries = rows
    .filter(r => r[0] && !String(r[3]).trim())
    .map(r => ({
      time: new Date(r[0]).toISOString(),
      nickname: String(r[1]).slice(0, MAX_NICKNAME) || ANONYMOUS,
      hearts: Number(r[2]) || 0
    }))
    .slice(-LIST_LIMIT);
  return json_({ ok: true, entries, total: getTotal_() });
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  return body.type === 'taps' ? addTaps_(body) : addEntry_(body);
}

// Add a batch of taps to everyone's total
function addTaps_(body) {
  const count = Math.floor(Number(body.count));
  if (!(count >= 1 && count <= MAX_TAPS_PER_POST)) {
    return json_({ ok: false, error: 'bad count' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cell = getTotalCell_();
    const total = getTotal_() + count;
    cell.setValue(total);
    return json_({ ok: true, total });
  } finally {
    lock.releaseLock();
  }
}

// Add one guestbook visit
function addEntry_(body) {
  // Strip control characters, collapse spaces, cap length
  const nickname = String(body.nickname || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICKNAME) || ANONYMOUS;
  const hearts = Math.floor(Number(body.hearts));
  if (!(hearts >= 1 && hearts <= MAX_HEARTS)) {
    return json_({ ok: false, error: 'bad hearts' });
  }

  // A value starting with = + - @ would be run as a formula in the sheet; prefix it with '
  const safeNickname = /^[=+\-@]/.test(nickname) ? `'${nickname}` : nickname;

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    getSheet_().appendRow([new Date(), safeNickname, hearts, '']);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
