-- Telegram companion: interactive commands, active home, Got it acknowledgements.
ALTER TABLE public.telegram_links
  ADD COLUMN IF NOT EXISTS telegram_user_id bigint,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Telegram's own active home per chat (separate from the web app's selection).
CREATE TABLE public.telegram_chat_context (
  chat_id bigint PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_chat_context TO service_role;
ALTER TABLE public.telegram_chat_context ENABLE ROW LEVEL SECURITY;

-- Idempotency: each Telegram update is processed once. Only ids are kept.
CREATE TABLE public.telegram_updates (
  update_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

-- Undo for /add: reverses only that one request.
CREATE TABLE public.telegram_undo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shopping_item_id uuid NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_undo TO service_role;
ALTER TABLE public.telegram_undo ENABLE ROW LEVEL SECURITY;

-- Command usage (type + result only, never message text).
CREATE TABLE public.telegram_command_log (
  id bigserial PRIMARY KEY,
  command text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_command_log_created_idx ON public.telegram_command_log (created_at);
GRANT ALL ON public.telegram_command_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.telegram_command_log_id_seq TO service_role;
ALTER TABLE public.telegram_command_log ENABLE ROW LEVEL SECURITY;

-- "Got it": per user, per stock record, per expiry date. A changed date no
-- longer matches, so the acknowledgement resets; new stock records start fresh.
CREATE TABLE public.expiry_acks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  expires_on date NOT NULL,
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','telegram')),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expiry_acks TO authenticated;
GRANT ALL ON public.expiry_acks TO service_role;
ALTER TABLE public.expiry_acks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own acks: read" ON public.expiry_acks FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Own acks: add" ON public.expiry_acks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_household_member(household_id));
CREATE POLICY "Own acks: change" ON public.expiry_acks FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND private.is_household_member(household_id));
CREATE POLICY "Own acks: remove" ON public.expiry_acks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Reminder delivery state: at most one advance and one expiry-day reminder.
CREATE TABLE public.expiry_reminders (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  expires_on date NOT NULL,
  stage text NOT NULL CHECK (stage IN ('advance','day')),
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id, expires_on, stage)
);
GRANT ALL ON public.expiry_reminders TO service_role;
ALTER TABLE public.expiry_reminders ENABLE ROW LEVEL SECURITY;

-- Telegram on/off switch for incidents (separate from expiry reminders).
INSERT INTO public.app_settings (key, value)
VALUES ('telegram_commands_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;