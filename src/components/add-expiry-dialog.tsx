import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/date-field";
import { supabase } from "@/integrations/supabase/client";
import type { Item } from "@/lib/homestock";

/**
 * Give the `qty` units just added to `itemId` an expiry date. If the row holds
 * only those units (or already has this date), the date is set on it.
 * Otherwise the new units move to their own row with the date, so older stock
 * keeps its own expiry. Returns the item name.
 */
export async function applyExpiry(itemId: string, qty: number, date: string): Promise<string> {
  const { data: row, error: readErr } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readErr || !row) throw readErr ?? new Error("missing");
  const current = row as Item;
  const move = Math.min(Math.max(1, qty), Number(current.quantity));
  if (Number(current.quantity) <= move || current.expires_on === date) {
    const { error } = await supabase.from("items").update({ expires_on: date }).eq("id", current.id);
    if (error) throw error;
    return current.name;
  }
  const { data: auth } = await supabase.auth.getUser();
  const { data: created, error: insErr } = await supabase
    .from("items")
    .insert({
      household_id: current.household_id,
      name: current.name,
      barcode: current.barcode,
      image_url: current.image_url,
      category: current.category,
      location: current.location,
      unit: current.unit,
      min_quantity: current.min_quantity,
      quantity: 0,
      expires_on: date,
      created_by: auth.user?.id ?? null,
    })
    .select("id")
    .single();
  if (insErr || !created) throw insErr ?? new Error("insert");
  const { error: e1 } = await supabase.rpc("adjust_item_quantity", {
    _item_id: current.id,
    _delta: -move,
  });
  if (e1) {
    await supabase.from("items").delete().eq("id", created.id);
    throw e1;
  }
  const { error: e2 } = await supabase.rpc("adjust_item_quantity", {
    _item_id: created.id,
    _delta: move,
  });
  if (e2) {
    await supabase.rpc("adjust_item_quantity", { _item_id: current.id, _delta: move });
    await supabase.from("items").delete().eq("id", created.id);
    throw e2;
  }
  return current.name;
}

/**
 * Optional "when does it expire?" step offered after adding stock (+1, scan,
 * shopping tick-off). Never blocks: closing simply skips it.
 */
export function AddExpiryDialog({
  item,
  qty = 1,
  onClose,
  onSaved,
}: {
  item: Pick<Item, "id" | "name"> | null;
  qty?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDate("");
  }, [item?.id]);

  async function save() {
    if (!item || !date || busy) return;
    setBusy(true);
    try {
      const name = await applyExpiry(item.id, qty, date);
      toast.success(`Expiry saved for ${name}`);
      onSaved();
      onClose();
    } catch {
      toast.error("Couldn't save the date. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>When does it expire?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Optional — for the {qty > 1 ? `${qty} ` : ""}
          {item?.name} you just added.
        </p>
        <DateField value={date} onChange={setDate} aria-label="Expiry date" />
        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold"
          >
            Skip
          </button>
          <button
            onClick={() => void save()}
            disabled={!date || busy}
            className="flex-1 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Save date
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
