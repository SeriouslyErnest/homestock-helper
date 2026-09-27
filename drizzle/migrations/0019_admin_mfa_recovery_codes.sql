CREATE TABLE public.admin_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_recovery_codes_user_idx ON public.admin_recovery_codes (user_id);

-- Only privileged server code (service role) ever touches these hashes.
GRANT ALL ON public.admin_recovery_codes TO service_role;

ALTER TABLE public.admin_recovery_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_recovery_codes IS 'One-time admin console recovery codes, stored only as salted hashes.';