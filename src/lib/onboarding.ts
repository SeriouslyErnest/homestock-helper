import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { X } from "lucide-react";
import { createElement } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WelcomeStatus = "not_started" | "in_progress" | "completed" | "skipped";
export type TipKey = "inventory" | "restock" | "shopping" | "use_up";
export type Onboarding = { welcome_status: WelcomeStatus; current_step: number; tips_seen: string[] };

const KEY = ["onboarding"];

async function uid() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Per-account state, stored server-side so it follows the person across devices. */
export function useOnboarding() {
  return useQuery({
    queryKey: KEY,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Onboarding> => {
      const id = await uid();
      if (!id) return { welcome_status: "completed", current_step: 0, tips_seen: [] };
      const { data, error } = await supabase
        .from("user_onboarding")
        .select("welcome_status,current_step,tips_seen")
        .eq("user_id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as Onboarding | null) ?? { welcome_status: "not_started", current_step: 0, tips_seen: [] };
    },
  });
}

export async function saveOnboarding(patch: Partial<Onboarding> & Record<string, unknown>) {
  const id = await uid();
  if (!id) return;
  const { error } = await supabase
    .from("user_onboarding")
    .upsert({ user_id: id, ...patch, updated_at: new Date().toISOString() } as never, { onConflict: "user_id" });
  if (error) throw error;
}

export function useOnboardingActions() {
  const qc = useQueryClient();
  const set = (patch: Partial<Onboarding>) =>
    qc.setQueryData<Onboarding>(KEY, (old) => ({
      welcome_status: "not_started",
      current_step: 0,
      tips_seen: [],
      ...old,
      ...patch,
    }));
  return {
    step: async (n: number) => {
      set({ welcome_status: "in_progress", current_step: n });
      await saveOnboarding({
        welcome_status: "in_progress",
        current_step: n,
        ...(n === 0 ? { started_at: new Date().toISOString() } : {}),
      }).catch(() => undefined);
    },
    finish: async (status: "completed" | "skipped") => {
      set({ welcome_status: status });
      const at = new Date().toISOString();
      await saveOnboarding({
        welcome_status: status,
        ...(status === "completed" ? { completed_at: at } : { skipped_at: at }),
      }).catch(() => undefined);
    },
    restart: async () => {
      set({ welcome_status: "not_started", current_step: 0, tips_seen: [] });
      await saveOnboarding({ welcome_status: "not_started", current_step: 0, tips_seen: [] });
    },
    seeTip: async (tip: TipKey, seen: string[]) => {
      const next = Array.from(new Set([...seen, tip]));
      set({ tips_seen: next });
      await saveOnboarding({ tips_seen: next }).catch(() => undefined);
    },
  };
}

/** One-time, dismissible, non-blocking hint shown on first visit to a screen. */
export function FirstUseTip({ tip, title, children }: { tip: TipKey; title: string; children: string }) {
  const { data } = useOnboarding();
  const { seeTip } = useOnboardingActions();
  const [hidden, setHidden] = useState(false);
  if (!data || hidden || data.tips_seen.includes(tip)) return null;
  // Don't stack tips on top of the tour itself.
  if (data.welcome_status === "not_started" || data.welcome_status === "in_progress") return null;
  return createElement(
    "div",
    { role: "note", className: "mb-4 flex items-start gap-3 rounded-2xl bg-brand-soft p-3.5 text-sm" },
    createElement(
      "p",
      { className: "min-w-0 flex-1" },
      createElement("strong", { className: "text-brand" }, title),
      " ",
      children,
    ),
    createElement(
      "button",
      {
        type: "button",
        "aria-label": "Dismiss tip",
        className: "-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground",
        onClick: () => {
          setHidden(true);
          void seeTip(tip, data.tips_seen);
        },
      },
      createElement(X, { size: 18 }),
    ),
  );
}
