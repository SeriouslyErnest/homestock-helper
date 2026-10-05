// Interactive Telegram companion. Orchestrates only: shopping, low-stock and
// expiry rules come from the shared app logic (stock-rules). Every command
// re-checks that the linked account still belongs to the home it touches.
import {
  DEFAULT_EXPIRY_WINDOW_DAYS,
  daysBetweenDates,
  isLow,
  productKey,
  productStatus,
} from "./stock-rules";
import {
  APP_URL,
  BOT_COMMANDS,
  cleanText,
  escapeHtml,
  isPermanentFailure,
  markChatInactive,
  readSetting,
  sendTelegramMessage,
  telegramCall,
  type InlineButton,
} from "./telegram.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Home = { householdId: string; name: string; userId: string };
type Ctx = { db: Admin; chatId: number; userIds: string[] };

const OPEN = (path = ""): InlineButton => ({ text: "Open HomeStock", url: `${APP_URL}${path}` });
const MAX_LIST = 25;
const UNDO_HOURS = 24;

export const HELP_TEXT =
  "<b>HomeStock Telegram commands</b>\n\n" +
  "/add &lt;item&gt; — add one thing to Shopping\n" +
  "/shopping — show Shopping\n" +
  "/low — show low/out-of-stock items\n" +
  "/expiring — show expiring items\n" +
  "/home — choose household\n" +
  "/help — show this help\n\n" +
  'Example: /add eggs 12\nThis adds one Shopping request called "eggs 12".';

export function shortDate(iso: string): string {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(iso.slice(8, 10))} ${m[Number(iso.slice(5, 7)) - 1] ?? ""}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function send(chatId: number, html: string, buttons?: InlineButton[][]) {
  const res = await sendTelegramMessage(chatId, html, buttons);
  if (!res.ok && isPermanentFailure(res.description)) await markChatInactive(chatId);
  return res;
}

async function log(db: Admin, command: string, status: string) {
  await db.from("telegram_command_log").insert({ command, status });
}

/** Homes the chat's linked accounts can access right now (one entry per home). */
async function homesFor(ctx: Ctx): Promise<Home[]> {
  if (ctx.userIds.length === 0) return [];
  const { data } = await ctx.db
    .from("household_members")
    .select("user_id, household_id, households(name)")
    .in("user_id", ctx.userIds);
  const seen = new Map<string, Home>();
  // userIds are ordered by link date, so the first-linked account represents a shared home.
  for (const uid of ctx.userIds) {
    for (const r of data ?? []) {
      if (r.user_id !== uid || seen.has(r.household_id)) continue;
      const h = r.households as unknown as { name: string } | null;
      seen.set(r.household_id, { householdId: r.household_id, name: h?.name ?? "Home", userId: uid });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Telegram's own active home, re-validated against current membership. */
async function activeHome(ctx: Ctx, homes: Home[]): Promise<Home | null> {
  const { data } = await ctx.db
    .from("telegram_chat_context")
    .select("user_id, household_id")
    .eq("chat_id", ctx.chatId)
    .maybeSingle();
  if (data) {
    const ok = homes.find(
      (h) => h.householdId === data.household_id && ctx.userIds.includes(data.user_id),
    );
    if (ok) return { ...ok, userId: data.user_id };
    await ctx.db.from("telegram_chat_context").delete().eq("chat_id", ctx.chatId);
    if (homes.length !== 1) return null;
  }
  if (homes.length === 1) {
    await setHome(ctx, homes[0]!);
    return homes[0]!;
  }
  return null;
}

async function setHome(ctx: Ctx, home: Home) {
  await ctx.db.from("telegram_chat_context").upsert(
    {
      chat_id: ctx.chatId,
      user_id: home.userId,
      household_id: home.householdId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chat_id" },
  );
}

function homeButtons(homes: Home[], activeId?: string): InlineButton[][] {
  return homes.slice(0, 10).map((h) => [
    {
      text: `${h.name}${h.householdId === activeId ? " ✓" : ""}`.slice(0, 60),
      callback_data: `h:${h.householdId}`,
    },
  ]);
}

async function needHome(ctx: Ctx, homes: Home[], removed = false) {
  if (homes.length === 0) {
    await send(ctx.chatId, "You're not in any HomeStock home yet. Set one up in HomeStock first.", [
      [OPEN("/more")],
    ]);
    return;
  }
  await send(
    ctx.chatId,
    removed
      ? "You no longer have access to that HomeStock home. Choose another:"
      : "Choose which HomeStock home to use first.",
    homeButtons(homes),
  );
}

// ---------------- commands ----------------

async function cmdHome(ctx: Ctx) {
  const homes = await homesFor(ctx);
  if (homes.length === 0) return needHome(ctx, homes);
  const active = await activeHome(ctx, homes);
  if (homes.length === 1) {
    return send(ctx.chatId, `Active HomeStock home:\n🏠 <b>${escapeHtml(homes[0]!.name)}</b>`);
  }
  await send(
    ctx.chatId,
    active
      ? `Active HomeStock home:\n🏠 <b>${escapeHtml(active.name)}</b>\n\nChoose another:`
      : "Choose which HomeStock home to use:",
    homeButtons(homes, active?.householdId),
  );
}

async function cmdAdd(ctx: Ctx, home: Home, text: string) {
  const name = cleanText(text);
  if (!name) {
    await send(ctx.chatId, "What should I add?\nTry /add milk");
    return "empty";
  }
  if (name.length > 200) {
    await send(ctx.chatId, "I couldn't add that request. Please shorten the item name and try again.");
    return "invalid";
  }
  // Caps so a linked chat can't flood a home's list.
  const { underLimit } = await import("./admin.server");
  if (!(await underLimit(home.userId, "tg_add_day", 60, 86400))) {
    await send(ctx.chatId, "That's a lot of additions from Telegram today. Please use the app for more.", [
      [OPEN("/shopping")],
    ]);
    return "throttled";
  }
  const { count: pendingCount } = await ctx.db
    .from("shopping_items")
    .select("id", { count: "exact", head: true })
    .eq("household_id", home.householdId)
    .eq("status", "pending");
  if ((pendingCount ?? 0) >= 300) {
    await send(ctx.chatId, "The Shopping list is very full. Tick off or remove some items in the app first.", [
      [OPEN("/shopping")],
    ]);
    return "full";
  }
  const { data: row, error } = await ctx.db
    .from("shopping_items")
    .insert({ household_id: home.householdId, name, quantity: 1, requested_by: home.userId })
    .select("id")
    .single();
  if (error || !row) {
    await send(ctx.chatId, "I couldn't add that request. Please shorten the item name and try again.");
    return "invalid";
  }
  const { data: undo } = await ctx.db
    .from("telegram_undo")
    .insert({ user_id: home.userId, shopping_item_id: row.id })
    .select("id")
    .single();
  const buttons: InlineButton[] = [];
  if (undo) buttons.push({ text: "Undo", callback_data: `u:${undo.id}` });
  buttons.push(OPEN("/shopping"));
  await send(
    ctx.chatId,
    `Added <b>${escapeHtml(name)}</b> to <b>${escapeHtml(home.name)}</b>.`,
    [buttons],
  );
  return "ok";
}

async function loadItems(db: Admin, householdId: string) {
  const { data } = await db
    .from("items")
    .select("id, name, barcode, quantity, min_quantity, expires_on")
    .eq("household_id", householdId)
    .order("name");
  return (data ?? []).map((i) => ({
    ...i,
    quantity: Number(i.quantity),
    min_quantity: Number(i.min_quantity),
  }));
}

function trimList(lines: string[]): string[] {
  if (lines.length <= MAX_LIST) return lines;
  return [...lines.slice(0, MAX_LIST), `…and ${lines.length - MAX_LIST} more.`];
}

async function cmdShopping(ctx: Ctx, home: Home) {
  const [items, shopping, members] = await Promise.all([
    loadItems(ctx.db, home.householdId),
    ctx.db
      .from("shopping_items")
      .select("name, quantity, item_id, requested_by")
      .eq("household_id", home.householdId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    ctx.db
      .from("household_members")
      .select("user_id, display_name")
      .eq("household_id", home.householdId),
  ]);
  const pending = shopping.data ?? [];
  const nameOf = new Map((members.data ?? []).map((m) => [m.user_id, m.display_name]));
  const listed = new Set(pending.map((p) => p.item_id).filter(Boolean));
  // Same rule as the Shopping page's "Running low" suggestions.
  const low = items.filter(
    (i) => (isLow(i) || i.quantity <= 0) && i.min_quantity > 0 && !listed.has(i.id),
  );
  const lines: string[] = [];
  if (low.length) {
    lines.push("<b>Running Low</b>");
    for (const i of low)
      lines.push(
        `${escapeHtml(i.name)} — ${i.quantity <= 0 ? "Out of Stock" : `${i.quantity} left, keep ${i.min_quantity}`}`,
      );
  }
  if (pending.length) {
    if (lines.length) lines.push("");
    lines.push("<b>Buy Requests</b>");
    for (const p of pending) {
      const q = Number(p.quantity) > 1 ? ` ×${Number(p.quantity)}` : "";
      const who = p.requested_by ? nameOf.get(p.requested_by) : null;
      lines.push(`${escapeHtml(p.name)}${q}${who ? ` — requested by ${escapeHtml(who)}` : ""}`);
    }
  }
  const body = lines.length ? trimList(lines).join("\n") : "Nothing to buy right now. 🎉";
  await send(ctx.chatId, `🛒 <b>Shopping — ${escapeHtml(home.name)}</b>\n\n${body}`, [
    [OPEN("/shopping")],
  ]);
}

async function cmdLow(ctx: Ctx, home: Home) {
  const items = await loadItems(ctx.db, home.householdId);
  const groups = new Map<string, typeof items>();
  for (const i of items) {
    const k = productKey(i);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const out: string[] = [];
  const low: string[] = [];
  for (const rows of groups.values()) {
    const s = productStatus(rows);
    if (s.min <= 0) continue; // nothing to keep = never flagged (used-up items stay quiet)
    const name = escapeHtml(rows[0]!.name);
    if (s.status === "out") out.push(`${name} — Out of Stock`);
    else if (s.status === "low") low.push(`${name} — ${s.total} left, keep ${s.min}`);
  }
  const lines = [...out, ...low];
  await send(
    ctx.chatId,
    `📉 <b>Low stock — ${escapeHtml(home.name)}</b>\n\n${lines.length ? trimList(lines).join("\n") : "Everything is stocked. 👍"}`,
    [[OPEN("/inventory")]],
  );
}

async function cmdExpiring(ctx: Ctx, home: Home) {
  const [items, pref, acks] = await Promise.all([
    loadItems(ctx.db, home.householdId),
    ctx.db
      .from("expiry_notification_prefs")
      .select("notice_days")
      .eq("user_id", home.userId)
      .eq("household_id", home.householdId)
      .maybeSingle(),
    ctx.db
      .from("expiry_acks")
      .select("item_id, expires_on")
      .eq("user_id", home.userId)
      .eq("household_id", home.householdId),
  ]);
  const windowDays = pref.data?.notice_days ?? DEFAULT_EXPIRY_WINDOW_DAYS;
  const ackSet = new Set((acks.data ?? []).map((a) => `${a.item_id}:${a.expires_on}`));
  const today = todayIso();
  const due = items
    .filter((i) => i.quantity > 0 && i.expires_on)
    .map((i) => ({ ...i, d: daysBetweenDates(today, i.expires_on!) }))
    .filter((i) => i.d <= windowDays)
    .sort((a, b) => a.d - b.d);
  const lines = due.map((i) => {
    const verb = i.d < 0 ? "expired" : i.quantity === 1 ? "expires" : "expire";
    const ack = ackSet.has(`${i.id}:${i.expires_on}`) ? " ✓ Got it" : "";
    return `${escapeHtml(i.name)} — ${i.quantity} ${verb} ${shortDate(i.expires_on!)}${ack}`;
  });
  await send(
    ctx.chatId,
    `⏳ <b>Expiring soon — ${escapeHtml(home.name)}</b>\n\n${lines.length ? trimList(lines).join("\n") : `Nothing expires in the next ${windowDays} days.`}`,
    [[OPEN("/inventory")]],
  );
}

// ---------------- callbacks ----------------

async function cbHome(ctx: Ctx, householdId: string): Promise<string> {
  const homes = await homesFor(ctx);
  const home = homes.find((h) => h.householdId === householdId);
  if (!home) return "You no longer have access to that home.";
  await setHome(ctx, home);
  await send(ctx.chatId, `Now using 🏠 <b>${escapeHtml(home.name)}</b>.`);
  return "Home changed";
}

async function cbUndo(ctx: Ctx, undoId: string): Promise<string> {
  const { data: undo } = await ctx.db
    .from("telegram_undo")
    .select("id, user_id, shopping_item_id, used_at, created_at")
    .eq("id", undoId)
    .maybeSingle();
  if (!undo || !ctx.userIds.includes(undo.user_id)) return "This change can no longer be undone here.";
  if (undo.used_at) return "Already undone.";
  if (Date.now() - Date.parse(undo.created_at) > UNDO_HOURS * 3600_000) {
    await send(
      ctx.chatId,
      "This change can no longer be undone here. Open HomeStock to update the Shopping list.",
      [[OPEN("/shopping")]],
    );
    return "Too late to undo";
  }
  // Claim first so a double tap is harmless.
  const { data: claimed } = await ctx.db
    .from("telegram_undo")
    .update({ used_at: new Date().toISOString() })
    .eq("id", undo.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return "Already undone.";
  const { data: item } = await ctx.db
    .from("shopping_items")
    .select("id, name, household_id, status")
    .eq("id", undo.shopping_item_id)
    .maybeSingle();
  if (!item || item.status !== "pending") {
    await send(
      ctx.chatId,
      "This change can no longer be undone here. Open HomeStock to update the Shopping list.",
      [[OPEN("/shopping")]],
    );
    return "Can't undo";
  }
  const { data: member } = await ctx.db
    .from("household_members")
    .select("user_id")
    .eq("household_id", item.household_id)
    .eq("user_id", undo.user_id)
    .maybeSingle();
  if (!member) return "You no longer have access to that home.";
  await ctx.db.from("shopping_items").delete().eq("id", item.id);
  await send(ctx.chatId, `Removed <b>${escapeHtml(item.name)}</b> from Shopping.`);
  return "Undone";
}

async function cbAck(ctx: Ctx, itemId: string, on: boolean): Promise<string> {
  const { data: item } = await ctx.db
    .from("items")
    .select("id, name, household_id, quantity, expires_on")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return "This expiry reminder is no longer active.";
  const { data: mem } = await ctx.db
    .from("household_members")
    .select("user_id")
    .eq("household_id", item.household_id)
    .in("user_id", ctx.userIds);
  const members = (mem ?? []).map((m) => m.user_id);
  if (members.length === 0) return "You no longer have access to that home.";
  if (!on) {
    await ctx.db.from("expiry_acks").delete().eq("item_id", item.id).in("user_id", members);
    await send(ctx.chatId, `Reminders back on for <b>${escapeHtml(item.name)}</b>.`);
    return "Reminders resumed";
  }
  if (!item.expires_on || Number(item.quantity) <= 0)
    return "This expiry reminder is no longer active.";
  await ctx.db.from("expiry_acks").upsert(
    members.map((uid) => ({
      user_id: uid,
      item_id: item.id,
      household_id: item.household_id,
      expires_on: item.expires_on!,
      source: "telegram",
      acknowledged_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,item_id" },
  );
  await send(
    ctx.chatId,
    `Got it — I won't remind you again about <b>${escapeHtml(item.name)}</b> expiring ${shortDate(item.expires_on)}.`,
    [[{ text: "Undo", callback_data: `r:${item.id}` }]],
  );
  return "Got it";
}

// ---------------- entry point ----------------

type Update = {
  update_id?: number;
  message?: { chat?: { id?: number; type?: string }; from?: { id?: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number; type?: string } };
  };
};

/** Handles everything except /start linking and /stop, which stay in the webhook. */
export async function handleBotUpdate(db: Admin, update: Update): Promise<void> {
  const cb = update.callback_query;
  const chat = cb ? cb.message?.chat : update.message?.chat;
  const chatId = chat?.id;
  if (!chatId) return;
  if (chat?.type !== "private") {
    if (!cb)
      await send(chatId, "HomeStock Telegram commands currently work only in a private chat with the bot.");
    return;
  }

  const enabled = await readSetting<{ enabled?: boolean }>("telegram_commands_enabled");
  const answer = (text: string) =>
    cb ? telegramCall("answerCallbackQuery", { callback_query_id: cb.id, text }) : null;

  if (enabled?.enabled === false) {
    await answer("Paused");
    await send(chatId, "HomeStock's Telegram commands are paused for a moment. Please use the app.", [
      [OPEN()],
    ]);
    return;
  }

  const { data: links } = await db
    .from("telegram_links")
    .select("user_id, linked_at")
    .eq("chat_id", chatId)
    .eq("active", true)
    .order("linked_at");
  const ctx: Ctx = { db, chatId, userIds: (links ?? []).map((l) => l.user_id) };
  if (ctx.userIds.length === 0) {
    await answer("Not linked");
    await send(
      chatId,
      "This Telegram chat is no longer linked to HomeStock. Reconnect it from HomeStock → More → Telegram.",
      [[OPEN("/more")]],
    );
    return;
  }

  // Generous per-account limit: stops loops and scripts, never normal use.
  const { underLimit } = await import("./admin.server");
  if (
    !(await underLimit(ctx.userIds[0]!, "tg_cmd", 30, 60)) ||
    !(await underLimit(ctx.userIds[0]!, "tg_cmd_hour", 300, 3600))
  ) {
    await answer("Slow down a little");
    if (!cb) await send(chatId, "That's a lot of messages — please wait a minute and try again.");
    return;
  }

  if (cb) {
    const data = typeof cb.data === "string" && cb.data.length <= 64 ? cb.data : "";
    const [kind, id] = data.split(":");
    let reply = "Done";
    const uuid = /^[0-9a-f-]{36}$/i.test(id ?? "") ? id! : null;
    if (!uuid) reply = "This button is no longer active.";
    else if (kind === "h") reply = await cbHome(ctx, uuid);
    else if (kind === "u") reply = await cbUndo(ctx, uuid);
    else if (kind === "a") reply = await cbAck(ctx, uuid, true);
    else if (kind === "r") reply = await cbAck(ctx, uuid, false);
    else reply = "This button is no longer active.";
    const known = ["h", "u", "a", "r"].includes(kind ?? "") ? kind : "other";
    await log(db, `button:${known}`, "ok");
    await answer(reply);
    return;
  }

  const rawText = update.message?.text;
  const text = (typeof rawText === "string" ? rawText : "").slice(0, 1000).trim();
  const m = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text);
  const cmd = m?.[1]?.toLowerCase() ?? "";
  const rest = m?.[2] ?? "";

  if (cmd === "help") {
    await log(db, "help", "ok");
    await send(chatId, HELP_TEXT, [[OPEN()]]);
    return;
  }
  if (cmd === "home") {
    await log(db, "home", "ok");
    await cmdHome(ctx);
    return;
  }
  if (!["add", "shopping", "low", "expiring"].includes(cmd)) {
    await log(db, "unsupported", "ok");
    await send(chatId, "I only support a few quick HomeStock commands for now. Use /help to see them.");
    return;
  }

  const homes = await homesFor(ctx);
  const home = await activeHome(ctx, homes);
  if (!home) {
    await log(db, cmd, "no_home");
    await needHome(ctx, homes);
    return;
  }
  if (cmd === "add") await log(db, "add", await cmdAdd(ctx, home, rest));
  else if (cmd === "shopping") {
    await cmdShopping(ctx, home);
    await log(db, "shopping", "ok");
  } else if (cmd === "low") {
    await cmdLow(ctx, home);
    await log(db, "low", "ok");
  } else {
    await cmdExpiring(ctx, home);
    await log(db, "expiring", "ok");
  }
}

/** After linking: show the six commands in Telegram's menu and pick a home if obvious. */
export async function afterLink(db: Admin, chatId: number): Promise<string> {
  await telegramCall("setMyCommands", { commands: BOT_COMMANDS });
  const { data: links } = await db
    .from("telegram_links")
    .select("user_id")
    .eq("chat_id", chatId)
    .eq("active", true)
    .order("linked_at");
  const ctx: Ctx = { db, chatId, userIds: (links ?? []).map((l) => l.user_id) };
  const homes = await homesFor(ctx);
  const active = await activeHome(ctx, homes);
  if (active) return `Using 🏠 <b>${escapeHtml(active.name)}</b>.`;
  if (homes.length > 1) {
    await send(chatId, "Choose which HomeStock home Telegram should use:", homeButtons(homes));
  }
  return "";
}
