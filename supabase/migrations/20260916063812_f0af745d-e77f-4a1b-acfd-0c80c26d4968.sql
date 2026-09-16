CREATE TABLE public.household_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text,
  email text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_join_requests TO authenticated;
GRANT ALL ON public.household_join_requests TO service_role;

ALTER TABLE public.household_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters and owners can view join requests"
ON public.household_join_requests FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.is_household_owner(household_id));

CREATE POLICY "Owners can decide join requests"
ON public.household_join_requests FOR UPDATE TO authenticated
USING (private.is_household_owner(household_id))
WITH CHECK (private.is_household_owner(household_id));

CREATE POLICY "Requesters can cancel their own pending request"
ON public.household_join_requests FOR DELETE TO authenticated
USING ((user_id = auth.uid() AND status = 'pending') OR private.is_household_owner(household_id));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER update_household_join_requests_updated_at
BEFORE UPDATE ON public.household_join_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.request_household_join(_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  h_id uuid;
  h_name text;
  uid uuid := auth.uid();
  existing text;
  uname text;
  uemail text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _code IS NULL OR length(trim(_code)) < 4 THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  SELECT id, name INTO h_id, h_name FROM public.households WHERE invite_code = upper(trim(_code));
  IF h_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF EXISTS (SELECT 1 FROM public.household_members WHERE household_id = h_id AND user_id = uid) THEN
    RETURN 'member';
  END IF;

  SELECT status INTO existing FROM public.household_join_requests
   WHERE household_id = h_id AND user_id = uid;

  IF existing = 'blocked' THEN
    RETURN 'blocked';
  END IF;

  SELECT display_name INTO uname FROM public.profiles WHERE id = uid;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  INSERT INTO public.household_join_requests (household_id, user_id, display_name, email, status)
  VALUES (h_id, uid, uname, uemail, 'pending')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET status = 'pending',
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        decided_by = NULL,
        decided_at = NULL,
        updated_at = now();

  RETURN 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.request_household_join(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_household_join(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_join_request(_request_id uuid, _decision text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.household_join_requests%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _decision NOT IN ('approved', 'rejected', 'blocked') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO r FROM public.household_join_requests WHERE id = _request_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT private.is_household_owner(r.household_id) THEN
    RAISE EXCEPTION 'Only an owner can decide join requests';
  END IF;

  UPDATE public.household_join_requests
     SET status = _decision, decided_by = uid, decided_at = now(), updated_at = now()
   WHERE id = _request_id;

  IF _decision = 'approved' THEN
    INSERT INTO public.household_members (household_id, user_id, role, display_name)
    VALUES (r.household_id, r.user_id, 'member', r.display_name)
    ON CONFLICT DO NOTHING;
  ELSIF _decision = 'blocked' THEN
    DELETE FROM public.household_members
     WHERE household_id = r.household_id AND user_id = r.user_id AND role <> 'owner';
  END IF;

  RETURN _decision;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_join_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_join_request(uuid, text) TO authenticated;