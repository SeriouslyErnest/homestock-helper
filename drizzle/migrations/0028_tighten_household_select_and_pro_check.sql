-- Revoke creator read access to households after leaving or being removed.
-- Households are created exclusively via public.create_household(), which
-- inserts the creator into public.household_members in the same transaction.
ALTER POLICY "Members can view their household" ON public.households
  USING (private.is_household_member(id));

-- Restrict public.household_is_pro(uuid) so anonymous callers cannot execute it
-- and signed-in callers can only check households they currently belong to.
-- Scheduled/server callers (service_role / postgres) continue to evaluate all households.
CREATE OR REPLACE FUNCTION public.household_is_pro(_household_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated')
    OR EXISTS (
      SELECT 1 FROM public.household_members cm
       WHERE cm.household_id = _household_id AND cm.user_id = auth.uid()
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = _household_id AND m.role = 'owner'
       AND public.effective_tier(m.user_id) = 'paid'
  )
$function$;

REVOKE ALL ON FUNCTION public.household_is_pro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.household_is_pro(uuid) TO authenticated, service_role;