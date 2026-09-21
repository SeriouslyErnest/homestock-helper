-- Admin roles (server-side only; no client access)
CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'SUPER_ADMIN'
    CHECK (role IN ('SUPER_ADMIN','BILLING_ADMIN','SUPPORT_ADMIN','READ_ONLY_ADMIN')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_users TO service_role;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Pseudonymous account directory. No plaintext email is ever stored here:
-- email_hash is an HMAC computed server-side with ADMIN_EMAIL_SALT, and
-- email_masked keeps only the first two and last two characters of the local part.
CREATE TABLE public.account_directory (
  user_id uuid PRIMARY KEY,
  email_hash text NOT NULL UNIQUE,
  email_masked text NOT NULL,
  display_name text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_directory TO service_role;
ALTER TABLE public.account_directory ENABLE ROW LEVEL SECURITY;
CREATE INDEX account_directory_last_seen_idx ON public.account_directory (last_seen_at DESC);

-- Promotions
CREATE TABLE public.promotions (
  code text PRIMARY KEY,
  campaign_name text NOT NULL,
  tier text NOT NULL REFERENCES public.app_plans(tier),
  duration_days integer NOT NULL DEFAULT 90 CHECK (duration_days > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  max_redemptions integer,
  per_account_limit integer NOT NULL DEFAULT 1 CHECK (per_account_limit > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','expired')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_promotions_updated_at BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Entitlement grants: trials, complimentary access and promo results
CREATE TABLE public.entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier text NOT NULL REFERENCES public.app_plans(tier),
  source text NOT NULL CHECK (source IN ('complimentary','promo','trial')),
  promo_code text REFERENCES public.promotions(code),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.entitlement_grants TO authenticated;
GRANT ALL ON public.entitlement_grants TO service_role;
ALTER TABLE public.entitlement_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own grants" ON public.entitlement_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX entitlement_grants_user_idx ON public.entitlement_grants (user_id);

CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL REFERENCES public.promotions(code),
  user_id uuid NOT NULL,
  grant_id uuid REFERENCES public.entitlement_grants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, user_id)
);
GRANT SELECT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own redemptions" ON public.promo_redemptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Immutable admin audit trail
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action_type text NOT NULL,
  target_type text,
  target_id text,
  before_json jsonb,
  after_json jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);

-- Effective tier: the strongest of the account's base plan and any live grant.
CREATE OR REPLACE FUNCTION public.effective_tier(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.tier
    FROM (
      SELECT COALESCE((SELECT up.tier FROM public.user_plans up WHERE up.user_id = _user_id), 'free') AS tier
      UNION ALL
      SELECT g.tier
        FROM public.entitlement_grants g
       WHERE g.user_id = _user_id
         AND g.revoked_at IS NULL
         AND g.starts_at <= now()
         AND (g.ends_at IS NULL OR g.ends_at > now())
    ) t
    JOIN public.app_plans p ON p.tier = t.tier
   ORDER BY p.max_owned_households DESC, p.max_members DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.plan_for_user(_user_id uuid)
RETURNS app_plans
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.* FROM public.app_plans p
   WHERE p.tier = COALESCE(public.effective_tier(_user_id), 'free')
$$;

REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM authenticated;

-- Redeem a promo code as the signed-in user.
CREATE OR REPLACE FUNCTION public.redeem_promo(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  pr public.promotions%ROWTYPE;
  used integer;
  mine integer;
  g public.entitlement_grants%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _code IS NULL OR length(btrim(_code)) < 3 THEN
    RAISE EXCEPTION 'promo_invalid';
  END IF;

  SELECT * INTO pr FROM public.promotions
   WHERE code = upper(btrim(_code)) FOR UPDATE;

  IF pr.code IS NULL
     OR pr.status <> 'active'
     OR pr.starts_at > now()
     OR (pr.ends_at IS NOT NULL AND pr.ends_at <= now()) THEN
    RAISE EXCEPTION 'promo_invalid';
  END IF;

  SELECT count(*) INTO used FROM public.promo_redemptions WHERE code = pr.code;
  IF pr.max_redemptions IS NOT NULL AND used >= pr.max_redemptions THEN
    RAISE EXCEPTION 'promo_invalid';
  END IF;

  SELECT count(*) INTO mine FROM public.promo_redemptions
   WHERE code = pr.code AND user_id = uid;
  IF mine >= pr.per_account_limit THEN
    RAISE EXCEPTION 'promo_already_used';
  END IF;

  INSERT INTO public.entitlement_grants (user_id, tier, source, promo_code, ends_at, reason)
  VALUES (uid, pr.tier, 'promo', pr.code, now() + make_interval(days => pr.duration_days), pr.campaign_name)
  RETURNING * INTO g;

  INSERT INTO public.promo_redemptions (code, user_id, grant_id)
  VALUES (pr.code, uid, g.id);

  RETURN jsonb_build_object('tier', g.tier, 'ends_at', g.ends_at, 'campaign', pr.campaign_name);
END;
$$;

-- My live grants, for showing the user what they have and when it ends.
CREATE OR REPLACE FUNCTION public.my_access()
RETURNS TABLE(tier text, source text, ends_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT g.tier, g.source, g.ends_at
    FROM public.entitlement_grants g
   WHERE g.user_id = auth.uid()
     AND g.revoked_at IS NULL
     AND g.starts_at <= now()
     AND (g.ends_at IS NULL OR g.ends_at > now())
   ORDER BY g.ends_at NULLS FIRST
$$;
