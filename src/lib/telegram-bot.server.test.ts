import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), call: vi.fn(), inactive: vi.fn() }));
vi.mock("./telegram.server", async (original) => ({
  ...(await original<typeof import("./telegram.server")>()),
  sendTelegramMessage: mocks.send,
  telegramCall: mocks.call,
  markChatInactive: mocks.inactive,
}));
import { handleAddPromptUpdate, handleBotUpdate, isAddPromptUpdate } from "./telegram-bot.server";
import { takeTelegramLimits } from "./telegram.server";

const update = { message: { chat: { id: 123, type: "private" }, text: "➕ Add item" } };
type Db = Parameters<typeof handleAddPromptUpdate>[0];
function database(status = "prompt") {
  const events: string[] = [];
  const insert = vi.fn(async () => { events.push("audit"); return { error: null }; });
  const eq = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => { events.push("admission"); return { data: { status, homes: [] }, error: null }; });
  const from = vi.fn(() => ({ insert, delete: () => ({ eq }) }));
  mocks.send.mockImplementation(async () => { events.push("send"); return { ok: true }; });
  return { db: { rpc, from } as unknown as Db, rpc, insert, eq, events };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("Telegram fast Add prompt", () => {
  it("admits and sets state before sending, then awaits audit before returning", async () => {
    const d = database();
    await handleAddPromptUpdate(d.db, update);
    expect(d.rpc).toHaveBeenCalledTimes(1);
    expect(d.events).toEqual(["admission", "send", "audit"]);
    expect(d.insert).toHaveBeenCalledWith({ command: "add", status: "prompt" });
  });
  it("only admits exact Add buttons or empty add commands in private chats", () => {
    expect(isAddPromptUpdate(update)).toBe(true);
    expect(isAddPromptUpdate({ message: { ...update.message, text: "/add@HomeStockBot" } })).toBe(true);
    for (const text of ["/add eggs", "➕ Add item sudo", "/add /stop", "eggs"]) {
      expect(isAddPromptUpdate({ message: { ...update.message, text } })).toBe(false);
    }
    expect(isAddPromptUpdate({ message: { ...update.message, chat: { id: 123, type: "group" } } })).toBe(false);
  });
  it("silently drops chat floods without delivery", async () => {
    const d = database("chat_throttled");
    await handleAddPromptUpdate(d.db, update);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(d.insert).not.toHaveBeenCalled();
  });
  it.each(["paused", "unlinked", "user_throttled", "no_home"])("does not prompt when admission reports %s", async (status) => {
    const d = database(status);
    await handleAddPromptUpdate(d.db, update);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(d.insert).not.toHaveBeenCalledWith({ command: "add", status: "prompt" });
  });
  it("fails closed on preparation errors", async () => {
    const d = database();
    d.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } } as never);
    await expect(handleAddPromptUpdate(d.db, update)).rejects.toThrow("preparation unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("clears unseen awaiting state when prompt delivery fails", async () => {
    const d = database();
    mocks.send.mockResolvedValueOnce({ ok: false, description: "network error" });
    await handleAddPromptUpdate(d.db, update);
    expect(d.eq).toHaveBeenCalledWith("chat_id", 123);
    expect(d.insert).toHaveBeenCalledWith({ command: "add", status: "delivery_failed" });
  });
  it("does not silently discard audit failures", async () => {
    const d = database();
    d.insert.mockResolvedValueOnce({ error: { message: "unavailable" } } as never);
    await expect(handleAddPromptUpdate(d.db, update)).rejects.toThrow("audit failed");
  });
  it("fails closed on quota database errors", async () => {
    const d = database();
    d.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } } as never);
    await expect(takeTelegramLimits(d.db, ["user"], ["tg_cmd"])).rejects.toThrow("rate limit unavailable");
  });
  it("routes direct Add callers through one admission transaction", async () => {
    const d = database();
    await handleBotUpdate(d.db, update);
    expect(d.rpc).toHaveBeenCalledTimes(1);
    expect(d.rpc.mock.calls[0]).toEqual([
      "telegram_prepare_add", { _chat: 123, _chat_key: expect.any(String) },
    ]);
    expect(d.events).toEqual(["admission", "send", "audit"]);
  });
  it("checks legacy inline Add membership before delivery", async () => {
    const d = database("no_home");
    await handleBotUpdate(d.db, { callback_query: {
      id: "test-callback", data: "m:add", message: { chat: { id: 123, type: "private" } },
    } });
    expect(d.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalledWith(123, expect.stringContaining("Just type"), expect.anything());
    expect(mocks.call).toHaveBeenCalledWith("answerCallbackQuery", {
      callback_query_id: "test-callback", text: "Choose a home first",
    });
  });
  it("reports failed cleanup rather than claiming unseen state was removed", async () => {
    const d = database();
    mocks.send.mockResolvedValueOnce({ ok: false, description: "network error" });
    d.eq.mockResolvedValueOnce({ error: { message: "unavailable" } } as never);
    await expect(handleAddPromptUpdate(d.db, update)).rejects.toThrow("cleanup failed");
    expect(d.insert).not.toHaveBeenCalled();
  });
});