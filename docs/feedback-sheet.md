# Feedback → Google Sheet (≈5 minutes)

The Feedback page sends each note to a Google Sheet you own. You can open it any time or download it as Excel (File → Download → Microsoft Excel).

1. Create a new Google Sheet, e.g. "Stand-up prototype feedback".
2. In the sheet: **Extensions → Apps Script**. Delete the sample code and paste in everything from `docs/feedback-apps-script.gs`. Save.
3. **Deploy → New deployment →** gear icon **→ Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, approve the permissions, then copy the **Web app URL** (ends in `/exec`).
4. Give the site that URL:
   - **GitHub Pages:** repo **Settings → Secrets and variables → Actions → Variables → New repository variable**, name `NEXT_PUBLIC_FEEDBACK_URL`, value = the URL. Then re-run the "Deploy to GitHub Pages" workflow.
   - **Local:** add `NEXT_PUBLIC_FEEDBACK_URL=<url>` to `.env.local` and restart `npm run dev`.
5. Test: send a note from the Feedback page. A new row appears in the sheet.

What's stored: time received, what it's about, the text, the optional usefulness rating, and a name only if the person typed one. No email, IP or device details.

If you change the script later, use **Deploy → Manage deployments → Edit → New version** so the same URL keeps working.
