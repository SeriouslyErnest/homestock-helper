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
4. **Barcodes are identity, not inventory.** Open Food Facts (v3, read-only,
   custom User-Agent) supplies name/brand/image only. Quantity and expiry
   are always HomeStock's own. Lookup order: household items → shared cache
   table → OFF. A miss means "we haven't seen this", never an error, and
   manual entry always works.
5. **Expiry is light-touch.** Optional, multiple per product conceptually;
   surfaced as "Exp 3 Oct" with a ⚠ within 14 days. Inventory shows
   "need attention" (low stock or expiring ≤ 3 days) and a separate
   "expiring soon" card (≤ 1 day), plus combinable Low / Expiring filters.
   Items fully consumed with no minimum set leave the everyday list (search
   still finds them), so "items tracked" counts only what's shown.
6. **Time is UTC inside, local outside.** All timestamps are stored in UTC
   (`nowUtc()`); display helpers (`formatLocalDate`, `daysUntilExpiry`)
   render in the viewer's device timezone. Daylight saving can never shift
   a stored date.
7. **Remember instead of asking again.** The active household, per-screen
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

## Plan allowances (monetisation hooks, off by default)

`app_plans` holds one row per tier: max homes **owned**, max members per
home, and an `enforced` flag. Shipped values: free = 1 home / 4 members,
paid = 25 / 50, both `enforced = false`.

- With enforcement off nothing is limited and the UI looks exactly as if no
  plan system existed.
- Flipping `enforced` on the free row greys out "create a new home" after
  the first one (with a notice to ask an owner for their code), caps
  approvals at the member limit, and shows "3 of 4" counts.
- The checks run on the server, so the greyed button isn't the only barrier.
- Existing owners keep every home they already have; limits only block new
  creations.

## Admin console

Hidden route: `/ops/<ADMIN_CONSOLE_PATH>` (default `admin/admin`). Not in
the sitemap, `noindex`, not linked anywhere, `ssr: false`, and the path is
compared in constant time server-side. Wrong paths render an identical
"Not found".

- **Bootstrap**: while `admin_users` is empty, the first signed-in visitor
  can **Claim this console** (becomes `SUPER_ADMIN`). Afterwards the claim
  path is dead.
- **Roles**: `SUPER_ADMIN`, `BILLING_ADMIN`, `SUPPORT_ADMIN`,
  `READ_ONLY_ADMIN`, checked server-side per action (e.g. permanent grants
  need SUPER_ADMIN; revoking needs SUPER_ADMIN or BILLING_ADMIN).
- **Privacy**: customer emails are never stored in app tables. The account
  directory keeps `email_hash = HMAC_SHA256(email, ADMIN_EMAIL_SALT)` for
  exact-address search and `email_masked` like `er…ng@gmail.com` for display.
- **Capabilities**: dashboard counters, searchable account list, account
  detail (tier, grants, homes), complimentary/trial grants with mandatory
  reason, grant revocation, promo codes (create / pause / expire, redemption
  counts), plan enforcement switches, and an append-only audit log of every
  operator action.
- **Promo redemption** lives in the app under More → "Have a code?" and goes
  through the `redeem_promo` RPC (validates status, window, caps and
  per-account limits).

## Screens (MVP)

Landing (`/`) · About (`/about`) · Sign-in (`/auth`, email link + Google) ·
Setup / create-or-join (`/setup`) · Inventory · Consume ("Use up") · Scan ·
Add item · Item detail · Shopping (Running low + buy requests) · More
(household switching, members, join requests, promo code, account).

## Known intentional choices

- No activity-history UI (event model kept minimal on purpose).
- No automatic matching of buy requests to products — completion is manual.
- No household deletion UI.
- Email-link auth uses Supabase's default sender; showing a 6-digit code in
  the email would require a custom SMTP domain, so the UI is link-only.
- Six security-linter EXECUTE warnings on SECURITY DEFINER helper functions
  are expected: they must be callable by signed-in users and each verifies
  its caller internally.
