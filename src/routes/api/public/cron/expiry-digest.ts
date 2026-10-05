import { createFileRoute } from "@tanstack/react-router";

const BATCH = 500;
const MAX_BUTTONS = 5;

type Stage = "advance" | "day";

export const Route = createFileRoute("/api/public/cron/expiry-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          safeEqual,
          sendTelegramMessage,
          escapeHtml,
          expiryNotificationsEnabled,
          isPermanentFailure,
          markChatInactive,
          APP_URL,
        } = await import("@/lib/telegram.server");
        const { daysBetweenDates } = await import("@/lib/stock-rules");
        const { shortDate, todayIso } = await import("@/lib/telegram-bot.server");

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

        const today = todayIso();
        const horizon = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
        let pairs = 0;
        let sent = 0;
        let errors = 0;
        let offset = 0;
        // One chat may hold several accounts in the same home: message it once.
        const sentChatHome = new Set<string>();

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
            const [links, members, homes, items, acks, reminders] = await Promise.all([
              supabaseAdmin
                .from("telegram_links")
                .select("user_id, chat_id")
                .eq("active", true)
                .in("user_id", userIds),
              supabaseAdmin
                .from("household_members")
                .select("user_id, household_id")
                .in("household_id", homeIds)
                .in("user_id", userIds),
              supabaseAdmin.from("households").select("id, name, show_expiry").in("id", homeIds),
              supabaseAdmin
                .from("items")
                .select("id, household_id, name, expires_on, quantity")
                .in("household_id", homeIds)
                .gt("quantity", 0)
                .not("expires_on", "is", null)
                .gte("expires_on", today)
                .lte("expires_on", horizon)
                .order("expires_on"),
              supabaseAdmin
                .from("expiry_acks")
                .select("user_id, item_id, expires_on")
                .in("user_id", userIds),
              supabaseAdmin
                .from("expiry_reminders")
                .select("user_id, item_id, expires_on, stage")
                .in("user_id", userIds)
                .gte("expires_on", today),
            ]);
            queries += 6;

            const chatOf = new Map((links.data ?? []).map((l) => [l.user_id, l.chat_id]));
            const memberSet = new Set(
              (members.data ?? []).map((m) => `${m.user_id}:${m.household_id}`),
            );
            const homeOf = new Map((homes.data ?? []).map((h) => [h.id, h]));
            // Acknowledged = same person, same stock record, same date. A new date resets it.
            const ackSet = new Set(
              (acks.data ?? []).map((a) => `${a.user_id}:${a.item_id}:${a.expires_on}`),
            );
            const doneSet = new Set(
              (reminders.data ?? []).map(
                (r) => `${r.user_id}:${r.item_id}:${r.expires_on}:${r.stage}`,
              ),
            );

            for (const p of batch) {
              const key = `${p.user_id}:${p.household_id}`;
              const chatId = chatOf.get(p.user_id);
              const home = homeOf.get(p.household_id);
              if (!chatId || !home || !home.show_expiry || !memberSet.has(key)) continue;
              pairs++;

              // At most one advance reminder and one expiry-day reminder per expiry.
              const due = (items.data ?? [])
                .filter((i) => i.household_id === p.household_id && i.expires_on)
                .map((i) => {
                  const d = daysBetweenDates(today, i.expires_on!);
                  const stage: Stage | null =
                    d === 0 ? "day" : d > 0 && d <= p.notice_days ? "advance" : null;
                  return { ...i, d, stage };
                })
                .filter(
                  (i) =>
                    i.stage &&
                    !ackSet.has(`${p.user_id}:${i.id}:${i.expires_on}`) &&
                    !doneSet.has(`${p.user_id}:${i.id}:${i.expires_on}:${i.stage}`),
                );
              if (due.length === 0) continue;

              const chatHome = `${chatId}:${p.household_id}`;
              const duplicate = sentChatHome.has(chatHome);
              // Claim first (idempotent): only rows we inserted get sent.
              const { data: claimed } = await supabaseAdmin
                .from("expiry_reminders")
                .upsert(
                  due.map((i) => ({
                    user_id: p.user_id,
                    item_id: i.id,
                    expires_on: i.expires_on!,
                    stage: i.stage!,
                    status: duplicate ? "deduped" : "sent",
                  })),
                  { onConflict: "user_id,item_id,expires_on,stage", ignoreDuplicates: true },
                )
                .select("item_id");
              queries++;
              const claimedIds = new Set((claimed ?? []).map((c) => c.item_id));
              const toSend = due.filter((i) => claimedIds.has(i.id));
              if (toSend.length === 0 || duplicate) continue;
              sentChatHome.add(chatHome);

              const when = (d: number) =>
                d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
              let html: string;
              if (toSend.length === 1) {
                const i = toSend[0]!;
                const n = Number(i.quantity);
                html = `⏳ <b>${escapeHtml(i.name)}</b> expires ${when(i.d)}\n${n} ${n === 1 ? "item expires" : "items expire"} on ${shortDate(i.expires_on!)} · ${escapeHtml(home.name)}`;
              } else {
                const lines = toSend.slice(0, 15).map((i) => {
                  const n = Number(i.quantity);
                  return `${escapeHtml(i.name)} — ${n} ${n === 1 ? "expires" : "expire"} ${when(i.d)}`;
                });
                if (toSend.length > 15) lines.push(`…and ${toSend.length - 15} more`);
                html = `⚠️ <b>${toSend.length} things are expiring soon in ${escapeHtml(home.name)}</b>\n\n${lines.join("\n")}`;
              }
              const buttons = toSend.slice(0, MAX_BUTTONS).map((i) => [
                {
                  text: toSend.length === 1 ? "Got it" : `Got it: ${i.name}`.slice(0, 60),
                  callback_data: `a:${i.id}`,
                },
              ]);
              buttons.push([{ text: "Open HomeStock", url: `${APP_URL}/inventory` }]);
              const res = await sendTelegramMessage(Number(chatId), html, buttons);
              if (res.ok) sent++;
              else {
                errors++;
                if (isPermanentFailure(res.description)) await markChatInactive(Number(chatId));
                await supabaseAdmin
                  .from("expiry_reminders")
                  .update({ status: "failed" })
                  .eq("user_id", p.user_id)
                  .in(
                    "item_id",
                    toSend.map((i) => i.id),
                  )
                  .gte("expires_on", today);
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
