ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS bootstrap boolean;
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_bootstrap_once ON public.admin_users ((bootstrap)) WHERE bootstrap;