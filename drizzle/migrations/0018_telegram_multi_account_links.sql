-- Allow one Telegram chat to serve multiple app accounts.
-- telegram_links PK stays user_id (1 account -> 1 chat); drop the chat_id uniqueness.
ALTER TABLE public.telegram_links DROP CONSTRAINT IF EXISTS telegram_links_chat_id_key;
DROP INDEX IF EXISTS public.telegram_links_chat_id_key;

-- Separate, authoritative mapping for admin alert destinations (PRD section 10).
-- Disconnecting a user mapping must never remove an admin mapping, and vice versa.
CREATE TABLE public.telegram_admin_links (
  user_id uuid PRIMARY KEY,
  chat_id bigint NOT NULL,
  linked_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_admin_links TO authenticated;
GRANT ALL ON public.telegram_admin_links TO service_role;
ALTER TABLE public.telegram_admin_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage own telegram admin link"
  ON public.telegram_admin_links FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Backfill: existing linked admins keep receiving alerts via the new table.
INSERT INTO public.telegram_admin_links (user_id, chat_id, linked_at)
SELECT l.user_id, l.chat_id, l.linked_at
FROM public.telegram_links l
JOIN public.admin_users a ON a.user_id = l.user_id
ON CONFLICT (user_id) DO NOTHING;