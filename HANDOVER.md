# Guya Platform — Handover for the developer

Guya Special Need Therapy Center, **Bethel Branch**. The owners are Amman Esrael and Sara Alemayehu (partners).
This package has the full app agreed in **clickable demo v2**, the Supabase database, the login functions, and a free nightly backup.
It is set up to run on **free plans** (Supabase Free + Cloudflare Pages + GitHub).

---

## 1. What is finished and what is left

| Part | Status |
|---|---|
| All screens, flows and business rules (`app/`) | ✅ Done and tested (English + Amharic, desktop + phone) |
| Database schema, security rules, triggers (`supabase/migrations/`) | ✅ Done and tested against Postgres |
| Login creation / turning logins off (`supabase/functions/`) | ✅ Written, needs deploying |
| Nightly backup + keep-alive (`.github/workflows/`) | ✅ Written, needs secrets |
| **Connect the app to Supabase** | ✅ Implemented in `app/src/lib/data.ts` and `app/src/store.tsx`; configure project credentials and complete live acceptance checks before go-live. |
| Offline mode | ⏳ Later phase (section 7) |

**Estimate:** connecting the data layer takes about 3–5 working days for someone who knows React and Supabase, including testing.

---

## 2. What is in the package

```
guya-platform/
├─ HANDOVER.md                ← this file
├─ app/                       ← the web app (Vite + React 19 + TypeScript + Tailwind v4)
│  ├─ src/
│  │  ├─ store.tsx            ← DATA LAYER (demo: localStorage) + billing rules ← replace storage here
│  │  ├─ lib/supabase.ts      ← ready-made Supabase client, sign-in, logins, screenshot upload
│  │  ├─ lib/ethio.ts         ← Ethiopian ⇄ Gregorian calendar (tested 2000–2035)
│  │  ├─ lib/format.ts        ← dates, months, money (billing months = Ethiopian months)
│  │  ├─ lib/billing.ts       ← due dates, late status
│  │  ├─ lib/am.ts            ← Amharic translations (≈780 phrases, English text is the key)
│  │  ├─ lib/tr.ts            ← tx() translator
│  │  ├─ report.ts, xlsx.ts   ← reports, branded Excel export (exceljs)
│  │  └─ pages/*.tsx          ← Dashboard, Leads, Children, Payment, Receipt, Reminders, Expenses, Reports, Settings
│  ├─ public/                 ← logo.png, icon.png
│  └─ .env.example
├─ supabase/
│  ├─ migrations/0001_init.sql   ← base schema, RLS, triggers
│  ├─ migrations/0002_v2.sql     ← v2 changes (run after 0001)
│  └─ functions/create-login, set-login-active   ← Edge Functions
└─ .github/workflows/nightly-backup.yml
```

Run the app locally: `cd app && npm install && npm run dev`. Demo logins appear on the sign-in screen (amman / sara / mekdes).

---

## 3. Set up the services (all free plans, all in Guya's name)

### 3.1 Supabase
1. Create a project at https://supabase.com. Pick the region closest to Addis Ababa (EU or Middle East).
2. **SQL Editor** → run `supabase/migrations/0001_init.sql`, then `0002_v2.sql`.
3. **Authentication → Providers → Email:** keep Email on, turn **off** "Confirm email", and turn **off** "Allow new users to sign up". Only partners create logins, through the Edge Function.
4. Create the **first partner (Amman)**: Authentication → Users → Add user → email `amman@guya.local`, a strong password, "Auto confirm". The first account automatically becomes a partner (see `handle_new_user`). Then in Table Editor → `profiles`, set `username = amman`. Create **Sara** the same way through the app once it's connected, or add her in the dashboard with `app_metadata = {"role":"partner"}`.
5. Deploy the Edge Functions with the Supabase CLI:
   ```bash
   supabase login && supabase link --project-ref YOUR-REF
   supabase functions deploy create-login
   supabase functions deploy set-login-active
   ```
6. Enter the real data in the app's **Settings**: prices, therapists, fee due day (5th of the Ethiopian month by default), and upfront discounts (3 months −5%, 6 months −10%).

### 3.2 Cloudflare Pages (hosting, free and commercial use allowed)
1. Push this folder to a **private GitHub repo** owned by Guya.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: **Root directory** `app` · **Build command** `npm run build` · **Output** `dist`.
4. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API). For local development, create `app/.env.local` from `app/.env.example`. Never use the service-role key in the browser.
5. The site goes live at `https://<name>.pages.dev`. A custom domain can be added later.

### 3.3 GitHub nightly backup
The Supabase free plan has **no automatic backups**, and free projects **pause after 7 days without activity**. The workflow handles both.
Add repo secrets `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (see the comments in the workflow file). Then run it once by hand: Actions → Nightly backup → Run workflow.
Each night it saves the database dump and all payment screenshots as a download kept for 90 days. **Test a restore once** (`pg_restore` into a scratch database) before going live.

---

## 4. Supabase integration status and setup

The UI still uses the shared in-memory `DB` shape through `useStore()`, but authentication and persistence now use Supabase. Sign-in is backed by Supabase Auth; the store loads authorized tables after sign-in, persists mutations, refreshes after writes, and reloads on window focus. Login creation/activation, lead call logs, payment numbering, and private screenshots use the existing Edge Functions, RPCs, and Storage bucket.

1. Apply `supabase/migrations/0001_init.sql` and `0002_v2.sql` to the project, and deploy `create-login` and `set-login-active`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `app/.env.local` for local work, or in the hosting provider's environment settings. The browser only needs the public anon key; never put the service-role key in Vite environment variables.
3. Use a configured partner account to sign in and complete the live acceptance checks below. This workspace has not yet been connected to a specific Supabase project, so database deployment and live authorization/storage tests remain outstanding.

| Demo (`DB` key) | Supabase table | Notes |
|---|---|---|
| `settings` | `settings` (single row id=1) | `upfront`, `calendar` columns added in 0002 |
| `services` | `services` | `billing`: monthly / per_session / per_hour / one_time |
| `therapists` | `therapists` | |
| `profiles` | `profiles` | **No passwords in this table.** Create logins with `createLogin()` (Edge Function), turn them on/off with `setLoginActive()` |
| `leads` | `leads` | `service_ids uuid[]`. Log calls with the RPC **`log_lead_call`** (same rules as `logLeadCall()` in store.tsx) |
| `leadCalls` | `lead_calls` | written by the RPC |
| `children` | `children` | `service_ids`, `service_qty jsonb`, `first_month_fee`. Only partners may change fees (DB trigger) |
| `payments` | `payments` | **Insert-only, void-only** (DB trigger). Upfront: one row per month, same `code` (from RPC `next_payment_code()`) and same `bundle_id`. Screenshot: `uploadScreenshot()` → save the path in `screenshot_path`; show it with `screenshotUrl()` |
| `expenses` | `expenses` | partners only (RLS) |
| `reminders` | `reminder_log` | |
| `activity` | `activity_log` | `summary` = English template, `vars` = values. Payments, children, leads and expenses are also logged by DB triggers |
| `seq` | DB sequences | codes `L-001`, `GU-001`, `P-0001` are generated by the database. Drop `nextCode()` |

4. **Keep these as they are.** They are the agreed business rules: `expectedFor()`, `balances()`, `proRate()`, `isMonthly()`, `serviceMonthly()`, `planTotal()` in `store.tsx`, and everything in `lib/format.ts`, `lib/ethio.ts` and `lib/billing.ts`.
5. **Staff must never see money totals, expenses, profit or settings.** The UI already hides them, and RLS blocks `expenses` and `activity_log`. Staff can read individual payments, since they record them.
6. **Passwords are fixed** (owners' decision). The app has no "change password" screen. If one is ever needed, a partner turns the login off and creates a new one.

### Acceptance checks before go-live
- [ ] A staff login cannot open Expenses or Settings, and sees no profit or collected totals anywhere (including Excel and report messages).
- [ ] Staff cannot change a fee or edit a payment, only record one. A partner can void, with a reason.
- [ ] A 6-month upfront payment of ABA (9,000) = **48,600**, and the 6 months show as paid.
- [ ] A child starting on Hidar 8 is charged 23/30 of the monthly fee for Hidar, then the full fee from Tahsas.
- [ ] Everything works in Amharic (switch in the menu). No English is left except typed data and brand names.
- [ ] The nightly backup ran, and a restore was tested.

---

## 5. Key decisions (don't change without the owners)
- **Ethiopian calendar** everywhere. Fees are billed per Ethiopian month, due on day 5. **Pagume belongs to Nehase** (12 bills a year). Dates are stored as normal ISO (Gregorian) dates and only *shown* in Ethiopian. `period_month` is the Gregorian date of the 1st of the Ethiopian month.
- First month after a mid-month start: pro-rated by default; partners can pick full, free or a custom amount.
- Upfront discounts apply on top of the child's (possibly discounted) monthly fee.
- Payment screenshots are required for Telebirr, CBE and bank payments, and optional for cash.
- Leads follow a call plan (default days 0, 1, 3, 7, 14). After the last unanswered call, the lead closes as "No response".

## 6. Limits of the free plans
- Supabase Free: 500 MB database, 1 GB file storage (screenshots are compressed to about 100 KB each), no paid support. Upgrading to Pro later is one click and needs no code change.
- Cloudflare Pages Free: unlimited bandwidth, 500 builds a month.

## 7. Next phase (not in this package)
- **Offline mode:** installable PWA with a local copy of the data and a queue of changes waiting to upload. Receipts made offline get temporary numbers.
- Automatic Telegram summaries to partners (a Supabase cron job calling an Edge Function).
- Attendance tracking for per-session and per-hour billing.
