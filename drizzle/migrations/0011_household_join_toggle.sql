ALTER TABLE public.households ADD COLUMN join_open boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.regenerate_invite_code(_household_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
BEGIN
  IF NOT private.is_household_owner(_household_id) THEN
    RAISE EXCEPTION 'Only the owner can regenerate the invite code';
  END IF;
  _code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  UPDATE public.households SET invite_code = _code WHERE id = _household_id;
  RETURN _code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.regenerate_invite_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_invite_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_household_join(_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _household public.households%ROWTYPE;
  _existing text;
BEGIN
  SELECT * INTO _household FROM public.households WHERE invite_code = upper(trim(_code));
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF NOT _household.join_open THEN
    RETURN 'closed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household.id AND user_id = auth.uid()) THEN
    RETURN 'member';
  END IF;
  SELECT status INTO _existing FROM public.household_join_requests
    WHERE household_id = _household.id AND user_id = auth.uid()
    ORDER BY created_at DESC LIMIT 1;
  IF _existing = 'blocked' THEN
    RETURN 'blocked';
  END IF;
  IF _existing = 'pending' THEN
    RETURN 'pending';
  END IF;
  INSERT INTO public.household_join_requests (household_id, user_id)
  VALUES (_household.id, auth.uid());
  RETURN 'requested';
END;
$$;

CREATE OR REPLACE FUNCTION public.join_household_by_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _household public.households%ROWTYPE;
BEGIN
  SELECT * INTO _household FROM public.households WHERE invite_code = upper(trim(_code));
  IF NOT FOUND OR NOT _household.join_open THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_join_requests WHERE household_id = _household.id AND user_id = auth.uid() AND status = 'blocked') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (_household.id, auth.uid(), 'member')
  ON CONFLICT DO NOTHING;
  RETURN _household.id;
END;
$$;