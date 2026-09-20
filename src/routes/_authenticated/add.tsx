import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CATEGORIES, useHousehold } from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

type AddSearch = {
  barcode?: string | undefined;
  name?: string | undefined;
  brand?: string | undefined;
  image?: string | undefined;
  category?: string | undefined;
  notFound?: boolean | undefined;
};

export const Route = createFileRoute("/_authenticated/add")({
  validateSearch: (search: Record<string, unknown>): AddSearch => ({
    barcode: typeof search["barcode"] === "string" ? search["barcode"] : undefined,
    name: typeof search["name"] === "string" ? search["name"] : undefined,
    brand: typeof search["brand"] === "string" ? search["brand"] : undefined,
    image: typeof search["image"] === "string" ? search["image"] : undefined,
    category: typeof search["category"] === "string" ? search["category"] : undefined,
    notFound: search["notFound"] === true ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Add an item — HomeStock" },
      { name: "description", content: "Add something to your household inventory." },
      { property: "og:title", content: "Add an item — HomeStock" },
      { property: "og:description", content: "Add something to your household inventory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddPage,
});

function AddPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: household } = useHousehold();

  const fullName = [search.name, search.brand].filter(Boolean).join(" — ");
  const [name, setName] = useState(fullName);
  const [category, setCategory] = useState(
    CATEGORIES.some((c) => c.id === search.category) ? search.category! : "Pantry",
  );
  const [quantity, setQuantity] = useState(1);
  const [minQuantity, setMinQuantity] = useState(0);
  const [location, setLocation] = useState("");
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [addToShopping, setAddToShopping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!household || !name.trim()) return;
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase
      .from("items")
      .insert({
        household_id: household.id,
        name: name.trim(),
        barcode: search.barcode ?? null,
        image_url: search.image ?? null,
        category,
        quantity: Math.max(0, quantity),
        unit: "pcs",
        min_quantity: Math.max(0, minQuantity),
        location: location.trim() || null,
        expires_on: expires || null,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (insertError || !data) {
      setSaving(false);
      setError(insertError?.message ?? "Couldn't save the item. Try again.");
      return;
    }
    if (addToShopping) {
      await supabase.from("shopping_items").insert({
        household_id: household.id,
        item_id: data.id,
        name: name.trim(),
        requested_by: user?.id ?? null,
      });
    }
    navigate({ to: "/item/$itemId", params: { itemId: data.id } });
  }

  const field =
    "w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand";
  const label = "mb-1 block text-xs font-bold text-muted-foreground";

  return (
    <AppShell title="Add an item" subtitle="Only the name is required — add the rest anytime.">
      {search.notFound && (
        <div className="mb-4 rounded-2xl bg-warning-soft p-3.5 text-sm text-warning">
          <strong>We haven't seen barcode {search.barcode} before.</strong> Give it a name and it'll
          be saved for everyone in your household.
        </div>
      )}
      {search.name && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-success-soft p-3.5 text-success">
          {search.image && (
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-card">
              <img
                src={search.image}
                alt=""
                className="block h-full max-h-full w-full max-w-full object-contain"
              />
            </span>
          )}
          <div className="text-sm">
            <strong className="block">{search.name}</strong>
            {search.brand && <span>{search.brand}</span>}
          </div>
        </div>
      )}

      <form onSubmit={save} className="grid gap-4">
        <div>
          <label htmlFor="name" className={label}>
            Name *
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Whole milk"
            className={field}
            required
          />
        </div>

        <div>
          <label htmlFor="quantity" className={label}>
            Quantity
          </label>
          <div className="grid grid-cols-[3rem_minmax(0,6rem)_3rem] items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((current) => Math.max(0, current - 1))}
              disabled={quantity <= 0}
              aria-label="Reduce quantity"
              className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-card text-muted-foreground active:bg-surface-2 disabled:opacity-40"
            >
              <Minus size={20} />
            </button>
            <input
              id="quantity"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
              aria-label="Quantity"
              className="h-12 min-w-0 rounded-2xl border border-border bg-surface-2 px-2 text-center text-xl font-bold outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => setQuantity((current) => current + 1)}
              aria-label="Increase quantity"
              className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand active:bg-surface-2"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="category" className={label}>
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={field}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="location" className={label}>
              Location
            </label>
            <input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Fridge door"
              className={field}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="expires" className={label}>
              Expires (optional)
            </label>
            <input
              id="expires"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={field}
            />
            <div className="mt-2 flex gap-2">
              {[3, 5, 14].map((d) => {
                const target = quickExpiry(d);
                const active = expires === target;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setExpires(active ? "" : target)}
                    aria-pressed={active}
                    className={
                      "h-10 flex-1 rounded-2xl border text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                      (active
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-border bg-card text-muted-foreground active:bg-surface-2")
                    }
                  >
                    {d} days
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="min" className={label}>
              Keep at least
            </label>
            <input
              id="min"
              type="number"
              min={0}
              step="any"
              value={minQuantity}
              onChange={(e) => setMinQuantity(Math.max(0, Number(e.target.value) || 0))}
              className={field}
            />
          </div>
        </div>

        <div>
          <label htmlFor="notes" className={label}>
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Brand preference, storage tip…"
            className={field}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-sm">
          <input
            type="checkbox"
            checked={addToShopping}
            onChange={(e) => setAddToShopping(e.target.checked)}
            className="h-5 w-5"
          />
          Also add to the shopping list
        </label>

        <p role="alert" aria-live="assertive" className="text-sm font-semibold text-warning">
          {error}
        </p>

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-2xl bg-primary py-4 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save to inventory"}
        </button>
      </form>
    </AppShell>
  );
}
