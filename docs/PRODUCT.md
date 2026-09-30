# HomeStock — Product & Technical Notes

This document describes what HomeStock does and the rules the code follows.
For setup and forking, see the [README](../README.md).

## What it is

A shared household inventory tracker. Three user types, one shared cupboard:

- **Purchaser / Restocker** — scan-first, high throughput. Scan items in,
  tap +/− per item, commit once.
- **Consumer** — quick −1 on what they just used. No barcode required.
- **Planner / Checker** — searches, checks stock before buying, sets
  minimum levels, raises buy requests.

The core loop: Restock → Shared inventory → Check → Consume →
Running low / buy request → Shop → Restock.

## Core rules the code enforces

1. **Capture first, enrich later.** Name is the only required field.
   Location, expiry, brand, photos and minimum stock are optional and never
   block saving.
2. **Undo instead of confirmation.** Consume applies instantly with a
   5-second Undo toast; there are no "are you sure?" modals for stock moves.
3. **Stock changes are atomic deltas.** All +/− go through
   `adjust_item_quantity(_delta)` on the server — concurrent edits can't
   clobber each other and stock can't go below zero.
4. **Running low means strictly below the minimum.** With current = minimum
   the item is still "in stock" (`isLow` in `src/lib/homestock.ts`:
   `quantity > 0 && quantity < min_quantity`). Zero quantity is "out of
   stock", a separate state that flags everywhere low does. The scanner,
   inventory, item detail and shopping suggestions all share this rule.
5. **Barcodes are identity, not inventory.** Open Food Facts (v3, read-only,
   custom User-Agent) supplies name/brand/image only. Quantity and expiry
   are always HomeStock's own. Lookup order: household items → shared cache
   table → OFF. A miss means "we haven't seen this", never an error, and
   manual entry always works. A manual identification of an unknown barcode
   is written to the shared cache by a server function — **first save wins**:
   the barcode is the primary key, later saves are ignored
   (`ignoreDuplicates`), never overwriting an existing record
   (`source = 'manual'`; corrections are an explicit future flow).

6. **Expiry is light-touch.** Optional, multiple per product conceptually;
   surfaced as "Exp 3 Oct" with a ⚠ within 14 days. Inventory shows
   "need attention" (low stock or expiring ≤ 3 days) and a separate
   "expiring soon" card (≤ 1 day), plus combinable Low / Expiring filters.
   Items fully consumed with no minimum set leave the everyday list (search
   still finds them), so "items tracked" counts only what's shown.
7. **Time is UTC inside, local outside.** All timestamps are stored in UTC
   (`nowUtc()`); display helpers (`formatLocalDate`, `daysUntilExpiry`)
   render in the viewer's device timezone. Daylight saving can never shift
   a stored date.
8. **Remember instead of asking again.** The active household, per-screen
   list/card view choice and similar preferences persist
   (`localStorage` keys prefixed `homestock.`).

## Households & membership

- Inventory belongs to a **household**, never a user. Users hold
  memberships with roles `owner` / `member`.
- New accounts have **no household**: after sign-in the setup screen asks
  "have an invite code, or create a new home?".
- Joining is **owner-approved**: knowing the 6-character code only sends a
  request. Owners see Approve / Reject / Block under More → Join requests.
  Blocked users are refused automatically and blocking a member also
  removes them.
- Membership rows can **only** be created by the SECURITY DEFINER functions
  `create_household` (owner row) and `decide_join_request` (approved join) —
  there is no direct INSERT policy, so self-promotion and drive-by joins are
  impossible. Role changes are owner-only.
- Accounts can belong to many homes; the app shows one at a time
  (most-recently-used first, choice remembered). Same product in two
  locations = two rows clustered together with a combined total.

## Plan allowances

`app_plans` holds one row per tier: max homes **owned**, max members per
home, max items, and an `enforced` flag. Current values: free = 2 homes
(members/items effectively unlimited), `enforced = true`; paid = 25 / 50 /
100000, `enforced = false`. All editable in the admin console Plans tab.

- `create_household` checks the allowance on the server; the greyed button
  isn't the only barrier.
- At the limit the app offers "Ask for another home" → one `limit_requests`
  row per user, shown in the admin dashboard and deleted on dismiss.
- Existing owners keep every home they already have; limits only block new
  creations. Item limits hide (never delete) the newest rows beyond the cap.

## Admin console

Hidden route: `/ops/<ADMIN_CONSOLE_PATH>` (default `admin/admin`). Not in
the sitemap, `noindex`, not linked anywhere, `ssr: false`, and the path is
compared in constant time server-side. Wrong paths render an identical
"Not found".

- **Bootstrap**: while `admin_users` is empty, the first signed-in visitor
  can **Claim this console** (becomes `SUPER_ADMIN`). Afterwards the claim
  path is dead.
- **Two-factor (mandatory)**: an operator session must be TOTP-verified
  (`aal2`) before any console data loads. First visit shows an enrolment QR
  code for any authenticator app; later visits ask for the six-digit code.
  Every admin server function re-checks `aal2`, so the gate cannot be
  bypassed from the browser. Enrolment hands over ten one-time recovery
  codes (salted hashes in `admin_recovery_codes`, plain text shown once); a
  recovery code only removes the lost authenticator so a new one can be set
  up — it never grants access on its own. Fresh sets can be issued from the
  console header.

- **Roles**: `SUPER_ADMIN`, `BILLING_ADMIN`, `SUPPORT_ADMIN`,
  `READ_ONLY_ADMIN`, checked server-side per action (e.g. permanent grants
  need SUPER_ADMIN; revoking needs SUPER_ADMIN or BILLING_ADMIN).
- **Privacy**: customer emails are never stored in app tables. The account
  directory keeps `email_hash = HMAC_SHA256(email, ADMIN_EMAIL_SALT)` for
  exact-address search and `email_masked` like `er…ng@gmail.com` for display.
- **Capabilities**: dashboard counters (accounts, homes, grants, promos,
  items tracked, stock changes and count fixes in the last 7 days), inbox for
  home-limit requests, account applications and reported product names
  (Keep / Remove / Remove & ban); searchable account list; account detail
  (tier, sign-in methods read live, grants, homes); grants with mandatory
  reason and revocation; promo codes; sign-up switch (open / invite-only),
  one-time invite links and the "approve new accounts" switch (default off);
  plan limits and enforcement; the category/place list; and an append-only
  audit log of every operator action. No account deletion yet.
- **Promo redemption** lives in the app under More → "Have a code?" and goes
  through the `redeem_promo` RPC (validates status, window, caps and
  per-account limits).

## Screens (MVP)

Landing (`/`) · About (`/about`) · Sign-in (`/auth`: email link or
Google) · Welcome tour (`/welcome`) · Setup / create-or-join (`/setup`) ·
Inventory · Quick stock check (`/reconcile`) · Use up (`/consume`) · Scan
(single "Do we have this?" with "Add N to stock", or "Restock several"
basket) · Add item · Item detail (incl. "Correct the count") · Shopping
(Running low + buy requests) · More (household switching, members, join
requests, open/closed join switch, "New code", optional-details switches,
Telegram reminders, restart welcome, promo code, account).

## Newer features

- **Welcome flow** — shown once per account, resumable, skippable; existing
  accounts were marked completed. First-use tips never show during the tour.
- **Invite code control** — closing join requests rejects new applications;
  regenerating the code invalidates the old one. Existing members stay.
- **Telegram expiry reminders** — opt-in per person per home, one daily
  digest, admin kill switch (default Off). Runs on the database scheduler,
  not a paid job service; every run logs to `scheduler_runs`, which feeds the
  admin Scheduler load panel (default budget 1,000 queries/day, warning at
  20%). One Telegram chat can be linked to many accounts; each account links
  independently and `/stop` disconnects all accounts on that chat.
- **Telegram admin sign-up alerts** — two independent toggles: "waiting for
  approval" fires when a newcomer lands on the approval holding screen,
  "first time in" fires once when an approved user first enters the app
  (tracked via `account_approvals.first_entered_at`). Destinations live in
  `telegram_admin_links`, separate from user reminder links; operators can
  stop their own alerts from the console. Messages contain only a masked
  email and UTC time — never the admin console link.

## Known intentional choices

- No activity-history screen; events are used for undo, ranking and admin counts.
- No automatic matching of buy requests to products — completion is manual.
- No household deletion UI.
- Sign-in is by email link or Google only — no passwords and no 6-digit code.
- Abuse limits: 10 wrong invite codes per hour, 5 wrong promo codes per 15 minutes, 5 wrong admin recovery codes per 15 minutes, 30 product lookups per minute per person. Text caps: item/shopping names 200, notes 1,000, places 100, home names 80, people names 60; photo links must be https.
- Expiry dates are typed as DD/MM/YYYY (or picked from a calendar); impossible dates are refused, never auto-corrected.
- The scanner reads sideways/upside-down barcodes (EAN, UPC, Code 128, QR) using the rear camera.
- Telegram admin alerts never include the admin console URL — the hidden route must not leak into chat histories.
- Six security-linter EXECUTE warnings on SECURITY DEFINER helper functions
  are expected: they must be callable by signed-in users and each verifies
  its caller internally.
