import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Household = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

export type Member = {
  household_id: string;
  user_id: string;
  role: string;
  display_name: string | null;
};

export type Item = {
  id: string;
  household_id: string;
  name: string;
  barcode: string | null;
  image_url: string | null;
  category: string;
  location: string | null;
  quantity: number;
  unit: string;
  min_quantity: number;
  expires_on: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShoppingItem = {
  id: string;
  household_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  note: string | null;
  status: "pending" | "bought";
  requested_by: string | null;
  created_at: string;
  bought_at: string | null;
  /** How much stock ticking this off added, so unticking can take back exactly that. */
  stock_applied?: number | null;
  /** Short hints for whoever shops: "Only if on sale", "Any brand", … */
  tags?: string[] | null;
};

/** The small, fixed set of hints a buy request can carry. Deliberately short. */
export const REQUEST_TAGS = [
  "Optional",
  "Only if on sale",
  "Any brand",
  "Call if unavailable",
] as const;

/** A place an item can live in — the emoji chips like 🍜 Pantry, 🧺 Laundry. */
export type CategoryDef = { id: string; emoji: string };

/** The built-in list, used until the admin console has saved its own. */
export const CATEGORIES: CategoryDef[] = [
  { id: "Pantry", emoji: "🍜" },
  { id: "Fridge", emoji: "🥛" },
  { id: "Bathroom", emoji: "🧴" },
  { id: "Cleaning", emoji: "🧻" },
  { id: "Laundry", emoji: "🧺" },
  { id: "Other", emoji: "📦" },
];

/** Emoji for a category, from a given list (so admin edits show everywhere). */
export function emojiFor(category: string | null | undefined, cats: CategoryDef[]): string {
  return cats.find((c) => c.id === category)?.emoji ?? "📦";
}

export function categoryEmoji(category: string | null | undefined): string {
  return emojiFor(category, CATEGORIES);
}

/**
 * The household's place list. Edited in the admin console and stored as a
 * setting; falls back to the built-in list until (or if) that was never saved.
 */
export function useCategories(): CategoryDef[] {
  const { data } = useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<CategoryDef[]> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "categories")
        .maybeSingle();
      const list = data?.value as CategoryDef[] | undefined;
      return Array.isArray(list) && list.length > 0 ? list : CATEGORIES;
    },
    staleTime: 5 * 60_000,
  });
  return data ?? CATEGORIES;
}

export function isLow(item: Item): boolean {
  return item.min_quantity > 0 && item.quantity <= item.min_quantity;
}

/**
 * Parse a plain calendar date ("2026-09-20") in the viewer's own timezone.
 * `new Date("2026-09-20")` is parsed as UTC and can render a day early.
 */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Format a calendar date for display in the viewer's local timezone. */
export function formatLocalDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  return parseLocalDate(value).toLocaleDateString(undefined, options);
}

/** Format a UTC timestamp from the database in the viewer's local time. */
export function formatLocalDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Current moment as a UTC timestamp for storage. */
export function nowUtc(): string {
  return new Date().toISOString();
}

export function daysUntilExpiry(value: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseLocalDate(value).getTime() - today.getTime()) / 86400000);
}

export function isExpiringSoon(item: Item): boolean {
  if (!item.expires_on) return false;
  return daysUntilExpiry(item.expires_on) <= 14;
}

/** True when the item expires within the given number of days (expired counts). */
export function isExpiringInDays(item: Item, days: number): boolean {
  if (!item.expires_on) return false;
  return daysUntilExpiry(item.expires_on) <= days;
}

/**
 * The same product kept in two places is two rows. This key says "same product",
 * so the inventory can cluster them and the item page can show a combined total.
 */
export function productKey(item: Pick<Item, "barcode" | "name">): string {
  return item.barcode?.trim() || item.name.trim().toLowerCase();
}

/** Sort so rows of the same product sit together, ordered by place. */
export function sortByProductThenLocation<T extends Pick<Item, "barcode" | "name" | "location">>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      productKey(a).localeCompare(productKey(b)) ||
      (a.location ?? "").localeCompare(b.location ?? ""),
  );
}

/** Sort so the soonest-to-expire items come first; items with no expiry go last. */
export function sortByExpiry<T extends Pick<Item, "expires_on" | "barcode" | "name" | "location">>(
  items: T[],
): T[] {
  const days = (i: T): number =>
    i.expires_on ? daysUntilExpiry(i.expires_on) : Number.POSITIVE_INFINITY;
  return [...items].sort(
    (a, b) =>
      days(a) - days(b) ||
      a.name.localeCompare(b.name) ||
      (a.location ?? "").localeCompare(b.location ?? ""),
  );
}

/** Sort so the most recently touched items come first. */
export function sortByRecentlyUpdated<
  T extends Pick<Item, "updated_at" | "barcode" | "name" | "location">,
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.updated_at.localeCompare(a.updated_at) ||
      a.name.localeCompare(b.name) ||
      (a.location ?? "").localeCompare(b.location ?? ""),
  );
}

/** The signed-in user's own profile (for the avatar and member list). */
export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<{ id: string; email: string; displayName: string | null }> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      return {
        id: user.id,
        email: user.email ?? "",
        displayName:
          data?.display_name ?? (user.user_metadata?.["name"] as string | undefined) ?? null,
      };
    },
    staleTime: 5 * 60_000,
  });
}

const ACTIVE_HOUSEHOLD_KEY = "homestock.active-household";

/** Screens re-read the remembered home when it changes, so switching is instant. */
const activeListeners = new Set<() => void>();

function subscribeActiveHousehold(listener: () => void): () => void {
  activeListeners.add(listener);
  return () => activeListeners.delete(listener);
}

/** Which household the user last looked at. Remembered on this device. */
export function getActiveHouseholdId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_HOUSEHOLD_KEY);
  } catch {
    return null;
  }
}

export function setActiveHouseholdId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, id);
  } catch {
    /* storage unavailable — fall back to the newest household */
  }
  activeListeners.forEach((l) => l());
}

/** Forget the remembered home — used when leaving one, so it can't point nowhere. */
export function clearActiveHouseholdId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_HOUSEHOLD_KEY);
  } catch {
    /* nothing to clear */
  }
  activeListeners.forEach((l) => l());
}

/** Every household the user belongs to, most recently joined first. */
export function useHouseholds() {
  return useQuery({
    queryKey: ["households"],
    queryFn: async (): Promise<Household[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("household_members")
        .select("household_id, created_at, households(id, name, invite_code, created_by)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? [])
        .map((row) => row.households as unknown as Household | null)
        .filter((h): h is Household => !!h);
    },
    // Being removed from a home should take effect without a manual reload.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}

/** The household currently being viewed — the remembered one, else the newest. */
export function useHousehold() {
  const query = useHouseholds();
  const households = query.data;
  const activeId = useSyncExternalStore(subscribeActiveHousehold, getActiveHouseholdId, () => null);
  const active = households?.find((h) => h.id === activeId) ?? households?.[0] ?? undefined;
  return { ...query, data: active, households: households ?? [] };
}

/**
 * What the signed-in user's plan allows. Limits are defined in the database and
 * are only applied when that plan row is marked as enforced, so charging for
 * extra homes later is a data change, not a code change.
 */
export type Entitlements = {
  tier: string;
  enforced: boolean;
  max_owned_households: number;
  max_members: number;
  /** How many inventory rows a home may show on this plan. */
  max_items: number;
  owned_households: number;
  can_create_household: boolean;
};

export function useEntitlements() {
  return useQuery({
    queryKey: ["entitlements"],
    queryFn: async (): Promise<Entitlements> => {
      const { data, error } = await supabase.rpc("my_entitlements");
      if (error) throw error;
      return data as unknown as Entitlements;
    },
    staleTime: 60_000,
  });
}

/** Requests the signed-in user has sent, so they can see what they're waiting on. */
export type MyJoinRequest = {
  id: string;
  household_id: string;
  household_name: string;
  status: "pending" | "approved" | "rejected" | "blocked";
  created_at: string;
};

export function useMyJoinRequests() {
  return useQuery({
    queryKey: ["my-join-requests"],
    refetchInterval: 30000,
    queryFn: async (): Promise<MyJoinRequest[]> => {
      const { data, error } = await supabase.rpc("my_join_requests");
      if (error) throw error;
      return (data ?? []) as MyJoinRequest[];
    },
  });
}

/**
 * A standing ask from this user for a higher limit. One open ask per kind, kept
 * only until an operator clears it, so it never becomes a pile of stale rows.
 */
export type LimitRequest = { id: string; kind: string; created_at: string };

export function useMyLimitRequest(kind = "households") {
  return useQuery({
    queryKey: ["my-limit-request", kind],
    queryFn: async (): Promise<LimitRequest | null> => {
      const { data } = await supabase
        .from("limit_requests")
        .select("id, kind, created_at")
        .eq("kind", kind)
        .maybeSingle();
      return (data as LimitRequest | null) ?? null;
    },
    staleTime: 60_000,
  });
}

/** Sends the operator a note asking for a higher limit. Sending twice is harmless. */
export async function requestLimitIncrease(kind = "households"): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("limit_requests").insert({ user_id: uid, kind });
  // A duplicate simply means they already asked — that's a success, not a failure.
  if (error && !error.message.includes("duplicate")) throw error;
}

/** Human wording for a refused action, so every screen says the same thing. */
export function planLimitMessage(error: unknown): string | null {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (message.includes("plan_limit_households")) {
    return "You've reached the number of homes your account can create right now.";
  }
  if (message.includes("plan_limit_members")) {
    return "This home is already full for its plan.";
  }
  return null;
}

/**
 * Create a household and join it as its owner. The server checks the plan
 * allowance, so a greyed-out button is never the only thing stopping it.
 */
export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await supabase.rpc("create_household", {
    _name: name.trim() || "Our Home",
  });
  if (error) throw error;
  const household = data as unknown as Household;
  setActiveHouseholdId(household.id);
  return household;
}

export function useMembers(householdId: string | undefined) {
  return useQuery({
    queryKey: ["members", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("household_members")
        .select("*")
        .eq("household_id", householdId!);
      if (error) throw error;
      return data as Member[];
    },
  });
}

export type JoinRequest = {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  status: "pending" | "approved" | "rejected" | "blocked";
  created_at: string;
};

export function useJoinRequests(householdId: string | undefined) {
  return useQuery({
    queryKey: ["join-requests", householdId],
    enabled: !!householdId,
    refetchInterval: 30000,
    queryFn: async (): Promise<JoinRequest[]> => {
      const { data, error } = await supabase
        .from("household_join_requests")
        .select("*")
        .eq("household_id", householdId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as JoinRequest[];
    },
  });
}

export function useItems(householdId: string | undefined) {
  return useQuery({
    queryKey: ["items", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("household_id", householdId!)
        .order("name");
      if (error) throw error;
      return data as Item[];
    },
  });
}

export function useShopping(householdId: string | undefined) {
  return useQuery({
    queryKey: ["shopping", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<ShoppingItem[]> => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("household_id", householdId!)
        .order("status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ShoppingItem[];
    },
  });
}
