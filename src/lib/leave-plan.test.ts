import { describe, expect, it } from "vitest";
import { planLeave, LEAVE_COUNTDOWN_SECONDS } from "./leave-plan";

const m = (user_id: string, role: string, created_at: string, display_name: string | null = user_id) => ({ user_id, role, created_at, display_name });

describe("planLeave", () => {
  it("last member leaving deletes the home", () => {
    expect(planLeave([m("a", "owner", "2026-01-01")], "a")).toEqual({ kind: "delete" });
  });
  it("sole owner hands ownership to the oldest remaining member", () => {
    const r = planLeave([m("a", "owner", "2026-01-01"), m("c", "member", "2026-03-01"), m("b", "member", "2026-02-01")], "a");
    expect(r).toEqual({ kind: "transfer", successorName: "b" });
  });
  it("plain member leaving changes nothing else", () => {
    expect(planLeave([m("a", "owner", "2026-01-01"), m("b", "member", "2026-02-01")], "b")).toEqual({ kind: "member" });
  });
  it("owner leaving with another owner present needs no transfer", () => {
    expect(planLeave([m("a", "owner", "2026-01-01"), m("b", "owner", "2026-02-01")], "a")).toEqual({ kind: "member" });
  });
  it("countdown is 5 seconds", () => {
    expect(LEAVE_COUNTDOWN_SECONDS).toBe(5);
  });
});
