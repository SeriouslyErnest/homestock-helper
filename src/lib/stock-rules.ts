// Pure stock rules shared by the web app and the Telegram bot, so the two
// can never disagree. No browser or server imports here.

type StockRow = { quantity: number; min_quantity: number };

/**
 * Running low: some stock remains, but strictly below the "keep at least" amount.
 * Quantity 0 is "out of stock", not low; quantity == minimum is comfortably stocked.
 */
export function isLow(item: StockRow): boolean {
  return item.min_quantity > 0 && item.quantity > 0 && item.quantity < item.min_quantity;
}

export type StockStatus = "out" | "low" | "ok";

/** Product-level status across all places it is kept (same rule as Inventory). */
export function productStatus(rows: StockRow[]): { status: StockStatus; total: number; min: number } {
  const total = rows.reduce((s, r) => s + Number(r.quantity), 0);
  const min = Math.max(0, ...rows.map((r) => Number(r.min_quantity)));
  const status: StockStatus = total <= 0 ? "out" : min > 0 && total < min ? "low" : "ok";
  return { status, total, min };
}

/** Same product key the Inventory uses to group rows. */
export function productKey(item: { barcode: string | null; name: string }): string {
  return item.barcode?.trim() || item.name.trim().toLowerCase();
}

/** Whole days from `todayIso` to `dateIso`; both plain calendar dates (no timezone shift). */
export function daysBetweenDates(todayIso: string, dateIso: string): number {
  const a = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10));
  const b = Date.UTC(+dateIso.slice(0, 4), +dateIso.slice(5, 7) - 1, +dateIso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Default "expiring soon" window used by the app when a person hasn't chosen one. */
export const DEFAULT_EXPIRY_WINDOW_DAYS = 14;
