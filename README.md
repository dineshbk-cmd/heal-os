# H.E.A.L. Daily OS — Deploy Guide

A six-tool React app (Reframe, State-Shift, Tracker, Offer, Life Wheel,
Mindset Baseline) for Harmonic Hustlers Hub. Five tabs use Claude AI via a
secure serverless function; the Mindset Baseline works with no AI.

Two themes are built in: **Professional** (deep green + gold, for HNWI /
mid-career funnels) and **Student** (warm cream + coral, for the college
funnel). A toggle in the header switches them and the choice is remembered.

---

## What you need
- A free GitHub account
- A free Netlify account
- An Anthropic API key with a little credit (console.anthropic.com → API Keys).
  This is paid and separate from your Claude.ai subscription. Each tool use
  costs a fraction of a cent.
- (Optional but recommended) A Google Sheet for lead capture.

---

## Step 1 — Lead capture (Google Sheet) — optional, ~5 min
1. Create a Google Sheet, name the first tab `Leads`.
2. Extensions → Apps Script. Paste in `apps-script/Code.gs` (in this project).
3. Deploy → New deployment → **Web app**, Execute as **Me**, Access **Anyone**.
   Authorize, then copy the Web app URL (ends in `/exec`).
4. Open `src/App.jsx`, find `const LEAD_WEBHOOK_URL = "";` near the top, and
   paste your URL between the quotes.
   (Leave it blank to skip lead capture — logins will still work.)

## Step 2 — Push to GitHub
```bash
cd heal-os
git init
git add .
git commit -m "HEAL Daily OS"
# create an empty repo on github.com, then:
git remote add origin https://github.com/YOURNAME/heal-os.git
git push -u origin main
```

## Step 3 — Deploy on Netlify
1. netlify.com → Add new site → Import an existing project → pick your repo.
2. Netlify auto-detects the build (`npm run build`, publish `dist`). Click Deploy.
3. After the first build: Site configuration → Environment variables → Add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your Anthropic key
4. Deploys → Trigger deploy → Deploy site (so the key is picked up).
5. You now have a live URL like `https://heal-os.netlify.app`. The AI tabs work.
   Your API key lives only on Netlify's servers — never in the browser.

## Step 4 — Front door on systeme.io (free, no domain needed)
1. systeme.io → free account → Funnels (or Website) → new page.
2. Build your landing page: headline, the tab previews, a testimonial,
   and an email opt-in form (systeme.io drops it into your contact list).
3. Add a button → link it to your Netlify URL (`https://heal-os.netlify.app`).
   Set it to open in a new tab.
4. Publish on your free `yourname.systeme.io` subdomain.

Result: systeme.io captures the email + runs follow-up automations; the
button sends people to the live app; the app's login confirms phone and
unlocks the tools.

---

## Local development
```bash
npm install
npm run dev      # http://localhost:5173
```
Note: the AI tabs need the function, which only runs on Netlify. To test
functions locally, install the Netlify CLI and run `netlify dev` instead.

## Going public checklist
- [ ] `ANTHROPIC_API_KEY` set in Netlify env vars
- [ ] `LEAD_WEBHOOK_URL` pasted into App.jsx (if using lead capture)
- [ ] Apps Script deployed as a Web app (Access: Anyone)
- [ ] systeme.io button points to the Netlify URL

## Files
- `src/App.jsx` — the whole app (all six tools, login, themes)
- `netlify/functions/claude.js` — secure API relay
- `netlify.toml` — routes `/api/claude` to the function
- `apps-script/Code.gs` — Google Sheet lead endpoint

---

## Also in this repo: Stock Room (inventory)
The `inventory/` folder holds a separate app for Empire Biz Corp stock: invoice PDF import, roles, and change history. It deploys as its own Netlify site with **Base directory = `inventory`**. See [`inventory/README.md`](inventory/README.md).
