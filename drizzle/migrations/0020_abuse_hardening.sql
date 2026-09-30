-- Attempt log for simple per-user throttles
CREATE TABLE public.rate_limit_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE INDEX rate_limit_hits_lookup ON public.rate_limit_hits (user_id, bucket, created_at DESC);

CREATE OR REPLACE FUNCTION private.recent_hits(_user uuid, _bucket text, _window interval)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.rate_limit_hits
   WHERE user_id = _user AND bucket = _bucket AND created_at > now() - _window
$$;

-- Joining by code: max 10 wrong codes per hour
CREATE OR REPLACE FUNCTION public.request_household_join(_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _household public.households%ROWTYPE;
  _existing text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'not_found'; END IF;
  IF private.recent_hits(auth.uid(), 'join_code_miss', interval '1 hour') >= 10 THEN
    RETURN 'too_many';
  END IF;
  SELECT * INTO _household FROM public.households WHERE invite_code = upper(trim(left(coalesce(_code,''), 20)));
  IF NOT FOUND THEN
    INSERT INTO public.rate_limit_hits (user_id, bucket) VALUES (auth.uid(), 'join_code_miss');
    RETURN 'not_found';
  END IF;
  IF NOT _household.join_open THEN RETURN 'closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household.id AND user_id = auth.uid()) THEN
    RETURN 'member';
  END IF;
  SELECT status INTO _existing FROM public.household_join_requests
    WHERE household_id = _household.id AND user_id = auth.uid()
    ORDER BY created_at DESC LIMIT 1;
  IF _existing = 'blocked' THEN RETURN 'blocked'; END IF;
  IF _existing = 'pending' THEN RETURN 'pending'; END IF;
  INSERT INTO public.household_join_requests (household_id, user_id) VALUES (_household.id, auth.uid());
  RETURN 'requested';
END;
$function$;

-- Old direct-join path skipped owner approval; nothing uses it
DROP FUNCTION IF EXISTS public.join_household_by_code(text);

-- Promo codes: max 5 wrong codes per 15 minutes. Failures are returned (not raised) so the attempt is recorded.
CREATE OR REPLACE FUNCTION public.redeem_promo(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  uid uuid := auth.uid();
  pr public.promotions%ROWTYPE;
  used integer;
  mine integer;
  g public.entitlement_grants%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF private.recent_hits(uid, 'promo_miss', interval '15 minutes') >= 5 THEN
    RETURN jsonb_build_object('error', 'promo_too_many');
  END IF;
  IF _code IS NULL OR length(btrim(_code)) < 3 OR length(_code) > 40 THEN
    INSERT INTO public.rate_limit_hits (user_id, bucket) VALUES (uid, 'promo_miss');
    RETURN jsonb_build_object('error', 'promo_invalid');
  END IF;
  SELECT * INTO pr FROM public.promotions WHERE code = upper(btrim(_code)) FOR UPDATE;
  IF pr.code IS NULL OR pr.status <> 'active' OR pr.starts_at > now()
     OR (pr.ends_at IS NOT NULL AND pr.ends_at <= now()) THEN
    INSERT INTO public.rate_limit_hits (user_id, bucket) VALUES (uid, 'promo_miss');
    RETURN jsonb_build_object('error', 'promo_invalid');
  END IF;
  SELECT count(*) INTO used FROM public.promo_redemptions WHERE code = pr.code;
  IF pr.max_redemptions IS NOT NULL AND used >= pr.max_redemptions THEN
    RETURN jsonb_build_object('error', 'promo_invalid');
  END IF;
  SELECT count(*) INTO mine FROM public.promo_redemptions WHERE code = pr.code AND user_id = uid;
  IF mine >= pr.per_account_limit THEN
    RETURN jsonb_build_object('error', 'promo_already_used');
  END IF;
  INSERT INTO public.entitlement_grants (user_id, tier, source, promo_code, ends_at, reason)
  VALUES (uid, pr.tier, 'promo', pr.code, now() + make_interval(days => pr.duration_days), pr.campaign_name)
  RETURNING * INTO g;
  INSERT INTO public.promo_redemptions (code, user_id, grant_id) VALUES (pr.code, uid, g.id);
  RETURN jsonb_build_object('tier', g.tier, 'ends_at', g.ends_at, 'campaign', pr.campaign_name);
END;
$function$;

-- Text length / URL checks, enforced for every writer
CREATE OR REPLACE FUNCTION private.check_item_text() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(NEW.name) > 200 THEN RAISE EXCEPTION 'Name is too long (max 200)'; END IF;
  IF length(coalesce(NEW.location,'')) > 100 THEN RAISE EXCEPTION 'Place is too long (max 100)'; END IF;
  IF length(coalesce(NEW.notes,'')) > 1000 THEN RAISE EXCEPTION 'Notes are too long (max 1000)'; END IF;
  IF length(NEW.category) > 60 OR length(NEW.unit) > 30 THEN RAISE EXCEPTION 'Value is too long'; END IF;
  IF length(coalesce(NEW.barcode,'')) > 32 THEN RAISE EXCEPTION 'Barcode is too long'; END IF;
  IF NEW.image_url IS NOT NULL AND (NEW.image_url !~ '^https://' OR length(NEW.image_url) > 1000) THEN
    NEW.image_url := NULL;
  END IF;
  IF NEW.quantity > 1000000 OR NEW.min_quantity > 1000000 OR NEW.min_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity out of range';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER items_check_text BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION private.check_item_text();

CREATE OR REPLACE FUNCTION private.check_shopping_text() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(NEW.name) > 200 THEN RAISE EXCEPTION 'Name is too long (max 200)'; END IF;
  IF length(coalesce(NEW.note,'')) > 1000 THEN RAISE EXCEPTION 'Note is too long (max 1000)'; END IF;
  IF coalesce(array_length(NEW.tags,1),0) > 20 THEN RAISE EXCEPTION 'Too many tags'; END IF;
  IF NEW.quantity > 1000000 THEN RAISE EXCEPTION 'Quantity out of range'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shopping_check_text BEFORE INSERT OR UPDATE ON public.shopping_items
  FOR EACH ROW EXECUTE FUNCTION private.check_shopping_text();

CREATE OR REPLACE FUNCTION private.check_household_text() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(btrim(NEW.name)) = 0 OR length(NEW.name) > 80 THEN RAISE EXCEPTION 'Home name must be 1-80 characters'; END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  IF NEW.invite_code !~ '^[A-Z0-9]{6,12}$' THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER households_check_text BEFORE INSERT OR UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION private.check_household_text();

CREATE OR REPLACE FUNCTION private.check_display_name() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(coalesce(NEW.display_name,'')) > 60 THEN RAISE EXCEPTION 'Name is too long (max 60)'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_check_name BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.check_display_name();
CREATE TRIGGER members_check_name BEFORE INSERT OR UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION private.check_display_name();

CREATE OR REPLACE FUNCTION private.check_limit_note() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF length(coalesce(NEW.note,'')) > 500 THEN RAISE EXCEPTION 'Note is too long (max 500)'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER limit_requests_check_note BEFORE INSERT OR UPDATE ON public.limit_requests
  FOR EACH ROW EXECUTE FUNCTION private.check_limit_note();

-- Settings that could be abused
-- 1. Homes must be created through create_household (plan limit check), not inserted directly
DROP POLICY IF EXISTS "Users can create households" ON public.households;
-- 2. Items / shopping rows cannot be moved into a home you don't belong to
DROP POLICY IF EXISTS "Members can update household items" ON public.items;
CREATE POLICY "Members can update household items" ON public.items FOR UPDATE TO authenticated
  USING (private.is_household_member(household_id)) WITH CHECK (private.is_household_member(household_id));
DROP POLICY IF EXISTS "Members can update shopping list" ON public.shopping_items;
CREATE POLICY "Members can update shopping list" ON public.shopping_items FOR UPDATE TO authenticated
  USING (private.is_household_member(household_id)) WITH CHECK (private.is_household_member(household_id));
-- 3. Admin alert destination is only set by the bot after a verified link; people may view/remove their own
DROP POLICY IF EXISTS "Admins manage own telegram admin link" ON public.telegram_admin_links;
CREATE POLICY "Own telegram admin link read" ON public.telegram_admin_links FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own telegram admin link delete" ON public.telegram_admin_links FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE ON public.telegram_admin_links FROM authenticated;
