import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlignJustify, LayoutGrid, List, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  CATEGORIES,
  categoryEmoji,
  formatLocalDate,
  isExpiringInDays,
  isExpiringSoon,
  isLow,
  productKey,
  sortByExpiry,
  sortByProductThenLocation,
  sortByRecentlyUpdated,
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

/**
 * Fully consumed with no minimum set — nothing left and nothing we're
 * tracking to rebuy. These quietly leave the everyday inventory list;
 * searching still finds them.
 */
function isUsedUp(item: Item): boolean {
  return item.quantity <= 0 && item.min_quantity <= 0;
}

function InventoryPage() {
  const { data: household } = useHousehold();
  const { data: items, isPending } = useItems(household?.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  // Low-stock and expiring filters combine, so you can see either or both.
  const [showLow, setShowLow] = useState(false);
  const [showExpiring, setShowExpiring] = useState(false);
  const [view, setView] = useState<"list" | "cards" | "compact">("list");
  const [sort, setSort] = useState<"name" | "expiry" | "updated">("name");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Read the remembered view/sort after mount so the first render always matches the server.
  useEffect(() => {
    const stored = localStorage.getItem("homestock-view");
    if (stored === "list" || stored === "cards" || stored === "compact") setView(stored);
    const storedSort = localStorage.getItem("homestock-sort");
    if (storedSort === "name" || storedSort === "expiry" || storedSort === "updated")
      setSort(storedSort);
  }, []);

  const filtered = useMemo(() => {
    let list = items ?? [];
    if (search.trim()) {
      // Searching looks through everything, including used-up items, so an
      // item that's hidden from the everyday list is still findable.
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.location ?? "").toLowerCase().includes(q),
      );
    } else {
      list = list.filter((i) => !isUsedUp(i));
      // Low-stock and expiring filters combine, so you can see either or both.
      if (showLow || showExpiring) {
        list = list.filter(
          (i) =>
            (showLow && (isLow(i) || i.quantity <= 0)) || (showExpiring && isExpiringSoon(i)),
        );
      } else if (category !== "All") list = list.filter((i) => i.category === category);
    }
    // Same product in two places sits together, so "Milk (Fridge)" and "Milk (Garage)" read as one thing.
    if (sort === "expiry") return sortByExpiry(list);
    if (sort === "updated") return sortByRecentlyUpdated(list);
    return sortByProductThenLocation(list);
  }, [items, search, category, showLow, showExpiring, sort]);

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

  // The "3 in total · 2 places" note belongs on the first row of a product only.
  // Sorting by expiry or updated can split a product's rows apart, so track the
  // first appearance instead of comparing with the previous row.
  const groupLeaders = useMemo(() => {
    const seen = new Set<string>();
    const leaders = new Set<string>();
    for (const i of filtered) {
      const key = productKey(i);
      if (!seen.has(key)) {
        seen.add(key);
        leaders.add(i.id);
      }
    }
    return leaders;
  }, [filtered]);


  // Needs attention = out / below minimum, or expiring within 3 days.
  // Used-up items without a minimum are retired, so they don't nag here.
  const attention = (items ?? []).filter(
    (i) => !isUsedUp(i) && (isLow(i) || i.quantity <= 0 || isExpiringInDays(i, 3)),
  ).length;
  // Expiring within a day gets its own card so it can't be missed.
  const expiringNow = (items ?? []).filter((i) => isExpiringInDays(i, 1)).length;
  // "items tracked" mirrors what the list shows, so the number and the rows agree.
  const trackedCount = (items ?? []).filter((i) => !isUsedUp(i)).length;
  const hiddenCount = (items ?? []).filter(isUsedUp).length;

  function switchView(v: "list" | "cards" | "compact") {
    setView(v);
    localStorage.setItem("homestock-view", v);
  }

  function switchSort(s: "name" | "expiry" | "updated") {
    setSort(s);
    localStorage.setItem("homestock-sort", s);
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

  const chips = CATEGORIES.map((c) => c.id);

  function pickCategory(c: string) {
    setCategory(c);
    setShowLow(false);
    setShowExpiring(false);
  }

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
        aria-label="Inventory filters"
      >
        <button
          onClick={() => pickCategory("All")}
          className={`rounded-full border px-3.5 py-2 text-sm whitespace-nowrap ${
            category === "All" && !showLow && !showExpiring
              ? "border-transparent bg-brand-soft font-bold text-brand"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          All items
        </button>
        <button
          onClick={() => {
            setShowLow((v) => !v);
            setCategory("All");
          }}
          aria-pressed={showLow}
          className={`rounded-full border px-3.5 py-2 text-sm whitespace-nowrap ${
            showLow
              ? "border-transparent bg-warning-soft font-bold text-warning"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          ⚠ Low
        </button>
        <button
          onClick={() => {
            setShowExpiring((v) => !v);
            setCategory("All");
          }}
          aria-pressed={showExpiring}
          className={`rounded-full border px-3.5 py-2 text-sm whitespace-nowrap ${
            showExpiring
              ? "border-transparent bg-danger-soft font-bold text-destructive"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          ⏳ Expiring
        </button>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => pickCategory(c)}
            className={`rounded-full border px-3.5 py-2 text-sm whitespace-nowrap ${
              category === c && !showLow && !showExpiring
                ? "border-transparent bg-brand-soft font-bold text-brand"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {`${categoryEmoji(c)} ${c}`}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl bg-success-soft p-3 text-success">
          <strong className="block text-xl">{trackedCount}</strong>
          <span className="text-xs font-bold">items tracked</span>
        </div>
        <button
          onClick={() => {
            const both = showLow && showExpiring;
            setShowLow(!both);
            setShowExpiring(!both);
            setCategory("All");
          }}
          aria-pressed={showLow && showExpiring}
          className={`rounded-2xl p-3 text-left ${attention > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
        >
          <strong className="block text-xl">{attention}</strong>
          <span className="text-xs font-bold">need attention</span>
        </button>
        <button
          onClick={() => {
            setShowExpiring((v) => !v);
            setCategory("All");
          }}
          aria-pressed={showExpiring && !showLow}
          className={`rounded-2xl p-3 text-left ${expiringNow > 0 ? "bg-danger-soft text-destructive" : "bg-success-soft text-success"}`}
        >
          <strong className="block text-xl">{expiringNow}</strong>
          <span className="text-xs font-bold">expiring soon</span>
        </button>
      </div>

      {hiddenCount > 0 && !search.trim() && (
        <p className="mb-3 text-xs text-muted-foreground">
          {hiddenCount} fully used-up item{hiddenCount === 1 ? "" : "s"} hidden — search to find{" "}
          {hiddenCount === 1 ? "it" : "them"}.
        </p>
      )}

      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-lg font-semibold">Inventory</h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground">
            {filtered.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={sort}
            onChange={(e) => switchSort(e.target.value as "name" | "expiry" | "updated")}
            aria-label="Sort inventory by"
            className="h-9 max-w-[7.5rem] rounded-xl border border-border bg-surface-2 px-2 text-xs outline-none focus:border-brand"
          >
            <option value="name">Sort: Name</option>
            <option value="expiry">Sort: Expiry</option>
            <option value="updated">Sort: Updated</option>
          </select>
          <div
            className="flex rounded-xl border border-border bg-surface-2 p-1"
            aria-label="Choose inventory view"
          >
            <button
              onClick={() => switchView("list")}
              aria-label="Detailed list view"
              className={`grid h-8 w-8 place-items-center rounded-lg ${view === "list" ? "bg-card text-brand shadow-sm" : "text-muted-foreground"}`}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => switchView("compact")}
              aria-label="Compact list view"
              className={`grid h-8 w-8 place-items-center rounded-lg ${view === "compact" ? "bg-card text-brand shadow-sm" : "text-muted-foreground"}`}
            >
              <AlignJustify size={16} />
            </button>
            <button
              onClick={() => switchView("cards")}
              aria-label="Card view"
              className={`grid h-8 w-8 place-items-center rounded-lg ${view === "cards" ? "bg-card text-brand shadow-sm" : "text-muted-foreground"}`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
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

      <div
        className={
          view === "cards"
            ? "grid grid-cols-2 gap-2.5"
            : view === "compact"
              ? "grid gap-1.5"
              : "grid gap-2"
        }
      >
        {filtered.map((item) => {
          const status = statusOf(item);
          const key = productKey(item);
          const group = spread.get(key);
          const multiPlace = (group?.places ?? 1) > 1;
          // Only the first row of a cluster carries the "3 total across 2 places" note.
          const leadsGroup = multiPlace && groupLeaders.has(item.id);
          const place = item.location?.trim();
          // updated_at is a UTC timestamp; render the calendar day in the viewer's own timezone.
          const updated = `Upd ${new Date(item.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
          const meta = [
            item.category,
            item.expires_on
              ? `${isExpiringSoon(item) ? "⚠ " : ""}Exp ${formatLocalDate(item.expires_on, { day: "numeric", month: "short", ...(item.expires_on.slice(0, 4) === String(new Date().getFullYear()) ? {} : { year: "numeric" }) })}`
              : null,
            item.min_quantity > 0 ? `Min ${item.min_quantity}` : null,
            updated,
          ]
            .filter(Boolean)
            .slice(0, 3)
            .join(" · ");

          const thumb = item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              loading="lazy"
              className="block h-full max-h-full w-full max-w-full object-contain"
            />
          ) : (
            categoryEmoji(item.category)
          );

          if (view === "compact") {
            return (
              <article
                key={item.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 rounded-xl border border-border bg-card px-2.5 py-1.5"
              >
                <Link to="/item/$itemId" params={{ itemId: item.id }} className="min-w-0">
                  <strong className="block truncate text-sm">
                    {item.name}
                    {place && (
                      <span className="font-normal text-muted-foreground"> ({place})</span>
                    )}
                  </strong>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px]">
                    <span
                      className={`shrink-0 font-extrabold tracking-wide uppercase ${status.low ? "text-warning" : "text-success"}`}
                    >
                      {status.label}
                    </span>
                    {item.expires_on && (
                      <span
                        className={`truncate ${isExpiringSoon(item) ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        · Exp {formatLocalDate(item.expires_on, { day: "numeric", month: "short" })}
                      </span>
                    )}
                    {leadsGroup && (
                      <span className="truncate text-muted-foreground">
                        · {group?.total} in {group?.places} places
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => adjust(item, -1)}
                    disabled={item.quantity <= 0 || busyId === item.id}
                    aria-label={`Use one ${item.name}`}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground active:bg-surface-2 disabled:opacity-40"
                  >
                    <Minus size={15} />
                  </button>
                  <strong className="w-9 text-center text-base leading-none">
                    {item.quantity}
                  </strong>
                  <button
                    onClick={() => adjust(item, 1)}
                    disabled={busyId === item.id}
                    aria-label={`Restock one ${item.name}`}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground active:bg-surface-2 disabled:opacity-40"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </article>
            );
          }

          if (view === "cards") {
            return (
              <Link
                key={item.id}
                to="/item/$itemId"
                params={{ itemId: item.id }}
                className="block min-w-0 rounded-2xl border border-border bg-card p-3"
              >
                <div className="mb-2 grid h-20 w-full place-items-center overflow-hidden rounded-xl bg-surface-2 text-3xl">
                  {thumb}
                </div>
                <strong className="block truncate text-sm">
                  {item.name}
                  {place && <span className="font-normal text-muted-foreground"> ({place})</span>}
                </strong>
                <div className="mt-1 h-4 truncate text-xs text-muted-foreground">
                  {multiPlace ? `${group?.total} in total · ${group?.places} places` : meta}
                </div>
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
                className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-2xl"
              >
                {thumb}
              </Link>
              <Link to="/item/$itemId" params={{ itemId: item.id }} className="min-w-0 flex-1">
                <strong className="block truncate text-sm">
                  {item.name}
                  {place && <span className="font-normal text-muted-foreground"> ({place})</span>}
                </strong>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {leadsGroup ? `${group?.total} in total · ${group?.places} places · ` : ""}
                  {meta}
                </div>
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
