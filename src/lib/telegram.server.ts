// Server-only Telegram helpers. The bot token is read from protected secret
// storage at call time and never logged, returned or stored anywhere else.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function telegramCall(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return { ok: false, description: "bot not configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    };
    return { ok: !!json.ok, description: json.description, result: json.result };
  } catch {
    return { ok: false, description: "network error" };
  }
}

export function sendTelegramMessage(chatId: number, html: string) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readSetting<T>(key: string): Promise<T | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

export async function expiryNotificationsEnabled(): Promise<boolean> {
  const v = await readSetting<{ enabled?: boolean }>("expiry_daily_notifications_enabled");
  return v?.enabled === true;
}

export const APP_URL = "https://homestock-helper.lovable.app";
