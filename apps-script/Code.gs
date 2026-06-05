/**
 * H.E.A.L. Daily OS — Lead capture endpoint (Google Apps Script)
 * ----------------------------------------------------------------
 * Receives each login (name, email, phone) from the app and appends
 * a row to a Google Sheet. Free, no OTP. Same pattern as your
 * student-pipeline script.
 *
 * SETUP (5 minutes):
 * 1. Create a new Google Sheet. Name the first tab "Leads".
 * 2. In that Sheet: Extensions → Apps Script. Delete any sample code
 *    and paste THIS whole file in.
 * 3. Click Deploy → New deployment → type "Web app".
 *      - Description: HEAL leads
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Click Deploy, authorize when asked, and COPY the Web app URL
 *    (it ends in /exec).
 * 4. Paste that URL into App.jsx as LEAD_WEBHOOK_URL.
 *
 * To re-deploy after edits: Deploy → Manage deployments → edit (pencil)
 * → Version: New version → Deploy. (Keeps the same URL.)
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Leads") || ss.insertSheet("Leads");

    // Write a header row once
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Name", "Email", "Phone"]);
    }

    sheet.appendRow([
      data.ts || new Date().toISOString(),
      data.name || "",
      data.email || "",
      data.phone || "",
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Lets you open the /exec URL in a browser to confirm it's live.
function doGet() {
  return ContentService
    .createTextOutput("HEAL lead endpoint is live.")
    .setMimeType(ContentService.MimeType.TEXT);
}
