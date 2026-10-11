// Household Insights (Pro). Pure, deterministic counting from recorded stock
// events, item rows and Pro-only daily snapshots — no guessing, no AI.
import { daysBetweenDates, productKey, productStatus } from "@/lib/stock-rules";

export type InsightItem = {
  id: string;
  name: string;
  barcode: string | null;
  quantity: number;
  min_quantity: number;
  expires_on: string | null;
  created_at: string;
  unit?: string;
};
export type InsightEvent = {
  item_id: string | null;
  kind: string;
  delta: number;
  created_at: string;
};
export type InsightSnapshot = {
  item_id: string;
  snapshot_date: string;
  quantity: number;
  expires_on: string | null;
};

/** Untouched this long with stock on the shelf = dead stock. */
export const DEAD_STOCK_DAYS = 60;
/** Consumption window used for burn rates and run-out forecasts. */
export const BURN_WINDOW_DAYS = 30;
/** Expiring-soon window on the dashboard. */
export const EXPIRY_SOON_DAYS = 7;

export type ProductInsight = {
  key: string;
  name: string;
  total: number;
  min: number;
  status: "out" | "low" | "ok";
  usedLast30: number;
  restockedLast30: number;
  /** Units used per day over the last 30 days (0 when unused). */
  perDay: number;
  /** Whole days until stock reaches zero at the current rate; null when unused or empty. */
  daysLeft: number | null;
  /** Average whole days between restocks; null with fewer than two restocks. */
  restockEveryDays: number | null;
  lastActivityAt: string | null;
  earliestExpiry: string | null;
};

const DAY = 86400000;

export function buildProductInsights(
  items: InsightItem[],
  events: InsightEvent[],
  now: Date = new Date(),
): ProductInsight[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<string, InsightItem[]>();
  for (const i of items) {
    const k = productKey(i);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const since = now.getTime() - BURN_WINDOW_DAYS * DAY;
  const out: ProductInsight[] = [];
  for (const [key, rows] of groups) {
    const ids = new Set(rows.map((r) => r.id));
    const evs = events.filter((e) => e.item_id && ids.has(e.item_id));
    const recent = evs.filter((e) => new Date(e.created_at).getTime() >= since);
    const usedLast30 = recent
      .filter((e) => e.kind === "consume")
      .reduce((s, e) => s + Math.abs(Number(e.delta)), 0);
    const restockedLast30 = recent
      .filter((e) => e.kind === "restock")
      .reduce((s, e) => s + Math.max(0, Number(e.delta)), 0);
    const { status, total, min } = productStatus(rows);
    const perDay = usedLast30 / BURN_WINDOW_DAYS;
    const daysLeft = perDay > 0 && total > 0 ? Math.floor(total / perDay) : null;
    const restockTimes = evs
      .filter((e) => e.kind === "restock" && Number(e.delta) > 0)
      .map((e) => new Date(e.created_at).getTime())
      .sort((a, b) => a - b);
    // Restocks on the same day count as one shopping trip.
    const trips: number[] = [];
    for (const t of restockTimes) {
      if (!trips.length || t - trips[trips.length - 1]! >= DAY) trips.push(t);
    }
    const restockEveryDays =
      trips.length >= 2
        ? Math.round((trips[trips.length - 1]! - trips[0]!) / (trips.length - 1) / DAY)
        : null;
    const lastActivityAt =
      evs.map((e) => e.created_at).sort().at(-1) ??
      rows.map((r) => r.created_at).sort().at(-1) ??
      null;
    const dated = rows
      .filter((r) => r.expires_on && Number(r.quantity) > 0)
      .map((r) => r.expires_on!)
      .sort();
    out.push({
      key,
      name: byId.get(rows[0]!.id)!.name,
      total,
      min,
      status,
      usedLast30,
      restockedLast30,
      perDay,
      daysLeft,
      restockEveryDays,
      lastActivityAt,
      earliestExpiry: dated[0] ?? null,
    });
  }
  return out;
}

/** In stock, but nobody used or restocked it for DEAD_STOCK_DAYS. */
export function deadStock(products: ProductInsight[], now: Date = new Date()): ProductInsight[] {
  return products
    .filter(
      (p) =>
        p.total > 0 &&
        p.lastActivityAt !== null &&
        now.getTime() - new Date(p.lastActivityAt).getTime() >= DEAD_STOCK_DAYS * DAY,
    )
    .sort((a, b) => (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? ""));
}

/** Will run out within `withinDays` at the current pace (soonest first). */
export function runningOutSoon(products: ProductInsight[], withinDays = 7): ProductInsight[] {
  return products
    .filter((p) => p.daysLeft !== null && p.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft! - b.daysLeft!);
}

/** Most-used products in the last 30 days. */
export function topStaples(products: ProductInsight[], limit = 5): ProductInsight[] {
  return products
    .filter((p) => p.usedLast30 > 0)
    .sort((a, b) => b.usedLast30 - a.usedLast30 || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Dated stock expiring within `withinDays` of today (expired included). */
export function expiringSoon(
  products: ProductInsight[],
  todayIso: string,
  withinDays = EXPIRY_SOON_DAYS,
): ProductInsight[] {
  return products
    .filter((p) => p.earliestExpiry && daysBetweenDates(todayIso, p.earliestExpiry) <= withinDays)
    .sort((a, b) => a.earliestExpiry!.localeCompare(b.earliestExpiry!));
}

export type WeekFlow = { weekStart: string; inUnits: number; outUnits: number };

/** Units in (restock) and out (consume) per week, oldest first, Monday-start UTC weeks. */
export function weeklyFlow(events: InsightEvent[], weeks = 8, now: Date = new Date()): WeekFlow[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dow = (new Date(today).getUTCDay() + 6) % 7;
  const thisMonday = today - dow * DAY;
  const result: WeekFlow[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = thisMonday - w * 7 * DAY;
    result.push({ weekStart: new Date(start).toISOString().slice(0, 10), inUnits: 0, outUnits: 0 });
  }
  const first = thisMonday - (weeks - 1) * 7 * DAY;
  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    if (t < first) continue;
    const idx = Math.floor((t - first) / (7 * DAY));
    const bucket = result[idx];
    if (!bucket) continue;
    if (e.kind === "restock" && Number(e.delta) > 0) bucket.inUnits += Number(e.delta);
    if (e.kind === "consume") bucket.outUnits += Math.abs(Number(e.delta));
  }
  return result;
}

/**
 * Units that were still on the shelf on their expiry date, from Pro snapshots.
 * Counted once per item row and expiry date (the snapshot on that date, or the
 * last one before it).
 */
export function wastedUnits(snapshots: InsightSnapshot[]): number {
  const best = new Map<string, InsightSnapshot>();
  for (const s of snapshots) {
    if (!s.expires_on || s.snapshot_date > s.expires_on) continue;
    const k = `${s.item_id}|${s.expires_on}`;
    const cur = best.get(k);
    if (!cur || s.snapshot_date > cur.snapshot_date) best.set(k, s);
  }
  let total = 0;
  for (const s of best.values()) {
    if (s.snapshot_date === s.expires_on) total += Math.max(0, Number(s.quantity));
  }
  return total;
}
