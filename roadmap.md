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

## Later (beyond MVP)
- Multi-location stock records, inventory event history, buy-request tags
- Household switching for multi-household users
- Scan-to-consume (scan currently routes to restock/add; "Use up" page covers search/recent)
