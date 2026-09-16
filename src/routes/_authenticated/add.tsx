import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CATEGORIES, useHousehold } from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

type AddSearch = {
  barcode?: string | undefined;
  name?: string | undefined;
  brand?: string | undefined;
  image?: string | undefined;
  notFound?: boolean | undefined;
};

export const Route = createFileRoute("/_authenticated/add")({
  validateSearch: (search: Record<string, unknown>): AddSearch => ({
    barcode: typeof search.barcode === "string" ? search.barcode : undefined,
    name: typeof search.name === "string" ? search.name : undefined,
    brand: typeof search.brand === "string" ? search.brand : undefined,
    image: typeof search.image === "string" ? search.image : undefined,
    notFound: search.notFound === true ? true : undefined,
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
  const [category, setCategory] = useState("Pantry");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("pcs");
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
        quantity,
        unit,
        min_quantity: minQuantity,
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
            <img src={search.image} alt="" className="h-10 w-10 rounded-xl bg-white object-contain" />
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="quantity" className={label}>
              Quantity
            </label>
            <input
              id="quantity"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="unit" className={label}>
              Unit
            </label>
            <input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs, L, kg…"
              className={field}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="category" className={label}>
              Category
            </label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
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
              onChange={(e) => setMinQuantity(Number(e.target.value))}
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

        {error && <p className="text-sm font-semibold text-warning">{error}</p>}

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
