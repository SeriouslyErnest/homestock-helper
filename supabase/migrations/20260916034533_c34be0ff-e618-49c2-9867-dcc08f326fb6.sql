CREATE OR REPLACE FUNCTION private.is_household_owner(_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = _household_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION private.is_household_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_household_owner(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members can leave households" ON public.household_members;
CREATE POLICY "Members can leave or be removed by an owner"
ON public.household_members
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR private.is_household_owner(household_id));