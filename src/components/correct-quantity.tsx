import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { correctQuantity, type Item } from "@/lib/homestock";
import { cn } from "@/lib/utils";

/**
 * "The record says 3, there are really 2." One number, Save, done.
 * The note is optional and never blocks the fix; the change is recorded as a
 * correction so the household can see what happened, and Undo puts it back.
 */
export function CorrectQuantityDialog({
  item,
  trigger,
  triggerClassName,
}: {
  item: Pick<Item, "id" | "name" | "quantity" | "unit" | "household_id">;
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(Number(item.quantity)));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["items", item.household_id] });
    queryClient.invalidateQueries({ queryKey: ["item", item.id] });
    queryClient.invalidateQueries({ queryKey: ["item-usage", item.household_id] });
  }

  async function save() {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter how many there really are — zero or more.");
      return;
    }
    setSaving(true);
    const previous = Number(item.quantity);
    try {
      await correctQuantity(item.id, next, note);
      refresh();
      setOpen(false);
      setNote("");
      toast(`${item.name} updated to ${next}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const { error } = await supabase.rpc("set_item_quantity", {
              _item_id: item.id,
              _quantity: previous,
              _note: "Undo correction",
            });
            refresh();
            if (error) toast.error("Couldn't undo that. Try again.");
          },
        },
        duration: 6000,
      });
    } catch {
      toast.error("Couldn't save that count. Check your connection and try again.");
    }
    setSaving(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(String(Number(item.quantity)));
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`Correct the count for ${item.name}`}
          className={cn(
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            triggerClassName,
          )}
        >
          {trigger}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-t-3xl border border-border bg-background p-5 outline-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <Dialog.Title className="text-base font-semibold">Correct the count</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {item.name} — we have it as {Number(item.quantity)} {item.unit}. How many are really
            there?
          </Dialog.Description>

          <label
            htmlFor="cq-value"
            className="mt-4 mb-1 block text-xs font-bold text-muted-foreground"
          >
            Actual quantity
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setValue(String(Math.max(0, (Number(value) || 0) - 1)))}
              aria-label="One fewer"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border text-xl"
            >
              −
            </button>
            <input
              id="cq-value"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-center text-2xl font-bold outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => setValue(String((Number(value) || 0) + 1))}
              aria-label="One more"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border text-xl"
            >
              +
            </button>
          </div>

          <label
            htmlFor="cq-note"
            className="mt-3 mb-1 block text-xs font-bold text-muted-foreground"
          >
            Note (optional)
          </label>
          <input
            id="cq-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Physical count, spilled, thrown out…"
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-2xl border border-border py-3 text-sm font-bold"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
