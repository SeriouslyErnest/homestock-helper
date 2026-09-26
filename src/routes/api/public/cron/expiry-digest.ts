import { createFileRoute } from "@tanstack/react-router";

const BATCH = 500;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
}

export const Route = createFileRoute("/api/public/cron/expiry-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { safeEqual, sendTelegramMessage, escapeHtml, expiryNotificationsEnabled, APP_URL } =
          await import("@/lib/telegram.server");

        // Caller check: token lives only in a locked table read by the cron job.
        const given = request.headers.get("x-cron-token") ?? "";
        const { data: tok } = await supabaseAdmin
          .from("cron_tokens")
          .select("token")
          .eq("name", "expiry_digest")
          .maybeSingle();
        if (!tok?.token || !safeEqual(given, tok.token)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let queries = 1;
        if (!(await expiryNotificationsEnabled())) {
          return Response.json({ ok: true, skipped: "disabled" });
        }
        queries++;

        const { data: run } = await supabaseAdmin
          .from("scheduler_runs")
          .insert({ job_name: "expiry-digest" })
          .select("id")
          .single();

        const today = new Date().toISOString().slice(0, 10);
        const horizon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        let pairs = 0;
        let sent = 0;
        let errors = 0;
        let offset = 0;

        try {
          for (;;) {
            const { data: prefs } = await supabaseAdmin
              .from("expiry_notification_prefs")
              .select("user_id, household_id, notice_days")
              .eq("enabled", true)
              .order("user_id")
              .order("household_id")
              .range(offset, offset + BATCH - 1);
            queries++;
            const batch = prefs ?? [];
            if (batch.length === 0) break;
            offset += batch.length;

            const userIds = [...new Set(batch.map((p) => p.user_id))];
            const homeIds = [...new Set(batch.map((p) => p.household_id))];
            const [links, members, homes, items, done] = await Promise.all([
              supabaseAdmin
                .from("telegram_links")
                .select("user_id, chat_id")
                .in("user_id", userIds),
              supabaseAdmin
                .from("household_members")
                .select("user_id, household_id")
                .in("household_id", homeIds)
                .in("user_id", userIds),
              supabaseAdmin.from("households").select("id, name, show_expiry").in("id", homeIds),
              supabaseAdmin
                .from("items")
                .select("household_id, name, expires_on, quantity")
                .in("household_id", homeIds)
                .gt("quantity", 0)
                .not("expires_on", "is", null)
                .lte("expires_on", horizon)
                .order("expires_on"),
              supabaseAdmin
                .from("expiry_notification_deliveries")
                .select("user_id, household_id")
                .eq("digest_date", today)
                .in("user_id", userIds),
            ]);
            queries += 5;

            const chatOf = new Map((links.data ?? []).map((l) => [l.user_id, l.chat_id]));
            const memberSet = new Set(
              (members.data ?? []).map((m) => `${m.user_id}:${m.household_id}`),
            );
            const homeOf = new Map((homes.data ?? []).map((h) => [h.id, h]));
            const doneSet = new Set((done.data ?? []).map((d) => `${d.user_id}:${d.household_id}`));

            for (const p of batch) {
              const key = `${p.user_id}:${p.household_id}`;
              const chatId = chatOf.get(p.user_id);
              const home = homeOf.get(p.household_id);
              if (!chatId || !home || !home.show_expiry || !memberSet.has(key) || doneSet.has(key))
                continue;
              pairs++;
              const due = (items.data ?? []).filter(
                (i) =>
                  i.household_id === p.household_id &&
                  i.expires_on &&
                  daysBetween(today, i.expires_on) <= p.notice_days,
              );
              if (due.length === 0) continue;

              const { error: claimErr } = await supabaseAdmin
                .from("expiry_notification_deliveries")
                .insert({
                  user_id: p.user_id,
                  household_id: p.household_id,
                  digest_date: today,
                  item_count: due.length,
                });
              queries++;
              if (claimErr) continue; // already sent today

              const lines = due.slice(0, 15).map((i) => {
                const d = daysBetween(today, i.expires_on!);
                const when =
                  d < 0 ? "expired" : d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
                return `• ${escapeHtml(i.name)} — ${when}`;
              });
              if (due.length > 15) lines.push(`…and ${due.length - 15} more`);
              const res = await sendTelegramMessage(
                Number(chatId),
                `🍅 <b>${escapeHtml(home.name)}</b> — use soon\n${lines.join("\n")}\n\n${APP_URL}/inventory`,
              );
              if (res.ok) sent++;
              else {
                errors++;
                await supabaseAdmin
                  .from("expiry_notification_deliveries")
                  .update({ status: "failed" })
                  .eq("user_id", p.user_id)
                  .eq("household_id", p.household_id)
                  .eq("digest_date", today);
                queries++;
              }
              await new Promise((r) => setTimeout(r, 40));
            }
            if (batch.length < BATCH) break;
          }
        } catch (e) {
          errors++;
          console.error("expiry-digest failed", e instanceof Error ? e.message : "unknown");
        }

        if (run?.id) {
          await supabaseAdmin
            .from("scheduler_runs")
            .update({
              finished_at: new Date().toISOString(),
              status: errors ? "partial" : "ok",
              pairs_processed: pairs,
              queries_run: queries + 1,
              messages_sent: sent,
              errors,
            })
            .eq("id", run.id);
        }
        return Response.json({ ok: true, pairs, sent, errors });
      },
    },
  },
});
