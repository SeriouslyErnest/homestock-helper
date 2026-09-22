ALTER TABLE public.app_plans
  ADD COLUMN IF NOT EXISTS max_items integer NOT NULL DEFAULT 100;

UPDATE public.app_plans SET max_items = 100 WHERE tier = 'free';
UPDATE public.app_plans SET max_items = 100000 WHERE tier <> 'free';

CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p public.app_plans%ROWTYPE;
  owned integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  SELECT * INTO p FROM public.plan_for_user(uid);
  SELECT count(*) INTO owned FROM public.household_members
   WHERE user_id = uid AND role = 'owner';
  RETURN jsonb_build_object(
    'tier', p.tier,
    'enforced', p.enforced,
    'max_owned_households', p.max_owned_households,
    'max_members', p.max_members,
    'max_items', p.max_items,
    'owned_households', owned,
    'can_create_household', (NOT p.enforced) OR owned < p.max_owned_households
  );
END;
$$;