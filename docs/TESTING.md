# Test log

What has been checked end-to-end, when, and how. Re-test a feature when its
code has changed since its "Last tested" date.

Test accounts: none. All test accounts and test homes were deleted on
2026-09-29 after the end-to-end run. Create a fresh confirmed account via the
admin API for the next run and delete it afterwards.

Method: headless browser at phone size (390x844) against the preview, plus
database read-back.

| Feature | Last tested (UTC) | Result | Notes |
| --- | --- | --- | --- |
| Password sign-in | 2026-09-29 | Pass | Right password signs in; wrong password shows the friendly "don't match" message |
| Password sign-up | 2026-09-29 | Partial | Form works; a real inbox confirmation link was not tested (test domains can't receive mail) |
| Forgot password / reset page | 2026-09-29 | Partial | Reset page loads and waits for the email link; the emailed link itself was not tested |
| Account approval holding screen | 2026-09-29 | Pass | New account with approval ON sees "Thanks for signing up"; pending row created |
| First entry after approval | 2026-09-29 | Pass | After approval, the user reaches setup; first_entered_at recorded |
| Telegram sign-up alerts (waiting / first time in) | — | Not verified | Triggers ran; delivery to Telegram not observed from the test |
| Create home (setup) | 2026-09-29 | Pass | |
| Welcome tour (5 steps) | 2026-09-29 | Pass | Next x4 then Finish lands on Inventory |
| Expiry date field DD/MM/YYYY | 2026-09-29 | Pass | 31/02/2026 refused with message; typing 15102026 becomes 15/10/2026; saved and shown the same on the item page |
| Running low rule (current < minimum) | 2026-09-29 | Pass | 1 of min 1 = not low (inventory, item page, shopping); 1 of min 3 = LOW and suggested on Shopping |
| Use one + Undo | 2026-09-29 | Pass | Consume then Undo; events logged consume, restock; quantity back to 1 |
| Scanner without camera | 2026-09-29 | Pass | Falls back to type-the-barcode |
| Scanner sideways barcodes | — | Not verified | Needs a real phone camera |
| Admin console + two-factor login | — | Not verified | Needs the operator's authenticator |

## 2026-09-29 — Scanner: native BarcodeDetector (any angle) with ZXing fallback — typecheck only; needs real phone test

## 2026-09-30 — abuse hardening
- Rate limits (join code, promo, recovery code, product lookup), text length limits, admin input checks, tightened access rules — typecheck only; not browser-tested.
- 2026-09-30 E2E (390px, temp account, pre-approved so no alerts): sign-in, create home, add item (name capped at 200, typed date), inventory OK. Limits verified: 11th wrong invite code -> too_many; 6th wrong promo -> "Too many tries" on screen; old direct-join removed (404); direct home insert 403; 100-char home name rejected; moving item to another home 403; 1,500-char notes rejected; javascript: photo link cleared; telegram admin link insert 403. PASS. Not tested: recovery-code limit, product-lookup limit. Test account deleted afterwards.
- 2026-09-30 Password sign-in removed from the sign-in page and the reset-password page deleted; sign-in is email link or Google only.

- 2026-10-04 — Inventory product grouping (collapsed product row, expand breakdown, group − uses soonest expiry, "Add expiry" after +1 with split of new unit) — typecheck only; needs browser test.
