CREATE TABLE public.limit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'households',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX limit_requests_one_open_per_kind ON public.limit_requests (user_id, kind);

GRANT SELECT, INSERT ON public.limit_requests TO authenticated;
GRANT ALL ON public.limit_requests TO service_role;

ALTER TABLE public.limit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can ask for a higher limit"
  ON public.limit_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can see their own request"
  ON public.limit_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.limit_requests IS 'Transient operator inbox: a signed-in user asking for a higher plan limit. Deleted by an operator once handled.';