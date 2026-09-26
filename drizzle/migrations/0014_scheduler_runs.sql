CREATE TABLE public.scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  pairs_processed integer NOT NULL DEFAULT 0,
  queries_run integer NOT NULL DEFAULT 0,
  messages_sent integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  note text
);
GRANT ALL ON public.scheduler_runs TO service_role;
ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX scheduler_runs_started_idx ON public.scheduler_runs (started_at DESC);
COMMENT ON TABLE public.scheduler_runs IS 'Server-only log of scheduled job runs; read by the admin console. No client policies by design.';