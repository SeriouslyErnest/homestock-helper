CREATE OR REPLACE FUNCTION public.join_household_by_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h_id uuid;
BEGIN
  SELECT id INTO h_id FROM public.households WHERE invite_code = upper(trim(_code));
  IF h_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (h_id, auth.uid(), 'member')
  ON CONFLICT DO NOTHING;
  RETURN h_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_household_by_code(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_household_by_code(text) FROM anon, PUBLIC;