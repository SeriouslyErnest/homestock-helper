# HomeStock roadmap

## Done
- Backend: households, members, profiles, products cache, items, shopping_items (RLS + invite-code join)
- Auth: email/password + Google sign-in
- Landing page, app shell with bottom nav (Inventory / Shopping / Scan / More)
- Inventory: search, category chips, low-stock summary, list/card toggle (remembered), quick +/-
- Item detail: big +/- counter, consume with 4s Undo, edit details, add to shopping, delete
- Add item: name-only minimum, pre-filled from barcode scan (Open Food Facts, cached)
- Scan page: camera barcode scan + manual entry fallback
- Shopping list: quick add, tick off (auto-restocks tracked items), running-low suggestions
- More: rename household, invite code, members, join by code, sign out
- Verified on a phone-sized screen: sign-up → add item → consume → shopping list
- Auth switched to email one-time code + Google (no passwords)
- UX review fixes: untick now reverses stock, dates shown in local time (stored UTC),
  avatar shows your own initials, undo on inventory quick -1, 44px tap targets,
  balanced nav with a new "Use up" page, clear-bought, save confirmation,
  leave household / owner removes member, view toggle read after mount
- Barcode add flow uses a quick minus / editable quantity / plus stepper; inventory rows and navigation stay aligned on narrow phones
- Product pictures open full-screen from item previews; long shopping/inventory names wrap, and the scanner adapts to short screens
- Activity events (consume / restock / correction) recorded for every stock change
- Correct the count: tap the quantity in inventory or the item page, enter the real number, optional note, Undo
- Scan to check: scanning something already at home answers "do we have this?" with totals per place, need, and next actions
- "Use up" ranks by how often and how recently the household uses each item (in-stock only)
- Shared product catalogue: a manually identified unknown barcode is remembered for everyone (first save wins, never overwritten)
- Shared catalogue safeguards: word filter on save + one-tap report (hides name, admin keep/remove/ban)
- Account approval switch in admin console (default off); newcomers wait on a pending screen
- Restock several: scan basket with non-blocking "needs a name" placeholders
- Shared vs personal labels on settings; Quick stock check; per-household expiry/location switches
- Email + password sign-in enabled (27 Sep 2026) alongside link + Google
- Admin dashboard: items tracked, stock changes and count fixes (7 days); sign-in methods per account
- User guide on About page with real screenshots of the 9 key flows (26 Sep 2026); responsive check 320–1280px, shopping add row wraps on very small phones

## Open
- Consider recording who last edited an item's details (name, place, expiry), not just stock changes

## Later (beyond MVP)
- Activity history screen (events already recorded)
- Admin account deletion
- Read-only offline snapshot
- Scan-to-consume (scan currently routes to restock/add; "Use up" page covers search/recent)

## Welcome flow & scan-to-add (2026-09-26)
- [x] 5-step welcome at /welcome, once per account (server-side), skip/finish, resume step; existing accounts marked completed
- [x] Restart welcome flow under More (also resets first-use tips)
- [x] First-use tips on Inventory, Scan, Shopping, Use up; empty-state copy per PRD
- [x] Scan a product already at home → "Add N to stock" with Undo

## Invite codes & Telegram (2026-09-26/27)
- [x] Owner can close join requests and regenerate the invite code
- [x] Telegram expiry reminders (daily digest, admin kill switch, scheduler load panel)
- [x] Docs + user guide updated; password sign-in enabled; end-to-end test
- [ ] Telegram admin alerts ("🔐 ADMIN") — later
