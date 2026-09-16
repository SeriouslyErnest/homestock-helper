import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  categoryEmoji,
  isLow,
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
  const { data: items } = useItems(household?.id);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const toggling = useRef<Set<string>>(new Set());

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

  async function addQuick(e?: React.FormEvent) {
    e?.preventDefault();
    if (!household || !name.trim()) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("shopping_items").insert({
      household_id: household.id,
      name: name.trim(),
      requested_by: user?.id ?? null,
    });
    setName("");
    setBusy(false);
    invalidate();
  }

  async function addSuggested(itemId: string, itemName: string) {
    if (!household) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("shopping_items").insert({
      household_id: household.id,
      item_id: itemId,
      name: itemName,
      requested_by: user?.id ?? null,
    });
    invalidate();
  }

  async function toggle(entry: ShoppingItem) {
    if (toggling.current.has(entry.id)) return;
    toggling.current.add(entry.id);
    try {
    if (entry.status === "pending") {
      await supabase
        .from("shopping_items")
        .update({ status: "bought", bought_at: new Date().toISOString() })
        .eq("id", entry.id);
      // Bought something tracked? Restock the inventory item automatically.
      if (entry.item_id) {
        await supabase.rpc("adjust_item_quantity", {
          _item_id: entry.item_id,
          _delta: Number(entry.quantity),
        });
      }
    } else {
      await supabase
        .from("shopping_items")
        .update({ status: "pending", bought_at: null })
        .eq("id", entry.id);
    }
    invalidate();
    } finally {
      toggling.current.delete(entry.id);
    }
  }

  async function remove(id: string) {
    await supabase.from("shopping_items").delete().eq("id", id);
    invalidate();
  }

  return (
    <AppShell title="Shopping list" subtitle="What the household needs — anyone can add or tick off.">
      <form onSubmit={addQuick} className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add something to buy…"
          aria-label="Add something to buy"
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          aria-label="Add to shopping list"
          className="grid w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Plus size={20} />
        </button>
      </form>

      {suggested.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-warning">Running low at home</h2>
          <div className="grid gap-2">
            {suggested.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning-soft text-xl">
                  {categoryEmoji(item.category)}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{item.name}</strong>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity <= 0 ? "Out of stock" : `${item.quantity} left · min ${item.min_quantity}`}
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
          {pending.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
              <button
                onClick={() => toggle(entry)}
                aria-label={`Mark ${entry.name} as bought`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-border"
              />
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{entry.name}</strong>
                <span className="text-xs text-muted-foreground">
                  ×{entry.quantity}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
              </div>
              <button
                onClick={() => remove(entry.id)}
                aria-label={`Remove ${entry.name}`}
                className="p-2 text-muted-foreground"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {bought.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">Bought · {bought.length}</h2>
          <div className="grid gap-2 opacity-70">
            {bought.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
                <button
                  onClick={() => toggle(entry)}
                  aria-label={`Move ${entry.name} back to the list`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success text-xs font-bold text-white"
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm line-through">{entry.name}</strong>
                </div>
                <button
                  onClick={() => remove(entry.id)}
                  aria-label={`Remove ${entry.name}`}
                  className="p-2 text-muted-foreground"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
