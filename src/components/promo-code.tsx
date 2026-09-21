import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDateTime } from "@/lib/homestock";

type Access = { tier: string; source: string; ends_at: string | null };

/** Lets someone turn a code from a beta invite or campaign into real access. */
export function PromoCard() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  const access = useQuery({
    queryKey: ["my-access"],
    queryFn: async (): Promise<Access[]> => {
      const { data, error } = await supabase.rpc("my_access");
      if (error) throw error;
      return (data ?? []) as Access[];
    },
  });

  const redeem = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("redeem_promo", { _code: code.trim() });
      if (error) throw error;
      return data as unknown as { tier: string; ends_at: string | null; campaign: string };
    },
    onSuccess: (result) => {
      setCode("");
      setMessage(
        `Code applied — ${result.tier} access${
          result.ends_at ? ` until ${formatLocalDateTime(result.ends_at)}` : ""
        }.`,
      );
      void qc.invalidateQueries({ queryKey: ["my-access"] });
      void qc.invalidateQueries({ queryKey: ["entitlements"] });
    },
    onError: (error: { message?: string }) => {
      const raw = error?.message ?? "";
      setMessage(
        raw.includes("promo_already_used")
          ? "You've already used this code."
          : "That code can't be used. Check it and try again.",
      );
    },
  });

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-bold">Have a code?</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Beta invites and campaign codes unlock extra access for a set time.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage("");
          redeem.mutate();
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="BETA90"
          maxLength={24}
          aria-label="Code"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 text-sm tracking-[0.2em] uppercase"
        />
        <button
          type="submit"
          disabled={redeem.isPending || !code.trim()}
          className="shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {redeem.isPending ? "Checking…" : "Apply"}
        </button>
      </form>
      {message && (
        <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {(access.data ?? []).length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {access.data?.map((a, i) => (
            <li key={i}>
              {a.tier} access
              {a.ends_at ? ` until ${formatLocalDateTime(a.ends_at)}` : " with no end date"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
