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
};

export const CATEGORIES = [
  { id: "Pantry", emoji: "🍜" },
  { id: "Fridge", emoji: "🥛" },
  { id: "Bathroom", emoji: "🧴" },
  { id: "Cleaning", emoji: "🧻" },
  { id: "Laundry", emoji: "🧺" },
  { id: "Other", emoji: "📦" },
] as const;

export function categoryEmoji(category: string | null | undefined): string {
  return CATEGORIES.find((c) => c.id === category)?.emoji ?? "📦";
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

/** Fetch the current user's first household, creating one on first use. */
export function useHousehold() {
  return useQuery({
    queryKey: ["household"],
    queryFn: async (): Promise<Household> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: memberships, error } = await supabase
        .from("household_members")
        .select("household_id, created_at, households(id, name, invite_code, created_by)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;

      const existing = memberships?.[0]?.households as unknown as Household | undefined;
      if (existing) return existing;

      const { data: household, error: createError } = await supabase
        .from("households")
        .insert({ name: "Our Home", created_by: user.id })
        .select()
        .single();
      if (createError) throw createError;

      const { error: memberError } = await supabase
        .from("household_members")
        .insert({ household_id: household.id, user_id: user.id, role: "owner" });
      if (memberError) throw memberError;

      return household as Household;
    },
    staleTime: 5 * 60_000,
  });
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
