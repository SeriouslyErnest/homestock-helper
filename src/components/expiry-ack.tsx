import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Item } from "@/lib/homestock";

/**
 * "Got it" for an expiry: stops this person's reminders for this stock and
 * date only. Shared with Telegram. The expiry itself stays visible.
 */
export function ExpiryAck({ item }: { item: Item }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ["expiry-ack", item.id];
  const { data: ackDate } = useQuery({
    queryKey: key,
    enabled: !!item.expires_on,
    queryFn: async () => {
      const { data } = await supabase
        .from("expiry_acks")
        .select("expires_on")
        .eq("item_id", item.id)
        .maybeSingle();
      return data?.expires_on ?? null;
    },
  });
  if (!item.expires_on || Number(item.quantity) <= 0) return null;
  const acked = ackDate === item.expires_on;

  async function set(on: boolean) {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const { error } = on
      ? await supabase.from("expiry_acks").upsert(
          {
            user_id: uid!,
            item_id: item.id,
            household_id: item.household_id,
            expires_on: item.expires_on!,
            source: "web",
            acknowledged_at: new Date().toISOString(),
          },
          { onConflict: "user_id,item_id" },
        )
      : await supabase.from("expiry_acks").delete().eq("item_id", item.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't save that. Try again.");
      return;
    }
    void qc.invalidateQueries({ queryKey: key });
    if (on)
      toast("Got it — no more reminders about this expiry", {
        action: { label: "Undo", onClick: () => void set(false) },
      });
  }

  return acked ? (
    <div className="mt-1 text-xs text-muted-foreground">
      ✓ Got it ·{" "}
      <button type="button" disabled={busy} onClick={() => void set(false)} className="underline">
        Resume reminders
      </button>
    </div>
  ) : (
    <button
      type="button"
      disabled={busy}
      onClick={() => void set(true)}
      className="mt-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold disabled:opacity-50"
    >
      Got it — stop reminding me
    </button>
  );
}
