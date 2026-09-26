# HomeStock

Know what you have, wherever you are. HomeStock is a mobile-first shared
household inventory tracker: scan what you buy, tick off what you use, and
everyone in the home sees the same cupboard — so you stop buying a third
bottle of soy sauce.

Built with TanStack Start (React 19), Tailwind CSS v4 and Supabase
(auth, Postgres, row-level security).

---

## Features

- **Scan-first restock** — camera barcode scanner. "Restock several" keeps
  the camera running and collects scans in a basket with +/− quantities;
  unknown barcodes drop in as "needs a name" placeholders instead of
  interrupting, and must be named or removed before saving. A single scan
  answers "Do we have this?" first (totals per place, need, status).
  Manually named barcodes join a shared catalogue (first save wins; rude
  names filtered, reportable).
- **Quick stock check** — up to 8 items (most used + longest untouched);
  "Still N" or change, each fix logged as a correction event with Undo.
- **Activity events** — every consume, restock and correction is logged in
  `inventory_events`; "Use up" ranks items by recent, frequent use.
- **One-tap consume** — "Use up" flow with immediate −1 and a 5-second Undo.
  No confirmation modals.
- **Shared households** — invite by 6-character code; owners approve, reject
  or block join requests. One account can belong to several homes and switch
  between them.
- **Running low & shopping list** — per-item "minimum stock" drives a
  Running Low list, plus explicit buy requests with quantity, hint tags
  (Optional, Only if on sale, Any brand, Call if unavailable) and notes.
  Completion is manual — nothing is auto-matched.
- **Expiry tracking (optional)** — never blocks restock; quick 3/5/14-day
  buttons. Inventory surfaces "expiring soon" as its own card and filter.
  Owners can switch the expiry and location boxes off per household
  (existing values are kept and still shown).
- **Inventory views** — detailed list, compact list or cards; sort by name,
  place, expiry or last updated. Fully used-up items with no minimum are
  hidden (search still finds them).
- **Multiple locations** — the same product in the fridge and the cupboard
  are two rows that cluster together with a combined total.
- **Plan allowances** — limits live in `app_plans`, editable in the admin
  console. Shipped: free tier enforced at 2 owned homes (members/items
  effectively unlimited); paid 25 homes / 50 members, not enforced. At the
  limit users can tap "Ask for another home", which lands in the admin
  dashboard inbox.
- **Sign-in** — email link or Google; no passwords. Admins can switch
  sign-ups to invite-only and optionally require approval of new accounts.
- **Welcome flow** — 5-step tour once per account (`user_onboarding`),
  skip/resume, restart from More; one-time first-use tips per screen.
- **Scan-to-add** — scanning a product already at home offers "Add N to
  stock" (via `adjust_item_quantity`, with Undo).
- **Invite code control** — owners can close join requests (`join_open`) and
  regenerate the code (`regenerate_invite_code`); old codes stop working.
- **Telegram expiry reminders** — dedicated bot, direct Bot API. Members
  link via a one-time 15-minute deep link, pick per-home notice days
  (0/1/3/7). A daily pg_cron job (00:00 UTC) calls
  `/api/public/cron/expiry-digest`; at most one message per person/home/day.
  Admin kill switch defaults Off. `TELEGRAM_BOT_TOKEN` and
  `TELEGRAM_WEBHOOK_SECRET` live only in protected server secrets.
- **Admin console** — hidden ops route (see below) with dashboard (counters,
  home-limit requests, account applications, reported product names,
  Telegram panel, scheduler load with 20%-of-budget warnings read from
  `scheduler_runs`), account directory, complimentary/trial grants, promo
  codes, sign-up settings and invites, plan limits, category list and an
  audit log.
  Customer emails are stored only as salted HMAC fingerprints plus a masked
  display form — never in plain text.
- **Light & dark mode** — follows the device automatically.
- **Times in your timezone** — everything is stored in UTC and rendered in
  the viewer's local timezone, so daylight saving never shifts a date.

## Product lookup

Barcodes resolve in this order:

1. Your household's saved items
2. HomeStock's shared `products` cache table
3. [Open Food Facts](https://world.openfoodfacts.org) v3 API
   (`GET /api/v3/product/{barcode}`, custom `User-Agent`, read-only)

Missing products are "we haven't seen this", not an error — manual entry
(name only) always works, even fully offline from the API. Product data from
Open Food Facts is used under ODbL / CC BY-SA; HomeStock never writes to it.

## Running locally

You need Node.js 20+ (or Bun) and a Supabase project (a free one from
[supabase.com](https://supabase.com) works).

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
cp .env.example .env   # fill in your values, see below
npm run dev
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase anon/publishable key (client) |
| `VITE_SUPABASE_PROJECT_ID` | yes | Supabase project ref |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (server) | Used by server functions for admin/checked operations. Never exposed to the browser. |
| `ADMIN_EMAIL_SALT` | yes (admin console) | Random 32+ char string; salts the HMAC email fingerprints in `account_directory`. Rotating it invalidates existing fingerprints. |
| `ADMIN_CONSOLE_PATH` | no | Secret path of the ops console, served at `/ops/<path>`. Defaults to `admin/admin` → `/ops/admin/admin`. Set a long random value in production. Leading/trailing slashes are ignored. |

### Database

Apply the migrations in `supabase/migrations/` and `drizzle/migrations/` in order
(`supabase db push`, or paste them into the SQL editor). They create the
schema, row-level security policies, grants, and helper functions
(`request_household_join`, `decide_join_request`, `adjust_item_quantity`,
`redeem_promo`, `effective_tier`, …). RLS is on everywhere; membership rows
can only be created by the checked server functions, never directly.

### First admin

Sign up in the app, then visit `/ops/<your ADMIN_CONSOLE_PATH>` (or
`/ops/admin/admin` with the default) and press **Claim this console**. This
works exactly once — while no operator exists — and makes you `SUPER_ADMIN`.
After that the route answers plain "Not found" to everyone else.

## Project layout

```text
src/routes/                  TanStack Start file routes
  index.tsx                  Landing page
  about.tsx                  Product/marketing page
  auth.tsx                   Sign-in (email link + Google)
  ops.$.tsx                  Hidden admin console (ssr: false, noindex)
  _authenticated/            App screens behind the auth gate
    inventory.tsx  consume.tsx  scan.tsx  add.tsx  shopping.tsx
    more.tsx       setup.tsx    item/$itemId.tsx
src/lib/
  homestock.ts               Shared queries, household switching, date helpers
  admin.server.ts            Server-only: email HMAC/masking, console path check
  admin.functions.ts         Admin server functions (guarded by role)
src/integrations/supabase/   Generated clients + auth middleware (do not edit)
supabase/migrations/         Schema, RLS, grants, RPCs
```

Conventions worth knowing:

- **Stock changes are deltas.** `adjust_item_quantity(_delta)` applies +/− on
  the server so two people can't overwrite each other, and it rejects results
  below zero.
- **Capture first, enrich later.** Only a name is ever required; location,
  expiry, brand and minimum stock are all optional.
- **Undo instead of confirmation.** Destructive-looking actions apply
  immediately and offer a timed Undo.
- Don't edit files marked auto-generated (`routeTree.gen.ts`,
  `src/integrations/supabase/*`).

## Forking

1. Create a Supabase project, set the env vars above, push the migrations.
2. Set your own `ADMIN_CONSOLE_PATH` and `ADMIN_EMAIL_SALT` (any long random
   strings). Without them the console falls back to `/ops/admin/admin` and
   the directory sync is disabled.
3. Enable email-link auth (and optionally Google) in Supabase Auth.
4. Deploy anywhere that runs TanStack Start (this repo is deployed via
   [Lovable](https://lovable.dev), which also gives you the visual editor —
   connect the forked repo to a new Lovable project to keep that workflow).

## Attribution

- Product data: [Open Food Facts](https://world.openfoodfacts.org) — ODbL /
  CC BY-SA. Please keep the attribution on the About page if you reuse it.
- Built with [Lovable](https://lovable.dev).
