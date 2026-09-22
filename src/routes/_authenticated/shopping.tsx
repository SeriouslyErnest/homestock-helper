import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ProductPhotoDialog } from "@/components/product-photo-dialog";
import {
  emojiFor,
  formatLocalDateTime,
  isLow,
  nowUtc,
  REQUEST_TAGS,
  useCategories,
  useHousehold,
  useItems,
  useShopping,
  type ShoppingItem,
} from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/shopping")({
  head: () => ({
    meta: [
      { title: "Shopping list — HomeStock" },
      { name: "description", content: "What your household needs to buy." },
      { property: "og:title", content: "Shopping list — HomeStock" },
      { property: "og:description", content: "What your household needs to buy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShoppingPage,
});

function ShoppingPage() {
  const { data: household } = useHousehold();
  const { data: shopping, isPending } = useShopping(household?.id);
  const categories = useCategories();
  const { data: items } = useItems(household?.id);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const toggling = useRef<Set<string>>(new Set());

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shopping", household?.id] });
    queryClient.invalidateQueries({ queryKey: ["items", household?.id] });
  };

  const pending = (shopping ?? []).filter((s) => s.status === "pending");
  const bought = (shopping ?? []).filter((s) => s.status === "bought");

  // Suggested: tracked items at or below their required stock level, not already listed.
  const listedItemIds = new Set(pending.map((p) => p.item_id).filter(Boolean));
  const suggested = (items ?? []).filter(
    (i) => (isLow(i) || i.quantity <= 0) && i.min_quantity > 0 && !listedItemIds.has(i.id),
  );
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));

  async function addQuick(e?: React.FormEvent) {
    e?.preventDefault();
    if (!household || !name.trim()) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("shopping_items").insert({
      household_id: household.id,
      name: name.trim(),
      quantity: Math.max(1, qty),
      note: note.trim() || null,
      tags,
      requested_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't add that to the list. Try again.");
      return;
    }
    setName("");
    setQty(1);
    setNote("");
    setTags([]);
    setShowDetails(false);
    invalidate();
  }

  async function addSuggested(itemId: string, itemName: string) {
    if (!household) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("shopping_items").insert({
      household_id: household.id,
      item_id: itemId,
      name: itemName,
      requested_by: user?.id ?? null,
    });
    if (error) {
      toast.error("Couldn't add that to the list. Try again.");
      return;
    }
    invalidate();
  }

  async function toggle(entry: ShoppingItem) {
    if (toggling.current.has(entry.id)) return;
    toggling.current.add(entry.id);
    try {
      if (entry.status === "pending") {
        const delta = Number(entry.quantity);
        // bought_at is stored as a UTC timestamp; it's displayed in local time.
        const { error } = await supabase
          .from("shopping_items")
          .update({ status: "bought", bought_at: nowUtc(), stock_applied: delta })
          .eq("id", entry.id);
        if (error) {
          toast.error("Couldn't tick that off. Try again.");
          return;
        }
        // Bought something tracked? Restock the inventory item automatically.
        if (entry.item_id && delta !== 0) {
          const { error: stockError } = await supabase.rpc("adjust_item_quantity", {
            _item_id: entry.item_id,
            _delta: delta,
          });
          if (stockError) {
            // Don't leave it ticked off with the stock untouched.
            await supabase
              .from("shopping_items")
              .update({ status: "pending", bought_at: null, stock_applied: 0 })
              .eq("id", entry.id);
            toast.error("Ticked off, but the stock count didn't update. Try again.");
            return;
          }
        }
      } else {
        // Take back exactly what ticking it off added, even if the quantity changed since.
        const applied = Number(entry.stock_applied ?? 0);
        const { error } = await supabase
          .from("shopping_items")
          .update({ status: "pending", bought_at: null, stock_applied: 0 })
          .eq("id", entry.id);
        if (error) {
          toast.error("Couldn't move that back to the list. Try again.");
          return;
        }
        if (entry.item_id && applied !== 0) {
          const { error: stockError } = await supabase.rpc("adjust_item_quantity", {
            _item_id: entry.item_id,
            _delta: -applied,
          });
          if (stockError) {
            // Put it back as bought so the list and the stock stay in step.
            await supabase
              .from("shopping_items")
              .update({ status: "bought", bought_at: nowUtc(), stock_applied: applied })
              .eq("id", entry.id);
            toast.error("Couldn't take that back off the stock count. Try again.");
            return;
          }
        }
      }
      invalidate();
    } finally {
      toggling.current.delete(entry.id);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't remove that. Try again.");
      return;
    }
    invalidate();
  }

  async function clearBought() {
    if (!household?.id) return;
    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("household_id", household.id)
      .eq("status", "bought");
    if (error) {
      toast.error("Couldn't clear the bought items. Try again.");
      return;
    }
    invalidate();
    toast.success("Cleared the bought items");
  }

  return (
    <AppShell
      title="Shopping list"
      subtitle="What the household needs — anyone can add or tick off."
    >
      <form onSubmit={addQuick} className="mb-4">
        <div className="flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add something to buy…"
            aria-label="Add something to buy"
            className="w-full min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-3.5 py-3 outline-none focus:border-brand"
          />
          <div className="flex shrink-0 items-center rounded-2xl border border-border bg-surface-2">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="Fewer to buy"
              className="grid h-11 w-9 place-items-center rounded-l-2xl text-base font-bold disabled:opacity-40"
            >
              −
            </button>
            <span aria-live="polite" className="min-w-6 text-center text-sm font-bold tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              aria-label="One more to buy"
              className="grid h-11 w-9 place-items-center rounded-r-2xl text-base font-bold text-brand"
            >
              +
            </button>
          </div>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            aria-label="Add to shopping list"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Plus size={20} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="mt-2 rounded-xl px-2 py-1.5 text-xs font-bold text-muted-foreground active:bg-surface-2"
        >
          {showDetails ? "Hide details" : "Add details (how many, notes, hints)"}
        </button>

        {showDetails && (
          <div className="mt-2 grid gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">How many</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Fewer"
                  className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-lg font-bold disabled:opacity-40"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  aria-label="How many to buy"
                  className="h-11 w-16 rounded-xl border border-border bg-surface-2 text-center text-base font-bold outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 1)}
                  aria-label="More"
                  className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-lg font-bold text-brand"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <span className="text-sm font-bold">Hints for whoever shops</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {REQUEST_TAGS.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-pressed={on}
                      className={`rounded-full px-3 py-2 text-xs font-bold ${
                        on
                          ? "bg-brand text-white"
                          : "border border-border bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="grid gap-1.5 text-sm font-bold">
              Notes
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. the blue pack, not the green one"
                className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-normal outline-none focus:border-brand"
              />
            </label>
          </div>
        )}
      </form>

      {suggested.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-warning">Running low at home</h2>
          <div className="grid gap-2">
            {suggested.map((item) => (
              <div
                key={item.id}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning-soft text-xl">
                  {emojiFor(item.category, categories)}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{item.name}</strong>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity <= 0
                      ? "Out of stock"
                      : `${item.quantity} left · min ${item.min_quantity}`}
                  </span>
                </div>
                <button
                  onClick={() => addSuggested(item.id, item.name)}
                  className="rounded-xl bg-brand-soft px-3 py-2 text-xs font-bold text-brand"
                >
                  + List
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold">To buy · {pending.length}</h2>
        {isPending && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isPending && pending.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-2xl">🛒</p>
            <p className="mt-1 text-sm text-muted-foreground">Nothing to buy. Enjoy the calm.</p>
          </div>
        )}
        <div className="grid gap-2">
            {pending.map((entry) => {
              const linkedItem = entry.item_id ? itemById.get(entry.item_id) : undefined;
              return (
              <div
              key={entry.id}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
            >
              <button
                onClick={() => toggle(entry)}
                aria-label={`Mark ${entry.name} as bought`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              >
                <span className="block h-7 w-7 rounded-full border-2 border-border" />
              </button>
              {linkedItem?.image_url && (
                <ProductPhotoDialog
                  src={linkedItem.image_url}
                  name={entry.name}
                  triggerClassName="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface-2"
                >
                  <img
                    src={linkedItem.image_url}
                    alt={entry.name}
                    loading="lazy"
                    className="block h-full max-h-full w-full max-w-full object-contain"
                  />
                </ProductPhotoDialog>
              )}
              <div className="min-w-0 flex-1 py-1">
                <strong className="block text-sm break-words">{entry.name}</strong>
                <span className="text-xs text-muted-foreground">×{entry.quantity}</span>
                {(entry.tags?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.tags!.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {entry.note && (
                  <p className="mt-1 rounded-lg bg-warning-soft px-2 py-1 text-xs font-semibold break-words text-warning">
                    {entry.note}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(entry.id)}
                aria-label={`Remove ${entry.name}`}
                className="p-2 text-muted-foreground"
              >
                <Trash2 size={16} />
              </button>
            </div>
              );
            })}
        </div>
      </section>

      {bought.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted-foreground">Bought · {bought.length}</h2>
            <button
              onClick={clearBought}
              className="rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground active:bg-surface-2"
            >
              Clear bought
            </button>
          </div>
          <div className="grid gap-2 opacity-70">
            {bought.map((entry) => {
              const linkedItem = entry.item_id ? itemById.get(entry.item_id) : undefined;
              return (
              <div
                key={entry.id}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
              >
                <button
                  onClick={() => toggle(entry)}
                  aria-label={`Move ${entry.name} back to the list`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-success text-xs font-bold text-white">
                    ✓
                  </span>
                </button>
                {linkedItem?.image_url && (
                  <ProductPhotoDialog
                    src={linkedItem.image_url}
                    name={entry.name}
                    triggerClassName="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface-2"
                  >
                    <img
                      src={linkedItem.image_url}
                      alt={entry.name}
                      loading="lazy"
                      className="block h-full max-h-full w-full max-w-full object-contain"
                    />
                  </ProductPhotoDialog>
                )}
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm break-words line-through">{entry.name}</strong>
                  {entry.bought_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatLocalDateTime(entry.bought_at)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => remove(entry.id)}
                  aria-label={`Remove ${entry.name}`}
                  className="p-2 text-muted-foreground"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}
