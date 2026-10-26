# Stock Room — inventory for Empire Biz Corp stock

A web app (it works on phones and desktops) for tracking the stock you buy from **EBC Empire Bizcorp Pvt Ltd**, plus any other supplier.

- **Drop in the supplier's tax-invoice PDF.** Every line is read (SKU, name, pack, qty, price, GST) and checked against the invoice totals. New products are created with the **product photo taken from the invoice**, and stock goes up. Importing the same invoice twice is blocked.
- **People sign in with their mobile number or email.** Both are collected at sign-up, and either one can be used to reset a forgotten password.
- **Roles and permissions.** The defaults are Admin, Manager, Staff and Viewer. You can add your own roles and tick or untick each permission (view, edit, receive, sell, adjust, see costs, see history, manage people).
- **Full change history.** Every edit records who made it, when, and the old and new value. Stock is never overwritten: every change is an entry in a ledger, so any number can be explained. Mistakes are fixed with **Undo** or **Void**, and the original entry stays visible.
- **Day-to-day maintenance.** You can record sales, returns, damage, expiry and samples, do stock counts (type what's on the shelf and the system books the difference), get low-stock alerts, and bulk-update prices or categories from Excel. Products, movements and the audit log can all be exported to CSV.

It runs in **demo mode** (data saved in your browser only) until you connect a free Supabase database. Demo mode lets you try everything first. It has a ready-made login for each role, all with the password `demo1234`.

---

## Setup (about 20 minutes, all free tiers)

### 1. Database: Supabase
1. Create a project at [supabase.com](https://supabase.com). Pick the **Mumbai (ap-south-1)** region.
2. Go to **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
   It creates the tables, security rules, audit triggers, default roles, the two storage buckets, and the Empire Biz Corp supplier. You can run it again safely after updates.
3. Go to **Authentication → URL Configuration** and set **Site URL** to your Netlify URL from step 2 (for example `https://stockroom-xyz.netlify.app`). Password-reset links return there.
4. Optional: under **Authentication → Providers → Email**, you can turn off *Confirm email* so new staff can sign in right away. Their account still needs admin approval either way.
5. Go to **Project Settings → API** and copy the **Project URL**, the **anon public** key and the **service_role** key.

### 2. Hosting: Netlify
1. Netlify → **Add new site → Import from GitHub** → pick this repo.
2. Set **Base directory** to `inventory`. The build command (`npm run build`) and publish directory (`dist`) are read from `inventory/netlify.toml`.
3. Under **Site configuration → Environment variables**, add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key. It stays on the server and is used only to look up the email that belongs to a mobile number. |

4. Deploy. **The first person to create an account becomes Admin.** Do that yourself straight away.

### 3. Bring your team in
- Share the link. When people sign up (name, email, mobile, password), they wait as **Pending** until you open **Team & roles** and pick a role for them.
- To skip the wait, use **Pre-approve someone** with their email or mobile. They get that role the moment they sign up.

### 4. Load your stock
1. **Receive / Import → Supplier invoice (PDF)**: drop in each Empire Biz Corp invoice you still have stock from.
2. If you already had stock before your first invoice, use **Stock out → Opening stock**, or add an `opening_stock` column in the product-list spreadsheet.
3. Do a **Stock count** to make the numbers match the shelf.
4. Set selling prices and reorder levels: **Receive / Import → Product list → Current list**, fill in the columns in Excel, then drop the file back in.

---

## How it works

| Screen | What it's for | Who sees it (by default) |
|---|---|---|
| Dashboard | Totals, stock value, low stock, recent activity | everyone |
| Stock | Search, filter, product details, photo, movements, change history | everyone |
| Receive / Import | Invoice PDF, Excel/CSV or manual purchase; bulk product update | Admin, Manager, Staff (Staff can't create new products) |
| Stock out | Sale, customer return, sample, damage, expired, return to supplier, ± adjustment, opening stock | Staff: sales, returns, samples · Manager/Admin: everything |
| Stock count | Physical count; differences are booked automatically | Admin, Manager |
| Purchases | Every invoice with its lines; open the original PDF; void | Admin, Manager |
| History | Stock ledger (with Undo) and the full audit log, both exportable | everyone sees the ledger; audit log for Admin, Manager |
| Team & roles | Approve people, roles, permission grid, settings | Admin |

**Data model.** On-hand stock = the sum of `stock_movements` for a product. Purchases, sales, counts, undos and voids all add rows; nothing is edited in place. Every table has an audit trigger that writes to `audit_log`. All permission checks run **inside the database** (Row Level Security plus checked functions), so they hold even if someone calls the API directly.

**Invoice parser.** [`src/lib/invoiceParser.js`](src/lib/invoiceParser.js). To check a new invoice layout from the command line:
```bash
cd inventory && npm install
npm run parse-invoice -- path/to/invoice.pdf
```
On the sample invoice INV145 it reads all 98 lines, and the item totals match the invoice sub total (₹1,46,784.50) and the CGST + SGST.

## Local development
```bash
cd inventory
npm install
npm run dev          # demo mode at http://localhost:5173
cp .env.example .env # add Supabase keys to use the live database
```
Mobile-number sign-in uses the Netlify function, so test it with `netlify dev`. Email sign-in works with plain `npm run dev`.

### Testing the database rules
`supabase/test/` runs the schema on a plain local Postgres with a small stand-in for Supabase's `auth` and `storage` schemas, then exercises the roles and permissions, duplicate-invoice blocking, negative-stock blocking, undo, void, counts and the audit log:
```bash
psql -f supabase/test/stub.sql            # creates database "inv"
psql -d inv -f supabase/schema.sql
psql -d inv -f supabase/test/grants.sql
psql -d inv -f supabase/test/smoke.sql
```

---

## Suggestions (next steps, roughly by value)

1. **Batch and expiry tracking.** Ayurvedic syrups, juices and tablets expire. The EBC invoice doesn't print batch numbers or expiry dates, but you could type them in when receiving, get "expiring in 60 days" alerts, and sell oldest-first.
2. **Barcode scanning with the phone camera** for sales and counts. The search box already matches a `barcode` field, so you'd only need to scan each product once to set it up.
3. **Customer bills.** Print or WhatsApp a bill when recording a sale, and keep a customer list with their purchase history.
4. **Reports.** Sales by product and month, fast and slow movers, margin (selling price minus purchase price), and a monthly stock valuation for your accountant.
5. **Reorder list for EBC.** Turn low stock into a ready-to-send order list (CSV or WhatsApp text) with suggested quantities based on the last 30 days of sales.
6. **Notifications.** A daily WhatsApp or email summary of low stock and of anything voided or adjusted.
7. **Hide costs from Staff completely.** Today the UI hides purchase price from roles without *See purchase invoices*. A database view could also hide that column at the API level.
8. **OTP sign-in by SMS.** Supabase supports it once you connect an SMS provider (MSG91 or Twilio, both paid per SMS). Until then, mobile-number sign-in uses the password, and recovery goes to the registered email.
9. **More than one shop or godown.** Add a `location` to movements and a transfer screen.
10. **Backups.** Supabase's free tier keeps daily backups for a limited time. A weekly CSV export (Stock → Export, History → Export) is a simple extra safety net.

## Questions for you

1. **What price is on the invoice?** The ₹ "Price" column includes GST (qty × price = line total including GST). Is that your **cost** as an EBC distributor, or the **MRP** you sell at? The app currently stores it as the purchase price and leaves the selling price for you to fill in.
2. **What about the ₹100 "Product Book"?** It's recorded under other charges and isn't added to stock. Should it be tracked as an item?
3. **Who will use the app, and in which roles?** For example: you as Admin, one manager, two counter staff. Should Staff be allowed to receive invoices, or only to sell?
4. **One place or several?** One shop, or a shop plus a godown, or several distributors under you?
5. **Do you sell to customers, or to downline members?** If you sell to members (the invoice shows an EBC User ID), do you want to track sales per member ID?
6. **Do you need GST output?** Do you need GST sales invoices or GSTR reports from this app, or is the stock count enough?
7. **Batch and expiry dates:** do you want to track them (suggestion 1)?
8. **SMS OTP:** is it worth the SMS cost, or are password sign-in and email recovery enough?
9. **Other suppliers:** will you import invoices from suppliers other than EBC? Other PDF layouts can be supported, or brought in with the Excel template.
