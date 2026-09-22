-- The category/place list (Pantry, Fridge, Laundry, …) moves from hardcoded
-- app code into app_settings so the admin console can edit it.
create policy "Signed-in users can read the category list"
  on public.app_settings
  for select
  to authenticated
  using (key = 'categories');

-- The row itself is seeded right after via the query tools (data, not DDL).
grant select on public.app_settings to authenticated;
