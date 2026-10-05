import { createFileRoute } from "@tanstack/react-router";

type Update = {
  update_id?: number;
  message?: {
    chat?: { id?: number; type?: string };
    from?: { id?: number };
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
        const update = (await request.json().catch(() => ({}))) as Update;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Telegram retries deliveries: handle each update once. Only the id is kept.
        if (typeof update.update_id === "number") {
          const { error: dupErr } = await supabaseAdmin
            .from("telegram_updates")
            .insert({ update_id: update.update_id });
          if (dupErr) return Response.json({ ok: true, duplicate: true });
        }

        const chatId = update.message?.chat?.id;
        const text = (update.message?.text ?? "").trim();
        const isPrivate = update.message?.chat?.type === "private";

        const startMatch = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/.exec(text);
        if (chatId && isPrivate && startMatch) {
          const token = startMatch[1];
          if (!token) {
            const { count } = await supabaseAdmin
              .from("telegram_links")
              .select("user_id", { count: "exact", head: true })
              .eq("chat_id", chatId)
              .eq("active", true);
            await sendTelegramMessage(
              chatId,
              count
                ? "✅ This chat is connected to HomeStock. Send /help to see what I can do."
                : `👋 This is the HomeStock bot.\n\nTo connect, open HomeStock → <b>More</b> → <b>Telegram</b> and tap <b>Connect Telegram</b>.\n\n${APP_URL}/more`,
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
          let extra = "";
          if (!error) {
            const { afterLink } = await import("@/lib/telegram-bot.server");
            extra = await afterLink(supabaseAdmin, chatId).catch(() => "");
          }
          await sendTelegramMessage(
            chatId,
            error
              ? "Something went wrong connecting. Please try again from HomeStock."
              : `✅ Connected to HomeStock. ${extra}\n\nTry /add milk, /shopping, /low or /expiring. Send /help any time, or /stop to disconnect.`,
          );
          return Response.json({ ok: true });
        }

        if (chatId && isPrivate && /^\/stop(?:@\w+)?$/.test(text)) {
          // /stop disconnects every account linked to this chat. Admin alert
          // destinations live in telegram_admin_links and are not touched here.
          await supabaseAdmin.from("telegram_links").delete().eq("chat_id", chatId);
          await supabaseAdmin.from("telegram_chat_context").delete().eq("chat_id", chatId);
          await sendTelegramMessage(
            chatId,
            "Disconnected all HomeStock accounts from this chat. You can reconnect any time from inside HomeStock.",
          );
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
