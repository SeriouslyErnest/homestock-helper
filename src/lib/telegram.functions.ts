import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const telegramStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readSetting, expiryNotificationsEnabled } = await import("./telegram.server");
    const [enabled, bot, link, prefs] = await Promise.all([
      expiryNotificationsEnabled(),
      readSetting<{ username?: string }>("telegram_bot"),
      context.supabase
        .from("telegram_links")
        .select("linked_at, active")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("expiry_notification_prefs")
        .select("household_id, enabled, notice_days")
        .eq("user_id", context.userId),
    ]);
    return {
      featureEnabled: enabled,
      botUsername: bot?.username ?? null,
      linked: !!link.data && link.data.active !== false,
      stopped: !!link.data && link.data.active === false,
      linkedAt: link.data?.linked_at ?? null,
      prefs: (prefs.data ?? []).map((p) => ({
        householdId: p.household_id,
        enabled: p.enabled,
        noticeDays: p.notice_days,
      })),
    };
  });

/** Short-lived, single-use, hashed token; the link carries no personal data. */
export const createTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readSetting, sha256Hex } = await import("./telegram.server");
    const bot = await readSetting<{ username?: string }>("telegram_bot");
    if (!bot?.username) throw new Error("Telegram isn't set up yet.");
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("telegram_link_tokens")
      .delete()
      .eq("user_id", context.userId)
      .is("used_at", null);
    const { error } = await supabaseAdmin.from("telegram_link_tokens").insert({
      token_hash: await sha256Hex(token),
      user_id: context.userId,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (error) throw new Error("Couldn't start linking. Try again.");
    return { url: `https://t.me/${bot.username}?start=${token}` };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("telegram_links")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't disconnect. Try again.");
    return { ok: true };
  });

export const setExpiryPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { householdId: string; enabled: boolean; noticeDays: number }) => {
    const nd = Math.floor(Number(input.noticeDays));
    if (!(nd >= 0 && nd <= 30)) throw new Error("Pick 0–30 days");
    if (typeof input.householdId !== "string" || input.householdId.length < 10)
      throw new Error("Invalid home");
    return { householdId: input.householdId, enabled: !!input.enabled, noticeDays: nd };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expiry_notification_prefs").upsert(
      {
        user_id: context.userId,
        household_id: data.householdId,
        enabled: data.enabled,
        notice_days: data.noticeDays,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,household_id" },
    );
    if (error) throw new Error("Couldn't save. Try again.");
    return { ok: true };
  });
