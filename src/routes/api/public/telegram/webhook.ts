import { createFileRoute } from "@tanstack/react-router";

type Update = {
  update_id?: number;
  message?: {
    chat?: { id?: number; type?: string };
    from?: { id?: number; is_bot?: boolean };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number; type?: string } };
  };
};

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { safeEqual, sendTelegramMessage, sha256Hex, APP_URL } =
          await import("@/lib/telegram.server");
        const expected = process.env["TELEGRAM_WEBHOOK_SECRET"] ?? "";
        const given = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!expected || !safeEqual(given, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Telegram updates are small; refuse anything oversized before parsing.
        const MAX_BODY = 64 * 1024;
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
          return Response.json({ ok: true, ignored: "too_large" });
        }
        const raw = await request.text().catch(() => "");
        if (raw.length > MAX_BODY) return Response.json({ ok: true, ignored: "too_large" });
        let update: Update = {};
        try {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === "object") update = parsed as Update;
        } catch {
          return Response.json({ ok: true, ignored: "bad_json" });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Telegram retries deliveries: handle each update once. Only the id is kept.
        if (typeof update.update_id === "number") {
          const { error: dupErr } = await supabaseAdmin
            .from("telegram_updates")
            .insert({ update_id: update.update_id });
          if (dupErr) return Response.json({ ok: true, duplicate: true });
        }

        const chatId =
          update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? undefined;
        if (typeof chatId === "number" && !Number.isSafeInteger(chatId)) {
          return Response.json({ ok: true, ignored: "bad_chat" });
        }
        // Other bots never get answers (stops bot-to-bot loops).
        if (update.message?.from?.is_bot) return Response.json({ ok: true, ignored: "bot" });
        const rawText = update.message?.text;
        const text = (typeof rawText === "string" ? rawText : "").slice(0, 1000).trim();
        const isPrivate = update.message?.chat?.type === "private";

        // Per-chat flood guard for every chat, linked or not. Over the limit we
        // stay silent so a flood can't make the bot send a flood back.
        if (typeof chatId === "number") {
          const { chatUnderLimit } = await import("@/lib/telegram.server");
          const okMin = await chatUnderLimit(chatId, "tg_chat_min", 40, 60);
          const okHour = okMin && (await chatUnderLimit(chatId, "tg_chat_hour", 300, 3600));
          if (!okMin || !okHour) return Response.json({ ok: true, throttled: true });
        }

        const startMatch = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/.exec(text);
        if (chatId && isPrivate && startMatch) {
          const token = startMatch[1];
          if (!token) {
            const { count } = await supabaseAdmin
              .from("telegram_links")
              .select("user_id", { count: "exact", head: true })
              .eq("chat_id", chatId)
              .eq("active", true);
            if (count) {
              const { sendWithKeyboard, WELCOME_TEXT } = await import("@/lib/telegram.server");
              await sendWithKeyboard(chatId, WELCOME_TEXT);
            } else {
              await sendTelegramMessage(
                chatId,
                `👋 This is the HomeStock bot.\n\nTo connect, open HomeStock → <b>More</b> → <b>Telegram</b> and tap <b>Connect Telegram</b>.\n\n${APP_URL}/more`,
              );
            }
            return Response.json({ ok: true });
          }
          // Link codes are long and random; still cap guesses per chat.
          const { chatUnderLimit } = await import("@/lib/telegram.server");
          if (!(await chatUnderLimit(chatId, "tg_link_try", 5, 900))) {
            await sendTelegramMessage(
              chatId,
              "Too many connection attempts. Please wait 15 minutes, then tap Connect in HomeStock again.",
            );
            return Response.json({ ok: true });
          }
          const hash = await sha256Hex(token);
          const nowIso = new Date().toISOString();
          const { data: claimed } = await supabaseAdmin
            .from("telegram_link_tokens")
            .update({ used_at: nowIso })
            .eq("token_hash", hash)
            .is("used_at", null)
            .gt("expires_at", nowIso)
            .select("user_id")
            .maybeSingle();
          if (!claimed) {
            await sendTelegramMessage(
              chatId,
              "That link has expired or was already used. Open HomeStock → More → Telegram and tap Connect again.",
            );
            return Response.json({ ok: true });
          }
          // Many accounts may share one Telegram chat; each account links independently.
          const { error } = await supabaseAdmin.from("telegram_links").upsert(
            {
              user_id: claimed.user_id,
              chat_id: chatId,
              telegram_user_id: update.message?.from?.id ?? null,
              active: true,
              linked_at: nowIso,
            },
            { onConflict: "user_id" },
          );
          // Operators also get an authoritative admin alert destination, kept
          // separate so user-side disconnects never silence admin alerts.
          if (!error) {
            const { data: adminRow } = await supabaseAdmin
              .from("admin_users")
              .select("user_id")
              .eq("user_id", claimed.user_id)
              .maybeSingle();
            if (adminRow) {
              await supabaseAdmin
                .from("telegram_admin_links")
                .upsert(
                  { user_id: claimed.user_id, chat_id: chatId, linked_at: nowIso },
                  { onConflict: "user_id" },
                );
            }
          }
          if (error) {
            await sendTelegramMessage(
              chatId,
              "Something went wrong connecting. Please try again from HomeStock.",
            );
            return Response.json({ ok: true });
          }
          const { sendWithKeyboard, WELCOME_TEXT } = await import("@/lib/telegram.server");
          await sendWithKeyboard(chatId, `✅ Connected.\n\n${WELCOME_TEXT}`);
          const { afterLink } = await import("@/lib/telegram-bot.server");
          const extra = await afterLink(supabaseAdmin, chatId).catch(() => "");
          if (extra) await sendTelegramMessage(chatId, extra);
          return Response.json({ ok: true });
        }

        if (chatId && isPrivate && /^\/stop(?:@\w+)?$/.test(text)) {
          // /stop disconnects every account linked to this chat. Admin alert
          // destinations live in telegram_admin_links and are not touched here.
          await supabaseAdmin.from("telegram_links").delete().eq("chat_id", chatId);
          await supabaseAdmin.from("telegram_chat_context").delete().eq("chat_id", chatId);
          const { telegramCall } = await import("@/lib/telegram.server");
          await telegramCall("sendMessage", {
            chat_id: chatId,
            text: "Disconnected all HomeStock accounts from this chat. You can reconnect any time from inside HomeStock.",
            reply_markup: { remove_keyboard: true },
          });
          return Response.json({ ok: true });
        }

        try {
          const { handleBotUpdate } = await import("@/lib/telegram-bot.server");
          await handleBotUpdate(supabaseAdmin, update);
        } catch (e) {
          console.error("telegram update failed", e instanceof Error ? e.message : "unknown");
        }
        return Response.json({ ok: true });
      },
    },
  },
});
