CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.is_household_member(_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = _household_id AND user_id = auth.uid()
  )
$$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.is_household_member(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid) FROM anon, PUBLIC;

ALTER POLICY "Members can view their household" ON public.households USING (private.is_household_member(id) OR created_by = auth.uid());
ALTER POLICY "Owners can update households" ON public.households USING (private.is_household_member(id));
ALTER POLICY "Members can view membership" ON public.household_members USING (private.is_household_member(household_id) OR user_id = auth.uid());
ALTER POLICY "Members can view household items" ON public.items USING (private.is_household_member(household_id));
ALTER POLICY "Members can add household items" ON public.items WITH CHECK (private.is_household_member(household_id));
ALTER POLICY "Members can update household items" ON public.items USING (private.is_household_member(household_id));
ALTER POLICY "Members can delete household items" ON public.items USING (private.is_household_member(household_id));
ALTER POLICY "Members can view shopping list" ON public.shopping_items USING (private.is_household_member(household_id));
ALTER POLICY "Members can add to shopping list" ON public.shopping_items WITH CHECK (private.is_household_member(household_id));
ALTER POLICY "Members can update shopping list" ON public.shopping_items USING (private.is_household_member(household_id));
ALTER POLICY "Members can delete from shopping list" ON public.shopping_items USING (private.is_household_member(household_id));
DROP FUNCTION public.is_household_member(uuid);