export const MAX_CUSTOM_REMINDERS = 10;
export const MAX_REMINDER_TEXT = 200;

/** True when a monthly reminder for `day` fires on `isoDate` (YYYY-MM-DD, UTC).
 * Days past the month's end (29–31) fire on its last day. */
export function reminderDueOn(day: number, isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.min(day, last) === d;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}
