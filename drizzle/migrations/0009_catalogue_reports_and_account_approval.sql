ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

CREATE TABLE public.product_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL REFERENCES public.products(barcode) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reported_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barcode, reporter_id)
);
GRANT ALL ON public.product_reports TO service_role;
ALTER TABLE public.product_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.account_approvals (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_approvals TO service_role;
ALTER TABLE public.account_approvals ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.account_approved(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN coalesce((SELECT (value->>'enabled')::boolean FROM public.app_settings WHERE key = 'account_approval'), false) = false THEN true
    ELSE EXISTS (SELECT 1 FROM public.account_approvals WHERE user_id = _uid AND status = 'approved')
  END
$$;

CREATE OR REPLACE FUNCTION private.require_account_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.account_approved(auth.uid()) THEN
    RAISE EXCEPTION 'account_pending_approval';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER households_require_approval BEFORE INSERT ON public.households
  FOR EACH ROW EXECUTE FUNCTION private.require_account_approved();
CREATE TRIGGER join_requests_require_approval BEFORE INSERT ON public.household_join_requests
  FOR EACH ROW EXECUTE FUNCTION private.require_account_approved();

-- Used when an admin switches approval on: everyone already here stays in.
CREATE OR REPLACE FUNCTION public.approve_existing_accounts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.account_approvals (user_id, status, decided_at)
  SELECT id, 'approved', now() FROM auth.users
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.approve_existing_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_existing_accounts() TO service_role;