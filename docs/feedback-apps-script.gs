/**
 * Hoomanely stand-up prototype: feedback to Google Sheet.
 *
 * Paste this into Extensions → Apps Script of the Google Sheet that should
 * collect feedback, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). Copy the web app URL into the
 * repo's NEXT_PUBLIC_FEEDBACK_URL (GitHub → Settings → Secrets and variables →
 * Actions → Variables). Full steps: docs/feedback-sheet.md.
 *
 * Only what the form sends is stored: no IP address, no email, no device info.
 */
const HEADERS = ["Received", "About", "Feedback", "How useful", "Name (optional)"];

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  let data = {};
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    data = { feedback: String((e && e.postData && e.postData.contents) || "") };
  }
  const clip = (v, n) => String(v || "").slice(0, n);
  sheet.appendRow([new Date(), clip(data.kind, 80), clip(data.feedback, 5000), clip(data.usefulness, 40), clip(data.name, 60)]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
