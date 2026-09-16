import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  CATEGORIES,
  categoryEmoji,
  formatLocalDate,
  isExpiringSoon,
  isLow,
  productKey,
  sortByProductThenLocation,
  useHousehold,
  useItems,
  type Item,
} from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — HomeStock" },
      { name: "description", content: "See your household stock at a glance." },
      { property: "og:title", content: "Inventory — HomeStock" },
      { property: "og:description", content: "See your household stock at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryPage,
});

function statusOf(item: Item): { label: string; low: boolean } {
  if (item.quantity <= 0) return { label: "Out", low: true };
  if (isLow(item)) return { label: "Low", low: true };
  return { label: "In stock", low: false };
}

function InventoryPage() {
  const { data: household } = useHousehold();
  const { data: items, isPending } = useItems(household?.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [view, setView] = useState<"list" | "cards">("list");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Read the remembered view after mount so the first render always matches the server.
  useEffect(() => {
    const stored = localStorage.getItem("homestock-view");
    if (stored === "list" || stored === "cards") setView(stored);
  }, []);

  const filtered = useMemo(() => {
    let list = items ?? [];
    if (category === "Low") list = list.filter((i) => isLow(i) || i.quantity <= 0);
    else if (category !== "All") list = list.filter((i) => i.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.location ?? "").toLowerCase().includes(q),
      );
    }
    // Same product in two places sits together, so "Milk (Fridge)" and "Milk (Garage)" read as one thing.
    return sortByProductThenLocation(list);
  }, [items, search, category]);

  /** How many rows and how much stock each product has across every place. */
  const spread = useMemo(() => {
    const map = new Map<string, { places: number; total: number }>();
    for (const i of items ?? []) {
      const key = productKey(i);
      const current = map.get(key) ?? { places: 0, total: 0 };
      map.set(key, { places: current.places + 1, total: current.total + Number(i.quantity) });
    }
    return map;
  }, [items]);

  const attention = (items ?? []).filter((i) => isLow(i) || i.quantity <= 0).length;

  function switchView(v: "list" | "cards") {
    setView(v);
    localStorage.setItem("homestock-view", v);
  }

  async function apply(item: Item, delta: number) {
    const { error } = await supabase.rpc("adjust_item_quantity", {
      _item_id: item.id,
      _delta: delta,
    });
    queryClient.invalidateQueries({ queryKey: ["items", household?.id] });
    queryClient.invalidateQueries({ queryKey: ["item", item.id] });
    if (error) {
      toast.error(`Couldn't update ${item.name}. Check your connection and try again.`);
      return false;
    }
    return true;
  }

  async function adjust(item: Item, delta: number) {
    if (busyId) return;
    setBusyId(item.id);
    const ok = await apply(item, delta);
    setBusyId(null);
    // Only offer Undo once the change actually landed on the server.
    if (!ok) return;
    toast(delta < 0 ? `Took one ${item.name}` : `Added one ${item.name}`, {
      action: { label: "Undo", onClick: () => void apply(item, -delta) },
      duration: 5000,
    });
  }

  const chips = ["All", "Low", ...CATEGORIES.map((c) => c.id)];

  return (
    <AppShell
      title="What's at home"
      subtitle={household ? `${household.name} · shared with your household` : undefined}
      headerExtra={
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_3rem] gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search household inventory"
            aria-label="Search household inventory"
            className="min-w-0 rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />
          <Link
            to="/add"
            aria-label="Add an item"
            className="grid w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"
          >
            <Plus size={20} />
          </Link>
        </div>
      }
    >
      <div
        className="mb-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1"
        aria-label="Inventory categories"
      >
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3.5 py-2 text-sm whitespace-nowrap ${
              category === c
                ? "border-transparent bg-brand-soft font-bold text-brand"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {c === "All" ? "All items" : c === "Low" ? "⚠ Low" : `${categoryEmoji(c)} ${c}`}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-success-soft p-3.5 text-success">
          <strong className="block text-xl">{items?.length ?? 0}</strong>
          <span className="text-xs font-bold">items tracked</span>
        </div>
        <div
          className={`rounded-2xl p-3.5 ${attention > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
        >
          <strong className="block text-xl">{attention}</strong>
          <span className="text-xs font-bold">need attention</span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-lg font-semibold">Inventory</h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground">
            {filtered.length}
          </span>
        </div>
        <div
          className="flex rounded-xl border border-border bg-surface-2 p-1"
          aria-label="Choose inventory view"
        >
          <button
            onClick={() => switchView("list")}
            aria-label="List view"
            className={`grid h-8 w-9 place-items-center rounded-lg ${view === "list" ? "bg-card text-brand shadow-sm" : "text-muted-foreground"}`}
          >
            <List size={16} />
          </button>
          <button
            onClick={() => switchView("cards")}
            aria-label="Card view"
            className={`grid h-8 w-9 place-items-center rounded-lg ${view === "cards" ? "bg-card text-brand shadow-sm" : "text-muted-foreground"}`}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      </div>

      {isPending && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}

      {!isPending && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-3xl">🧺</p>
          <p className="mt-2 font-semibold">
            {(items ?? []).length === 0 ? "Nothing tracked yet" : "No matches"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {(items ?? []).length === 0
              ? "Add your first item — it takes a few seconds."
              : "Try a different search or category."}
          </p>
          {(items ?? []).length === 0 && (
            <Link
              to="/add"
              className="mt-4 inline-block rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Add an item
            </Link>
          )}
        </div>
      )}

      <div className={view === "cards" ? "grid grid-cols-2 gap-2.5" : "grid gap-2"}>
        {filtered.map((item, index) => {
          const status = statusOf(item);
          const key = productKey(item);
          const group = spread.get(key);
          const multiPlace = (group?.places ?? 1) > 1;
          // Only the first row of a cluster carries the "3 total across 2 places" note.
          const leadsGroup = multiPlace && (index === 0 || productKey(filtered[index - 1]!) !== key);
          const place = item.location?.trim();
          const meta = [
            item.category,
            item.expires_on
              ? `${isExpiringSoon(item) ? "⚠ " : ""}Exp ${formatLocalDate(item.expires_on, { day: "numeric", month: "short", ...(item.expires_on.slice(0, 4) === String(new Date().getFullYear()) ? {} : { year: "numeric" }) })}`
              : null,
            item.min_quantity > 0 ? `Min ${item.min_quantity}` : null,
          ]
            .filter(Boolean)
            .slice(0, 2)
            .join(" · ");

          const thumb = item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              loading="lazy"
              className="h-full w-full rounded-xl object-contain"
            />
          ) : (
            categoryEmoji(item.category)
          );

          if (view === "cards") {
            return (
              <Link
                key={item.id}
                to="/item/$itemId"
                params={{ itemId: item.id }}
                className="block rounded-2xl border border-border bg-card p-3"
              >
                <div className="mb-2 grid h-20 w-full place-items-center rounded-xl bg-surface-2 text-3xl">
                  {thumb}
                </div>
                <strong className="block truncate text-sm">{item.name}</strong>
                <div className="mt-1 h-4 truncate text-xs text-muted-foreground">{meta}</div>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
                  <span className="text-lg font-bold">{item.quantity}</span>
                  <span
                    className={`truncate text-right text-[10px] font-extrabold tracking-wide uppercase ${status.low ? "text-warning" : "text-success"}`}
                  >
                    {status.label}
                  </span>
                </div>
              </Link>
            );
          }

          return (
            <article
              key={item.id}
              className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card p-2.5"
            >
              <Link
                to="/item/$itemId"
                params={{ itemId: item.id }}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl"
              >
                {thumb}
              </Link>
              <Link to="/item/$itemId" params={{ itemId: item.id }} className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{item.name}</strong>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</div>
              </Link>
              <div className="col-span-2 grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1 border-t border-border pt-2">
                <button
                  onClick={() => adjust(item, -1)}
                  disabled={item.quantity <= 0 || busyId === item.id}
                  aria-label={`Use one ${item.name}`}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-border text-muted-foreground active:bg-surface-2 disabled:opacity-40"
                >
                  <Minus size={18} />
                </button>
                <div className="min-w-0 text-center">
                  <strong className="block truncate text-lg leading-tight">
                    {item.quantity} {item.unit}
                  </strong>
                  <span
                    className={`block truncate text-[9px] font-extrabold tracking-wide uppercase ${status.low ? "text-warning" : "text-success"}`}
                  >
                    {status.label}
                  </span>
                </div>
                <button
                  onClick={() => adjust(item, 1)}
                  disabled={busyId === item.id}
                  aria-label={`Restock one ${item.name}`}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-border text-muted-foreground active:bg-surface-2 disabled:opacity-40"
                >
                  <Plus size={18} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
