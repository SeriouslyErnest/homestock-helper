CREATE TABLE public.app_plans (
  tier text PRIMARY KEY,
  max_owned_households integer NOT NULL,
  max_members integer NOT NULL,
  enforced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_plans TO authenticated;
GRANT ALL ON public.app_plans TO service_role;
ALTER TABLE public.app_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read plan settings" ON public.app_plans
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_app_plans_updated_at BEFORE UPDATE ON public.app_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_plans (tier, max_owned_households, max_members, enforced) VALUES
  ('free', 1, 4, false),
  ('paid', 25, 50, false);

CREATE TABLE public.user_plans (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'free' REFERENCES public.app_plans(tier),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_plans TO authenticated;
GRANT ALL ON public.user_plans TO service_role;
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own plan" ON public.user_plans
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER update_user_plans_updated_at BEFORE UPDATE ON public.user_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.plan_for_user(_user_id uuid)
RETURNS public.app_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.* FROM public.app_plans p
   WHERE p.tier = COALESCE((SELECT up.tier FROM public.user_plans up WHERE up.user_id = _user_id), 'free')
$$;

CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
    'owned_households', owned,
    'can_create_household', (NOT p.enforced) OR owned < p.max_owned_households
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_household(_name text)
RETURNS public.households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p public.app_plans%ROWTYPE;
  owned integer;
  h public.households%ROWTYPE;
  nm text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  SELECT * INTO p FROM public.plan_for_user(uid);
  SELECT count(*) INTO owned FROM public.household_members
   WHERE user_id = uid AND role = 'owner';
  IF p.enforced AND owned >= p.max_owned_households THEN
    RAISE EXCEPTION 'plan_limit_households';
  END IF;

  INSERT INTO public.households (name, created_by)
  VALUES (NULLIF(left(btrim(coalesce(_name, '')), 60), ''), uid)
  RETURNING * INTO h;

  SELECT display_name INTO nm FROM public.profiles WHERE id = uid;
  INSERT INTO public.household_members (household_id, user_id, role, display_name)
  VALUES (h.id, uid, 'owner', nm)
  ON CONFLICT DO NOTHING;

  RETURN h;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_join_requests()
RETURNS TABLE (
  id uuid,
  household_id uuid,
  household_name text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.household_id, h.name, r.status, r.created_at
    FROM public.household_join_requests r
    JOIN public.households h ON h.id = r.household_id
   WHERE r.user_id = auth.uid()
   ORDER BY r.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.decide_join_request(_request_id uuid, _decision text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.household_join_requests%ROWTYPE;
  p public.app_plans%ROWTYPE;
  owner_id uuid;
  member_count integer;
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

  IF _decision = 'approved' THEN
    SELECT created_by INTO owner_id FROM public.households WHERE id = r.household_id;
    SELECT * INTO p FROM public.plan_for_user(owner_id);
    SELECT count(*) INTO member_count FROM public.household_members
     WHERE household_id = r.household_id;
    IF p.enforced AND member_count >= p.max_members THEN
      RAISE EXCEPTION 'plan_limit_members';
    END IF;
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

REVOKE ALL ON FUNCTION public.plan_for_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_household(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_join_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_household(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_join_requests() TO authenticated;