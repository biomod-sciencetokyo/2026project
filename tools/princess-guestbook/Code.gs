/**
 * @OnlyCurrentDoc
 * ↑ limits this script's permission to this one spreadsheet (not all of your Google Sheets)
 *
 * miRNA Princess guestbook — Google Apps Script backend for princess.html
 *
 * The secret page posts { nickname, hearts } once per visit and reads the list back.
 * Each visit is one row in the sheet:  A: time | B: nickname | C: hearts | D: hide
 * To hide an entry (e.g. an inappropriate nickname), type anything in column D,
 * or simply delete the row.
 *
 * Setup steps: see README.md in this folder.
 */

const SHEET_NAME = 'guestbook';
const MAX_NICKNAME = 20;      // characters
const MAX_HEARTS = 9999;      // per visit
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Read the list (oldest → newest, at most LIST_LIMIT of the latest visible rows)
function doGet() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return json_({ ok: true, entries: [] });

  const rows = sheet.getRange(2, 1, last - 1, 4).getValues();
  const entries = rows
    .filter(r => r[0] && !String(r[3]).trim())
    .map(r => ({
      time: new Date(r[0]).toISOString(),
      nickname: String(r[1]).slice(0, MAX_NICKNAME) || ANONYMOUS,
      hearts: Number(r[2]) || 0
    }))
    .slice(-LIST_LIMIT);
  return json_({ ok: true, entries });
}

// Add one visit
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }

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
