DROP POLICY IF EXISTS "Owners can update households" ON public.households;
CREATE POLICY "Owners can update households"
ON public.households FOR UPDATE TO authenticated
USING (private.is_household_owner(id))
WITH CHECK (private.is_household_owner(id));