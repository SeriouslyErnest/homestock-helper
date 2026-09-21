# HomeStock

Know what you have, wherever you are. HomeStock is a mobile-first shared
household inventory tracker: scan what you buy, tick off what you use, and
everyone in the home sees the same cupboard — so you stop buying a third
bottle of soy sauce.

Built with TanStack Start (React 19), Tailwind CSS v4 and Supabase
(auth, Postgres, row-level security).

---

## Features

- **Scan-first restock** — camera barcode scanner with a large basket and
  one-tap +/− quantities. Unknown barcodes fall back to quick manual entry;
  a barcode you save is remembered forever.
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
- **Multiple locations** — the same product in the fridge and the cupboard
  are two rows that cluster together with a combined total.
- **Plan allowances (enforcement off by default)** — free tier: 1 owned home,
  4 members; paid tier: 25 / 50. Flipping `app_plans.enforced` turns the
  limits on; the UI greys out accordingly. Ready for a future billing module.
- **Admin console** — hidden ops route (see below) with account directory,
  complimentary/trial grants, promo codes, plan switches and an audit log.
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

Apply the migrations in `supabase/migrations/` in order
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
