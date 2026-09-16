ALTER TABLE public.shopping_items ADD COLUMN IF NOT EXISTS stock_applied numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.join_household_by_code(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h_id uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _code IS NULL OR length(trim(_code)) < 4 THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  SELECT id INTO h_id FROM public.households WHERE invite_code = upper(trim(_code));
  IF h_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (h_id, uid, 'member')
  ON CONFLICT DO NOTHING;
  RETURN h_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_household_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_household_by_code(text) TO authenticated;