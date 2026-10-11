import { describe, expect, it } from "vitest";
import {
  buildProductInsights,
  deadStock,
  runningOutSoon,
  wastedUnits,
  weeklyFlow,
  type InsightItem,
} from "./insights";

const now = new Date("2026-10-11T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
const item = (over: Partial<InsightItem>): InsightItem => ({
  id: "a",
  name: "Milk",
  barcode: null,
  quantity: 4,
  min_quantity: 1,
  expires_on: null,
  created_at: daysAgo(100),
  ...over,
});

describe("insights", () => {
  it("burn rate is units used over 30 days; run-out is stock / rate", () => {
    const events = Array.from({ length: 15 }, (_, i) => ({
      item_id: "a",
      kind: "consume",
      delta: -2,
      created_at: daysAgo(i + 1),
    }));
    const [p] = buildProductInsights([item({ quantity: 4 })], events, now);
    expect(p!.usedLast30).toBe(30);
    expect(p!.perDay).toBe(1);
    expect(p!.daysLeft).toBe(4);
    expect(runningOutSoon([p!], 7)).toHaveLength(1);
  });

  it("consumption older than 30 days does not count toward the rate", () => {
    const [p] = buildProductInsights(
      [item({})],
      [{ item_id: "a", kind: "consume", delta: -5, created_at: daysAgo(31) }],
      now,
    );
    expect(p!.daysLeft).toBeNull();
  });

  it("dead stock = in stock and untouched for 60+ days", () => {
    const fresh = buildProductInsights(
      [item({})],
      [{ item_id: "a", kind: "consume", delta: -1, created_at: daysAgo(59) }],
      now,
    );
    const stale = buildProductInsights(
      [item({})],
      [{ item_id: "a", kind: "consume", delta: -1, created_at: daysAgo(60) }],
      now,
    );
    expect(deadStock(fresh, now)).toHaveLength(0);
    expect(deadStock(stale, now)).toHaveLength(1);
  });

  it("restock cycle averages days between separate shopping trips", () => {
    const [p] = buildProductInsights(
      [item({})],
      [0, 7, 14].map((d) => ({ item_id: "a", kind: "restock", delta: 1, created_at: daysAgo(d) })),
      now,
    );
    expect(p!.restockEveryDays).toBe(7);
  });

  it("weekly flow sums restocks in and consumes out", () => {
    const flow = weeklyFlow(
      [
        { item_id: "a", kind: "restock", delta: 3, created_at: daysAgo(0) },
        { item_id: "a", kind: "consume", delta: -2, created_at: daysAgo(0) },
      ],
      8,
      now,
    );
    expect(flow).toHaveLength(8);
    expect(flow.at(-1)).toMatchObject({ inUnits: 3, outUnits: 2 });
  });

  it("wasted units = stock still on the shelf on its expiry date", () => {
    expect(
      wastedUnits([
        { item_id: "a", snapshot_date: "2026-10-01", quantity: 3, expires_on: "2026-10-01" },
        { item_id: "b", snapshot_date: "2026-10-01", quantity: 0, expires_on: "2026-10-01" },
      ]),
    ).toBe(3);
  });
});
