// Server-only Telegram helpers. The bot token is read from protected secret
// storage at call time and never logged, returned or stored anywhere else.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function telegramCall(
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; description?: string | undefined; result?: unknown }> {
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

export type InlineButton = { text: string; callback_data?: string; url?: string };

export function sendTelegramMessage(chatId: number, html: string, buttons?: InlineButton[][]) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons && buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

/** Button grid pinned under the chat; each tap sends its label as a message. */
export const KEYBOARD_BUTTONS: Record<string, string> = {
  "🛒 Shopping": "shopping",
  "⚠️ Low stock": "low",
  "⏳ Expiring": "expiring",
  "➕ Add item": "add",
  "🏠 Home": "home",
  "❓ Help": "help",
};

export const COMMAND_KEYBOARD = {
  keyboard: [
    [{ text: "🛒 Shopping" }, { text: "⚠️ Low stock" }],
    [{ text: "⏳ Expiring" }, { text: "➕ Add item" }],
    [{ text: "🏠 Home" }, { text: "❓ Help" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Tap a button or type /add milk",
};

/** Send a message that also (re)shows the button grid. */
export function sendWithKeyboard(chatId: number, html: string) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: COMMAND_KEYBOARD,
  });
}

export const WELCOME_TEXT =
  "👋 <b>Welcome to HomeStock on Telegram!</b>\n\n" +
  "Use the buttons below to check your home at any time:\n" +
  "🛒 <b>Shopping</b> — what's on the list\n" +
  "⚠️ <b>Low stock</b> — running low or out\n" +
  "⏳ <b>Expiring</b> — use these soon\n" +
  "➕ <b>Add item</b> — add to Shopping (or type /add milk)\n" +
  "🏠 <b>Home</b> — switch home\n\n" +
  "Send /stop any time to disconnect.";

/** Telegram says delivery to this chat is permanently impossible (blocked, deleted, …). */
export function isPermanentFailure(description: string | undefined): boolean {
  return /blocked|chat not found|user is deactivated|bot can't initiate|kicked/i.test(
    description ?? "",
  );
}

/** Stop delivering to a chat that blocked the bot; the person can reconnect later. */
export async function markChatInactive(chatId: number): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("telegram_links").update({ active: false }).eq("chat_id", chatId);
}

/** The six everyday commands shown in Telegram's menu. */
export const BOT_COMMANDS = [
  { command: "add", description: "Add one thing to Shopping" },
  { command: "shopping", description: "Show the Shopping list" },
  { command: "low", description: "Show low and out-of-stock items" },
  { command: "expiring", description: "Show what's expiring soon" },
  { command: "home", description: "Choose which home to use" },
  { command: "help", description: "Show these commands" },
];

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

/** Stable per-chat key so chats (linked or not) can share the rate_limit_hits table. */
export async function chatKey(chatId: number): Promise<string> {
  const h = await sha256Hex(`tgchat:${chatId}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Per-chat throttle; works before we know which account (if any) the chat belongs to. */
export async function chatUnderLimit(
  chatId: number,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { underLimit } = await import("./admin.server");
  return underLimit(await chatKey(chatId), bucket, max, windowSeconds);
}

/** Strip control / invisible / bidi characters and collapse whitespace in user text. */
export function cleanText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
