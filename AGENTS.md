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
- Admin console requires a second factor: every admin server fn demands aal2 (TOTP-verified session); one-time recovery codes in public.admin_recovery_codes are salted hashes and only let an operator re-enroll, never bypass the gate.
- Telegram companion: the webhook only orchestrates; stock/low/expiry rules live in src/lib/stock-rules.ts shared with the app, Telegram can never change stock, and every command re-checks membership via the chat's active telegram_links — why: Telegram and the app must never disagree or bypass home access.
- Expiry acknowledgements are keyed by (user, item row, expires_on) in expiry_acks and reminder stages in expiry_reminders — why: date changes reset naturally and split stock starts fresh.
- Test log: docs/TESTING.md records what was tested and when; update it after every test run.

- Abuse limits: per-user throttles use public.rate_limit_hits (join-code misses 10/h, promo misses 5/15min in SQL; recovery-code misses 5/15min and Open Food Facts lookups 30/min via admin.server underLimit). Text lengths and https-only image URLs are enforced by BEFORE triggers on items/shopping_items/households/profiles/household_members/limit_requests — why: every writer (browser or server) hits the same rule.
- Homes are created only via create_household (no direct INSERT policy); item/shopping updates carry WITH CHECK membership; telegram_admin_links is written only by the bot webhook — why: stops plan-limit bypass, moving rows into others' homes, and redirecting admin alerts.
