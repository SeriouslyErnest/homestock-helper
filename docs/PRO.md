# Pro implementation notes

## Screens and source boundaries

- `src/routes/pro.tsx`: public, shareable feature preview with its own metadata.
  Three screenshots are captured from fictional read-only subjects, labelled as
  samples. There is no checkout, price, real-home query or subscription mutation.
- `src/components/pro-samples.tsx`: screenshot subjects mirroring Insights
  headings/rows. `/pro?sample=true` renders these instead of the captured images.
  This is a screenshot regeneration switch, **not an entitlement override**.
- `src/assets/pro/*.jpg.asset.json`: CDN pointers for captured subjects; both
  the Pro page and user guide use these assets. Raw captures stay outside source.
- `src/components/user-guide.tsx`: section 11 explains Pro. More, the locked
  Insights screen and the About footer link to the public preview.
- `src/routes/_authenticated/insights.tsx`: real household data and Pro gate.
- `src/lib/insights.ts`: pure calculations; `insights.test.ts` covers the maths.
- `src/lib/billing.ts`: future plan descriptors with null prices and
  `BILLING_CONNECTED = false`. This is preparation, not a payment integration.

## Entitlement and data recording

`household_is_pro()` checks whether **any owner** has `effective_tier() = paid`.
Base plans, valid trial/complimentary grants, redeemed promo entitlements and
eligible live subscriptions contribute. A paid member who is not an owner
does not sponsor the home. Paid/free base-plan changes do not revoke an active
grant or subscription; effective access can therefore remain paid.

All members inherit the home's access. The browser gate is presentation only:
stock-snapshot reads also require current home membership and Pro through RLS.
Ordinary inventory events remain available for core inventory functionality on
all plans. Only additional snapshots are Pro-only.

`record_pro_snapshots()` runs daily at **23:30 UTC**, records currently Pro
homes only, and upserts one row per item/date. It writes one `scheduler_runs`
row per execution. Downgrading stops new snapshots and access, not ordinary
inventory events; prior snapshots are retained, not retrospectively created.

## Calculation semantics and limits

| Output | Current calculation |
| --- | --- |
| Used / added | Consume deltas / positive restock deltas in the last 30 days, for item rows still present |
| Daily use | Recorded consumption divided by 30, even with shorter history |
| Run-out | Floor of current total / daily use; absent with no recent use or zero stock; upcoming list is within 7 days |
| Staples | Top five products by 30-day consumption, with rate × 7 for weekly use |
| Restock rhythm | Average rounded days between trips; a trip starts at least 24 hours after the previous trip timestamp; at least two trips needed |
| Untouched | In stock with no recorded activity for at least 60 days, falling back to item creation time |
| Expiry watch | Earliest expiry of positive stock within 7 days, including already overdue dates |
| Weekly flow | Restock and consume events, eight Monday-start UTC weeks; does not require snapshots |
| Spoiled on shelf | Positive quantity in a snapshot taken on that row's expiry date, counted once per item/date; not confirmed waste |

Current fetching caps: events from 180 days, newest 5,000; snapshots from 90
days, at most 10,000. Heavy homes can exceed these caps. Deleted item rows no
longer contribute to product-level history. Consume/Undo events are counted as
recorded rather than netted into a corrected consumption history. Forecasts
are linear estimates, not seasonal predictions or automatic reorder actions.
No currency savings, category breakdowns or guaranteed food-waste reduction
are implemented. Expiry watching is also available in ordinary Inventory;
Pro adds the dedicated insights view and snapshot-derived history.

## Future built-in payments handoff — not connected

`billing_subscriptions` supports sandbox/live provider records. Ordinary users
can read their own rows but cannot write subscription status. A future webhook
under `api/public` must verify the provider signature before privileged writes,
handle retries idempotently, map provider identities to known users and update
the existing subscription record on cancellations/renewals. Current effective
tier resolution counts eligible **live** records with a future period end;
sandbox records must not unlock production Pro. Do not enable a provider or
invent a checkout/price while this preparation-only decision remains in force.

## Regenerating sample screenshots

1. Open `/pro?sample=true` with Playwright, wait for fonts, and capture each
   `[data-pro-sample="forecast|audit|flow"]` element as JPEG. Use only the
   fictional subjects; do not capture a real user's home for public material.
2. Upload raw files from `/tmp` with `lovable-assets create`; retain returned
   pointers in `src/assets/pro/`, update dimensions if needed, and keep imports
   aligned with the actual pointer filenames.
3. Check normal `/pro` (captured images, not subjects) and About's guide at
   narrow and wide widths, including dark appearance, keyboard navigation,
   image delivery and overflow. Record results in `docs/TESTING.md`.

## Test coverage

The existing six calculation tests and prior entitlement/snapshot E2E results
are recorded in `docs/TESTING.md`. Public teaser checks do not retest admin
TOTP, trial issuance, promo redemption or payments. Those must be verified
through their real flows when changed or when payments are connected.