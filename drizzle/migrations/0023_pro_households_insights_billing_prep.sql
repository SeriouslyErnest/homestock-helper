-- Payments preparation: subscriptions written later by a verified payment webhook only.
CREATE TABLE public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('stripe','paddle')),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  provider_customer_id text,
  provider_subscription_id text NOT NULL,
  price_id text,
  tier text NOT NULL DEFAULT 'paid' REFERENCES public.app_plans(tier),
  status text NOT NULL,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, provider_subscription_id)
);
GRANT SELECT ON public.billing_subscriptions TO authenticated;
GRANT ALL ON public.billing_subscriptions TO service_role;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own subscriptions" ON public.billing_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_billing_subscriptions_updated_at BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Effective tier now also counts an active (live) subscription.
CREATE OR REPLACE FUNCTION public.effective_tier(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.tier FROM (
    SELECT COALESCE((SELECT up.tier FROM public.user_plans up WHERE up.user_id = _user_id), 'free') AS tier
    UNION ALL
    SELECT g.tier FROM public.entitlement_grants g
     WHERE g.user_id = _user_id AND g.revoked_at IS NULL AND g.starts_at <= now()
       AND (g.ends_at IS NULL OR g.ends_at > now())
    UNION ALL
    SELECT s.tier FROM public.billing_subscriptions s
     WHERE s.user_id = _user_id AND s.environment = 'live'
       AND s.status IN ('active','trialing','past_due')
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) t JOIN public.app_plans p ON p.tier = t.tier
  ORDER BY p.max_owned_households DESC, p.max_members DESC LIMIT 1
$$;

-- A home is Pro when any of its owners is on the paid tier.
CREATE OR REPLACE FUNCTION public.household_is_pro(_household_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = _household_id AND m.role = 'owner'
       AND public.effective_tier(m.user_id) = 'paid')
$$;

-- Members-only view of a home's Pro status (who unlocked it, never their plan details).
CREATE OR REPLACE FUNCTION public.household_pro_status(_household_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sponsor uuid; sponsor_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('pro', false);
  END IF;
  SELECT m.user_id, m.display_name INTO sponsor, sponsor_name FROM public.household_members m
   WHERE m.household_id = _household_id AND m.role = 'owner' AND public.effective_tier(m.user_id) = 'paid'
   ORDER BY m.created_at LIMIT 1;
  RETURN jsonb_build_object('pro', sponsor IS NOT NULL, 'sponsor_is_me', sponsor = auth.uid(), 'sponsor_name', sponsor_name);
END $$;
REVOKE EXECUTE ON FUNCTION public.household_pro_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.household_pro_status(uuid) TO authenticated;

-- Pro-only extra data: one stock snapshot per product row per day.
CREATE TABLE public.stock_snapshots (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  quantity numeric NOT NULL,
  min_quantity numeric NOT NULL,
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, snapshot_date)
);
CREATE INDEX stock_snapshots_household_date ON public.stock_snapshots (household_id, snapshot_date);
GRANT SELECT ON public.stock_snapshots TO authenticated;
GRANT ALL ON public.stock_snapshots TO service_role;
ALTER TABLE public.stock_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members of Pro homes read snapshots" ON public.stock_snapshots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = stock_snapshots.household_id AND m.user_id = auth.uid())
    AND public.household_is_pro(household_id));

CREATE OR REPLACE FUNCTION public.record_pro_snapshots()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer := 0; run_id uuid;
BEGIN
  INSERT INTO public.scheduler_runs (job_name, status) VALUES ('pro-snapshots', 'running') RETURNING id INTO run_id;
  INSERT INTO public.stock_snapshots (household_id, item_id, snapshot_date, quantity, min_quantity, expires_on)
  SELECT i.household_id, i.id, (now() AT TIME ZONE 'UTC')::date, i.quantity, i.min_quantity, i.expires_on
    FROM public.items i
   WHERE public.household_is_pro(i.household_id)
  ON CONFLICT (item_id, snapshot_date) DO UPDATE
    SET quantity = EXCLUDED.quantity, min_quantity = EXCLUDED.min_quantity, expires_on = EXCLUDED.expires_on;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.scheduler_runs SET finished_at = now(), status = 'ok', pairs_processed = n, queries_run = 1
   WHERE id = run_id;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_pro_snapshots() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('pro-snapshots-daily', '30 23 * * *', 'SELECT public.record_pro_snapshots()');