import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/date-field";
import { supabase } from "@/integrations/supabase/client";
import type { Item } from "@/lib/homestock";

/**
 * Optional "when does the one you just added expire?" step, offered after +1.
 * If the row holds only that one unit (or already has this date), the date is
 * set on it. Otherwise the new unit moves to its own row with the date, so the
 * older stock keeps its own expiry. Never blocks: closing simply skips it.
 */
export function AddExpiryDialog({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
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
      // Fresh read: the toast may be a few seconds old.
      const { data: row, error: readErr } = await supabase
        .from("items")
        .select("*")
        .eq("id", item.id)
        .single();
      if (readErr || !row) throw readErr ?? new Error("missing");
      const current = row as Item;
      if (Number(current.quantity) <= 1 || !current.expires_on || current.expires_on === date) {
        if (current.expires_on && current.expires_on !== date && Number(current.quantity) > 1) {
          // unreachable, kept for clarity
        }
        if (!current.expires_on && Number(current.quantity) > 1) {
          // Existing undated stock: split so only the new unit gets the date.
          await split(current);
        } else {
          const { error } = await supabase
            .from("items")
            .update({ expires_on: date })
            .eq("id", current.id);
          if (error) throw error;
        }
      } else {
        await split(current);
      }
      toast.success(`Expiry saved for ${current.name}`);
      onSaved();
      onClose();
    } catch {
      toast.error("Couldn't save the date. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function split(current: Item) {
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
      _delta: -1,
    });
    if (e1) {
      await supabase.from("items").delete().eq("id", created.id);
      throw e1;
    }
    const { error: e2 } = await supabase.rpc("adjust_item_quantity", {
      _item_id: created.id,
      _delta: 1,
    });
    if (e2) {
      await supabase.rpc("adjust_item_quantity", { _item_id: current.id, _delta: 1 });
      await supabase.from("items").delete().eq("id", created.id);
      throw e2;
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>When does it expire?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Optional — for the {item?.name} you just added.
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
