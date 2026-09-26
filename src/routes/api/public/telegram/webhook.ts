import { createFileRoute } from "@tanstack/react-router";

type Update = {
  update_id?: number;
  message?: { chat?: { id?: number; type?: string }; text?: string };
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
        const chatId = update.message?.chat?.id;
        const text = (update.message?.text ?? "").trim();
        if (!chatId || update.message?.chat?.type !== "private") {
          return Response.json({ ok: true });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const startMatch = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/.exec(text);
        if (startMatch) {
          const token = startMatch[1];
          if (!token) {
            await sendTelegramMessage(
              chatId,
              `👋 This is the HomeStock bot.\n\nTo get expiry reminders, open HomeStock → <b>More</b> → <b>Telegram reminders</b> and tap <b>Connect Telegram</b>.\n\n${APP_URL}/more`,
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
              "That link has expired or was already used. Open HomeStock → More → Telegram reminders and tap Connect again.",
            );
            return Response.json({ ok: true });
          }
          // One chat belongs to one account; re-linking moves it.
          await supabaseAdmin.from("telegram_links").delete().eq("chat_id", chatId);
          const { error } = await supabaseAdmin
            .from("telegram_links")
            .upsert(
              { user_id: claimed.user_id, chat_id: chatId, linked_at: nowIso },
              { onConflict: "user_id" },
            );
          await sendTelegramMessage(
            chatId,
            error
              ? "Something went wrong connecting. Please try again from HomeStock."
              : "✅ Connected to HomeStock. You'll get a short daily note when things in your homes are about to expire. Send /stop any time to disconnect.",
          );
          return Response.json({ ok: true });
        }

        if (/^\/stop(?:@\w+)?$/.test(text)) {
          await supabaseAdmin.from("telegram_links").delete().eq("chat_id", chatId);
          await sendTelegramMessage(chatId, "Disconnected. You won't get any more reminders.");
          return Response.json({ ok: true });
        }

        await sendTelegramMessage(
          chatId,
          "I only send expiry reminders. Manage them in HomeStock → More → Telegram reminders.",
        );
        return Response.json({ ok: true });
      },
    },
  },
});
