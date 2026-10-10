CREATE TABLE public.telegram_chat_state (
  chat_id bigint PRIMARY KEY,
  awaiting text NOT NULL CHECK (awaiting IN ('add')),
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.telegram_chat_state TO service_role;
ALTER TABLE public.telegram_chat_state ENABLE ROW LEVEL SECURITY;