CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read the public signup switch"
ON public.app_settings FOR SELECT
TO anon, authenticated
USING (key = 'signups_enabled');

CREATE TABLE public.signup_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL UNIQUE,
  email_masked text NOT NULL,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  user_id uuid
);

GRANT ALL ON public.signup_invites TO service_role;

ALTER TABLE public.signup_invites ENABLE ROW LEVEL SECURITY;
