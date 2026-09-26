CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.telegram_links (
  user_id uuid PRIMARY KEY,
  chat_id bigint NOT NULL UNIQUE,
  linked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own telegram link read" ON public.telegram_links FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own telegram link delete" ON public.telegram_links FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.telegram_link_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_link_tokens TO service_role;
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX telegram_link_tokens_user_idx ON public.telegram_link_tokens (user_id);

CREATE TABLE public.expiry_notification_prefs (
  user_id uuid NOT NULL,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  notice_days integer NOT NULL DEFAULT 3 CHECK (notice_days BETWEEN 0 AND 30),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, household_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expiry_notification_prefs TO authenticated;
GRANT ALL ON public.expiry_notification_prefs TO service_role;
ALTER TABLE public.expiry_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own prefs read" ON public.expiry_notification_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own prefs insert" ON public.expiry_notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_household_member(household_id));
CREATE POLICY "Own prefs update" ON public.expiry_notification_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND private.is_household_member(household_id));
CREATE POLICY "Own prefs delete" ON public.expiry_notification_prefs FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX expiry_prefs_enabled_idx ON public.expiry_notification_prefs (enabled) WHERE enabled;

CREATE TABLE public.expiry_notification_deliveries (
  user_id uuid NOT NULL,
  household_id uuid NOT NULL,
  digest_date date NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, household_id, digest_date)
);
GRANT ALL ON public.expiry_notification_deliveries TO service_role;
ALTER TABLE public.expiry_notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS items_household_expires_idx ON public.items (household_id, expires_on) WHERE expires_on IS NOT NULL;