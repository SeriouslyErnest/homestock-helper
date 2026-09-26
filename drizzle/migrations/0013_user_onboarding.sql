CREATE TABLE public.user_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  welcome_status text NOT NULL DEFAULT 'not_started' CHECK (welcome_status IN ('not_started','in_progress','completed','skipped')),
  current_step int NOT NULL DEFAULT 0,
  tips_seen text[] NOT NULL DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;
GRANT ALL ON public.user_onboarding TO service_role;
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own onboarding read" ON public.user_onboarding FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own onboarding insert" ON public.user_onboarding FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own onboarding update" ON public.user_onboarding FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Existing accounts already know the app; don't greet them with a tour.
INSERT INTO public.user_onboarding (user_id, welcome_status, completed_at)
SELECT id, 'completed', now() FROM auth.users ON CONFLICT DO NOTHING;