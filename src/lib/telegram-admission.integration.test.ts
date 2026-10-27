// Explicit opt-in: creates isolated fixtures, mocks Telegram sends, and cleans up.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const delivery = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("./telegram.server", async (original) => ({
  ...(await original<typeof import("./telegram.server")>()),
  sendTelegramMessage: delivery,
  telegramCall: delivery,
}));
import { handleAddPromptUpdate, handleBotUpdate } from "./telegram-bot.server";
import { chatKey } from "./telegram.server";

const enabled = process.env["RUN_TELEGRAM_DB_TESTS"] === "1";
describe.skipIf(!enabled)("Telegram admission against isolated real database fixtures", () => {
  type Db = Parameters<typeof handleBotUpdate>[0];
  let db: Db;
  const users: string[] = [];
  const homes: string[] = [];
  const subjects: string[] = [];
  const chat = -Math.floor(1_000_000_000_000 + Math.random() * 1_000_000_000);
  let key: string;
  const auditStart = new Date().toISOString();
  function check<T extends { error: unknown }>(r: T): T {
    if (r.error) throw new Error("Isolated Telegram test database operation failed");
    return r;
  }
  function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("Isolated test fixture missing");
    return value;
  }
  async function prepare() {
    const start = performance.now();
    const r = check(await db.rpc("telegram_prepare_add", { _chat: chat, _chat_key: key }));
    console.info(`Isolated Add admission: ${Math.round(performance.now() - start)} ms`);
    return r.data as { status: string; homes?: { userId: string }[] };
  }
  beforeAll(async () => {
    const url = process.env["SUPABASE_URL"];
    const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !secret) throw new Error("Missing integration test access");
    db = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", secret);
        if (secret.startsWith("sb_")) headers.delete("Authorization");
        return fetch(input, { ...init, headers });
      } },
    }) as Db;
    key = await chatKey(chat);
    subjects.push(key);
    for (let i = 0; i < 2; i++) {
      const r = check(await db.auth.admin.createUser({ email: `telegram-test-${randomUUID()}@example.invalid`, email_confirm: true }));
      if (!r.data.user) throw new Error("Fixture account missing");
      users.push(r.data.user.id);
    }
    for (let i = 0; i < 2; i++) {
      const userId = required(users[i]);
      const r = check(await db.from("households").insert({ name: `Telegram test ${i}`, created_by: userId }).select("id").single());
      const homeId = required(r.data).id;
      homes.push(homeId);
      check(await db.from("household_members").insert({ household_id: homeId, user_id: userId, role: "owner" }));
      check(await db.from("telegram_links").insert({ user_id: userId, chat_id: chat, active: true, linked_at: new Date(Date.now() + i * 1000).toISOString() }));
    }
  }, 30_000);
  afterAll(async () => {
    if (!db) return;
    check(await db.from("telegram_chat_state").delete().eq("chat_id", chat));
    check(await db.from("telegram_chat_context").delete().eq("chat_id", chat));
    if (subjects.length || users.length) check(await db.from("rate_limit_hits").delete().in("user_id", [...subjects, ...users]));
    if (users.length) {
      check(await db.from("telegram_undo").delete().in("user_id", users));
      check(await db.from("telegram_links").delete().in("user_id", users));
    }
    if (homes.length) check(await db.from("households").delete().in("id", homes));
    for (const user of users) {
      check(await db.from("profiles").delete().eq("id", user));
      check(await db.auth.admin.deleteUser(user));
    }
    for (const table of ["telegram_links", "telegram_undo"] as const) {
      if (!users.length) break;
      const r = check(await db.from(table).select("user_id").in("user_id", users));
      expect(r.data).toEqual([]);
    }
    const state = check(await db.from("telegram_chat_state").select("chat_id").eq("chat_id", chat));
    expect(state.data).toEqual([]);
    console.info("Isolated Telegram fixtures removed; command-only audit entries retained.");
  }, 30_000);

  it("requires a home choice when two linked accounts have different homes", async () => {
    const r = await prepare();
    expect(r.status).toBe("no_home");
    expect(r.homes).toHaveLength(2);
    expect(check(await db.from("telegram_chat_state").select("chat_id").eq("chat_id", chat)).data).toEqual([]);
  });
  it("rejects context whose selected account is not a member, even if another linked account is", async () => {
    check(await db.from("telegram_chat_context").upsert({ chat_id: chat, user_id: required(users[1]), household_id: required(homes[0]) }));
    expect((await prepare()).status).toBe("no_home");
  });
  it("prompt → literal item name → Shopping → Undo reads back correctly", async () => {
    check(await db.from("telegram_chat_context").upsert({ chat_id: chat, user_id: required(users[0]), household_id: required(homes[0]) }));
    const update = { message: { chat: { id: chat, type: "private" }, text: "➕ Add item" } };
    await handleAddPromptUpdate(db, update);
    const state = check(await db.from("telegram_chat_state").select("awaiting,expires_at").eq("chat_id", chat).single());
    expect(required(state.data).awaiting).toBe("add");
    expect(Date.parse(required(state.data).expires_at) - Date.now()).toBeGreaterThan(9 * 60_000);
    await handleBotUpdate(db, { message: { ...update.message, text: "Test eggs <literal>" } });
    const item = required(check(await db.from("shopping_items").select("id,name,requested_by,quantity").eq("household_id", required(homes[0])).single()).data);
    expect(item.name).toBe("Test eggs <literal>");
    expect(item.requested_by).toBe(users[0]);
    expect(Number(item.quantity)).toBe(1);
    await handleBotUpdate(db, { message: { ...update.message, text: "/shopping" } });
    expect(delivery.mock.calls.some((args: unknown[]) => String(args[1]).includes("Test eggs &lt;literal&gt;"))).toBe(true);
    const undo = required(check(await db.from("telegram_undo").select("id").eq("shopping_item_id", item.id).single()).data);
    await handleBotUpdate(db, { callback_query: { id: "isolated-test", data: `u:${undo.id}`, message: { chat: { id: chat, type: "private" } } } });
    expect(check(await db.from("shopping_items").select("id").eq("id", item.id)).data).toEqual([]);
    const audit = check(await db.from("telegram_command_log").select("command,status").gt("created_at", auditStart).eq("command", "add"));
    expect(audit.data).toContainEqual({ command: "add", status: "prompt" });
  }, 30_000);
  it("immediately rejects removed membership without a settings cache", async () => {
    check(await db.from("household_members").delete().eq("user_id", required(users[0])).eq("household_id", required(homes[0])));
    expect((await prepare()).status).toBe("prompt"); // sole remaining authorized home
    const context = check(await db.from("telegram_chat_context").select("user_id,household_id").eq("chat_id", chat).single());
    expect(required(context.data).user_id).toBe(users[1]);
    expect(required(context.data).household_id).toBe(homes[1]);
  });
  it.each([
    ["tg_chat_min", 40], ["tg_chat_hour", 300], ["tg_cmd", 30],
    ["tg_cmd_hour", 300], ["tg_link_try", 5], ["tg_add_day", 60],
  ])("enforces exact %s quota under concurrent calls", async (bucket, cap) => {
    const subject = randomUUID();
    subjects.push(subject);
    check(await db.from("rate_limit_hits").insert(Array.from({ length: Number(cap) - 1 }, () => ({ user_id: subject, bucket: String(bucket) }))));
    const results = await Promise.all(Array.from({ length: 6 }, () => db.rpc("telegram_take_limits", { _subjects: [subject], _buckets: [String(bucket)] })));
    results.forEach(check);
    expect(results.filter((r) => r.data === true)).toHaveLength(1);
    const count = check(await db.from("rate_limit_hits").select("id", { count: "exact", head: true }).eq("user_id", subject).eq("bucket", String(bucket)));
    expect(count.count).toBe(Number(cap));
  }, 15_000);
  it("refuses invalid buckets without writing counters", async () => {
    const subject = randomUUID();
    subjects.push(subject);
    const r = await db.rpc("telegram_take_limits", { _subjects: [subject], _buckets: ["sudo"] });
    expect(r.error).not.toBeNull();
    expect(check(await db.from("rate_limit_hits").select("id").eq("user_id", subject)).data).toEqual([]);
  });
});