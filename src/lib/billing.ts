// Payments preparation (not connected yet).
//
// When built-in payments are switched on, a verified webhook under
// src/routes/api/public/ writes rows to public.billing_subscriptions.
// effective_tier() already treats an active/trialing/past_due *live*
// subscription as the "paid" tier, so Pro unlocks without code changes.
// Prices below are placeholders until products are created with the provider.

export const BILLING_CONNECTED = false;

export type ProPlanOption = {
  id: "pro_monthly" | "pro_yearly";
  label: string;
  interval: "month" | "year";
  /** Display only; the real price lives with the payment provider. */
  displayPrice: string | null;
};

export const PRO_PLAN_OPTIONS: ProPlanOption[] = [
  { id: "pro_monthly", label: "Pro monthly", interval: "month", displayPrice: null },
  { id: "pro_yearly", label: "Pro yearly", interval: "year", displayPrice: null },
];

export const PRO_FEATURES = [
  "Household insights: what you use most, what's sitting forgotten, what's about to spoil",
  "Run-out forecasts and how often you restock each item",
  "Weekly in and out of your stock",
  "Unlocked for everyone in the home when the owner is on Pro",
];
