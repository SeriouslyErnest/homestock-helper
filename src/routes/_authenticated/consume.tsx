import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ProductPhotoDialog } from "@/components/product-photo-dialog";
import { emojiFor, useCategories, useHousehold, useItems, type Item } from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/consume")({
  head: () => ({
    meta: [
      { title: "Use up — HomeStock" },
      { name: "description", content: "Take something from the shelf with one tap." },
      { property: "og:title", content: "Use up — HomeStock" },
      { property: "og:description", content: "Take something from the shelf with one tap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsumePage,
});

function ConsumePage() {
  const { data: household } = useHousehold();
  const categories = useCategories();
  const { data: items, isPending } = useItems(household?.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["items", household?.id] });
  };

  async function take(item: Item) {
    if (busyId) return;
    setBusyId(item.id);
    const { error } = await supabase.rpc("adjust_item_quantity", {
      _item_id: item.id,
      _delta: -1,
    });
    invalidate();
    setBusyId(null);
    if (error) {
      toast.error(`Couldn't update ${item.name}. Check your connection and try again.`);
      return;
    }
    toast(`Took one ${item.name}`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: undoError } = await supabase.rpc("adjust_item_quantity", {
            _item_id: item.id,
            _delta: 1,
          });
          invalidate();
          if (undoError) toast.error("Couldn't undo that. Try again.");
        },
      },
      duration: 5000,
    });
  }

  const list = useMemo(() => {
    const all = items ?? [];
    if (!search.trim()) {
      return [...all].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 12);
    }
    const q = search.trim().toLowerCase();
    return all.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.location ?? "").toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <AppShell
      title="Use something up"
      subtitle="Tap once — you can undo straight away."
      headerExtra={
        <div className="mt-4 flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search what's at home"
            aria-label="Search what's at home"
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />
          <Link
            to="/scan"
            aria-label="Scan a barcode instead"
            className="grid w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"
          >
            <ScanBarcode size={20} />
          </Link>
        </div>
      }
    >
      <h2 className="mb-2 text-sm font-bold text-muted-foreground">
        {search.trim() ? `Matches · ${list.length}` : "Recently used"}
      </h2>

      {isPending && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}

      {!isPending && list.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-3xl">🥣</p>
          <p className="mt-2 font-semibold">Nothing to take yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add something to your inventory first.
          </p>
          <Link
            to="/add"
            className="mt-4 inline-block rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Add an item
          </Link>
        </div>
      )}

      <div className="grid gap-2">
        {list.map((item) => (
          <article
            key={item.id}
            className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
          >
            {item.image_url ? (
              <ProductPhotoDialog
                src={item.image_url}
                name={item.name}
                triggerClassName="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface-2"
              >
                <img
                  src={item.image_url}
                  alt={item.name}
                  loading="lazy"
                  className="block h-full max-h-full w-full max-w-full object-contain"
                />
              </ProductPhotoDialog>
            ) : (
              <Link
                to="/item/$itemId"
                params={{ itemId: item.id }}
                className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-2xl"
              >
                emojiFor(item.category, categories)
              </Link>
            )}
            <Link to="/item/$itemId" params={{ itemId: item.id }} className="min-w-0 flex-1">
              <strong className="block line-clamp-2 text-sm break-words">{item.name}</strong>
              <span className="text-xs text-muted-foreground">
                {item.quantity} {item.unit} left
              </span>
            </Link>
            <button
              onClick={() => take(item)}
              disabled={item.quantity <= 0 || busyId === item.id}
              aria-label={`Take one ${item.name}`}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-brand-soft px-4 text-sm font-bold text-brand disabled:opacity-40"
            >
              <Minus size={16} /> 1
            </button>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
