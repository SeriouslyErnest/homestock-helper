CREATE OR REPLACE FUNCTION public.guard_membership_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT private.is_household_owner(OLD.household_id) THEN
      RAISE EXCEPTION 'Only an owner can change a member role';
    END IF;
  END IF;
  IF NEW.household_id IS DISTINCT FROM OLD.household_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership identity cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_membership_role_change ON public.household_members;
CREATE TRIGGER guard_membership_role_change
  BEFORE UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_membership_role_change();

DROP POLICY IF EXISTS "Members can update their own membership" ON public.household_members;
CREATE POLICY "Members can update their own membership"
  ON public.household_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.is_household_owner(household_id))
  WITH CHECK (user_id = auth.uid() OR private.is_household_owner(household_id));

DROP POLICY IF EXISTS "Signed-in users can update the product cache" ON public.products;
CREATE POLICY "Signed-in users can refresh stale cache entries"
  ON public.products FOR UPDATE TO authenticated
  USING (name IS NULL OR fetched_at < now() - interval '7 days')
  WITH CHECK (true);