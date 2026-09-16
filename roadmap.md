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

## Later (beyond MVP)
- Multi-location stock records, inventory event history, buy-request tags
- Household switching for multi-household users
- Consume-first scan flow (scan currently routes to restock/add)
