import { describe, expect, it } from "vitest";
import { ordinal, reminderDueOn } from "./custom-reminders";

describe("reminderDueOn", () => {
  it("fires on the chosen day", () => {
    expect(reminderDueOn(5, "2026-11-05")).toBe(true);
    expect(reminderDueOn(5, "2026-11-06")).toBe(false);
  });
  it("a 31st reminder fires on the last day of a short month", () => {
    expect(reminderDueOn(31, "2026-11-30")).toBe(true);
    expect(reminderDueOn(31, "2027-02-28")).toBe(true);
    expect(reminderDueOn(30, "2027-02-27")).toBe(false);
  });
  it("labels days", () => {
    expect([1, 2, 3, 11, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "11th", "22nd"]);
  });
});
