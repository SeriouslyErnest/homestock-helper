-- Items beyond an enforced plan allowance are hidden at the database level.
CREATE OR REPLACE FUNCTION private.item_within_plan(_household_id uuid, _created_at timestamptz, _id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.app_plans%ROWTYPE; owner_id uuid; ahead integer;
BEGIN
  SELECT created_by INTO owner_id FROM public.households WHERE id = _household_id;
  SELECT * INTO p FROM public.plan_for_user(owner_id);
  IF p.tier IS NULL OR NOT p.enforced THEN RETURN true; END IF;
  SELECT count(*) INTO ahead FROM public.items i
   WHERE i.household_id = _household_id
     AND (i.created_at < _created_at OR (i.created_at = _created_at AND i.id < _id));
  RETURN ahead < p.max_items;
END $$;
REVOKE ALL ON FUNCTION private.item_within_plan(uuid, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.item_within_plan(uuid, timestamptz, uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS items_household_created_idx ON public.items (household_id, created_at, id);

DROP POLICY IF EXISTS "Members can view household items" ON public.items;
CREATE POLICY "Members can view household items" ON public.items FOR SELECT TO authenticated
USING (private.is_household_member(household_id) AND private.item_within_plan(household_id, created_at, id));

CREATE OR REPLACE FUNCTION public.household_hidden_item_count(_household_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.app_plans%ROWTYPE; owner_id uuid; total integer;
BEGIN
  IF NOT private.is_household_member(_household_id) THEN RETURN 0; END IF;
  SELECT created_by INTO owner_id FROM public.households WHERE id = _household_id;
  SELECT * INTO p FROM public.plan_for_user(owner_id);
  IF p.tier IS NULL OR NOT p.enforced THEN RETURN 0; END IF;
  SELECT count(*) INTO total FROM public.items WHERE household_id = _household_id;
  RETURN GREATEST(total - p.max_items, 0);
END $$;
REVOKE ALL ON FUNCTION public.household_hidden_item_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.household_hidden_item_count(uuid) TO authenticated;

-- Plan settings: each user reads only the plan that applies to them.
DROP POLICY IF EXISTS "Signed-in users can read plan settings" ON public.app_plans;
CREATE POLICY "Users can read their own plan settings" ON public.app_plans FOR SELECT TO authenticated
USING (tier = public.effective_tier(auth.uid()));

-- Product cache: reported/hidden names are never readable.
DROP POLICY IF EXISTS "Signed-in users can read the product cache" ON public.products;
CREATE POLICY "Signed-in users can read visible products" ON public.products FOR SELECT TO authenticated
USING (hidden_at IS NULL);