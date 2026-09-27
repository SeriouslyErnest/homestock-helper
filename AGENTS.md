<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Every scheduled job writes one row per run to public.scheduler_runs (queries_run, messages_sent, errors) — the admin dashboard's scheduler-load panel and cost warnings read only from it.
- Telegram: dedicated bot, direct Bot API from server only (no relay); token/webhook secret in protected secrets; cron caller token in locked public.cron_tokens read by pg_cron.
- Telegram links: one chat may serve many accounts (telegram_links keyed by user_id, no chat_id uniqueness); admin alert destinations live in telegram_admin_links — separate and authoritative, never touched by user-side disconnects or /stop.
