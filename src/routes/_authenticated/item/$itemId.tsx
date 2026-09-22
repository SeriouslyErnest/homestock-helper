import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ProductPhotoDialog } from "@/components/product-photo-dialog";
import {
  emojiFor,
  useCategories,
  formatLocalDate,
  isExpiringSoon,
  isLow,
  nowUtc,
  productKey,
  sortByProductThenLocation,
  useHousehold,
  type Item,
} from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/item/$itemId")({
  head: () => ({
    meta: [
      { title: "Item — HomeStock" },
      { name: "description", content: "Adjust stock, expiry and details for this item." },
      { property: "og:title", content: "Item — HomeStock" },
      { property: "og:description", content: "Adjust stock, expiry and details for this item." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ItemPage,
});

function ItemPage() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: household } = useHousehold();
  const categories = useCategories();
  const queryClient = useQueryClient();

  const { data: item, isPending } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", itemId).single();
      if (error) throw error;
      return data;
    },
  });

  // The same product kept somewhere else is its own row — show them together.
  const { data: siblings } = useQuery({
    queryKey: ["item-places", household?.id, item ? productKey(item) : null],
    enabled: Boolean(household && item),
    queryFn: async () => {
      const query = supabase.from("items").select("*").eq("household_id", household!.id);
      const { data, error } = item!.barcode
        ? await query.eq("barcode", item!.barcode)
        : await query.ilike("name", item!.name);
      if (error) throw error;
      return sortByProductThenLocation((data ?? []) as Item[]).filter((row) => row.id !== itemId);
    },
  });

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Pantry");
  const [location, setLocation] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [minQuantity, setMinQuantity] = useState(0);
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [undo, setUndo] = useState<{
    previous: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // The tab title should name the item once it has loaded.
  useEffect(() => {
    if (item?.name) document.title = `${item.name} — HomeStock`;
  }, [item?.name]);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setLocation(item.location ?? "");
      setUnit(item.unit);
      setMinQuantity(Number(item.min_quantity));
      setExpires(item.expires_on ?? "");
      setNotes(item.notes ?? "");
    }
  }, [item]);

  useEffect(
    () => () => {
      if (undo) clearTimeout(undo.timer);
    },
    [undo],
  );

  if (isPending) {
    return (
      <AppShell title="Item">
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (item == null) {
    return (
      <AppShell title="Item not found">
        <p className="py-8 text-center text-sm text-muted-foreground">
          This item may have been removed.{" "}
          <Link to="/inventory" className="font-semibold text-brand">
            Back to inventory
          </Link>
        </p>
      </AppShell>
    );
  }

  const quantity = Number(item.quantity);

  async function adjust(delta: number, withUndo = false) {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("adjust_item_quantity", {
      _item_id: itemId,
      _delta: delta,
    });
    queryClient.invalidateQueries({ queryKey: ["item", itemId] });
    queryClient.invalidateQueries({ queryKey: ["items", household?.id] });
    setBusy(false);
    if (error) {
      toast.error("Couldn't update the count. Check your connection and try again.");
      return;
    }
    // Only offer Undo once the change actually landed on the server.
    if (withUndo) {
      if (undo) clearTimeout(undo.timer);
      const timer = setTimeout(() => setUndo(null), 4000);
      setUndo({ previous: -delta, timer });
    }
  }

  function undoLast() {
    if (!undo) return;
    clearTimeout(undo.timer);
    const revert = undo.previous;
    setUndo(null);
    void adjust(revert);
  }

  async function saveDetails() {
    const { error } = await supabase
      .from("items")
      .update({
        name: name.trim() || item!.name,
        category,
        location: location.trim() || null,
        unit,
        min_quantity: Math.max(0, minQuantity),
        expires_on: expires || null,
        notes: notes.trim() || null,
        updated_at: nowUtc(),
      })
      .eq("id", itemId);
    queryClient.invalidateQueries({ queryKey: ["item", itemId] });
    queryClient.invalidateQueries({ queryKey: ["items", household?.id] });
    if (error) {
      toast.error("Couldn't save your changes. Try again.");
      return;
    }
    toast.success("Saved");
  }

  async function addToShopping() {
    if (!household) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("shopping_items").insert({
      household_id: household.id,
      item_id: itemId,
      name: item!.name,
      requested_by: user?.id ?? null,
    });
    if (error) {
      toast.error("Couldn't add it to the shopping list. Try again.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["shopping", household.id] });
    navigate({ to: "/shopping" });
  }

  async function remove() {
    const { error } = await supabase.from("items").delete().eq("id", itemId);
    if (error) {
      toast.error("Couldn't remove this item. Try again.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["items", household?.id] });
    navigate({ to: "/inventory" });
  }

  const low = isLow(item) || quantity <= 0;
  const expiring = isExpiringSoon(item);
  const field =
    "w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand";
  const label = "mb-1 block text-xs font-bold text-muted-foreground";

  return (
    <AppShell
      title={item.name}
      headerExtra={
        <Link
          to="/inventory"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"
        >
          <ArrowLeft size={16} /> Back to inventory
        </Link>
      }
    >
      <div className="mb-4 flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        {item.image_url ? (
          <ProductPhotoDialog
            src={item.image_url}
            name={item.name}
            triggerClassName="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-surface-2"
          >
            <img
              src={item.image_url}
              alt={item.name}
              className="block h-full max-h-full w-full max-w-full object-contain"
            />
          </ProductPhotoDialog>
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2 text-4xl">
            emojiFor(item.category, categories)
          </div>
        )}
        <div className="text-sm">
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${low ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
          >
            {quantity <= 0 ? "Out of stock" : low ? "Running low" : "In stock"}
          </span>
          <div className="mt-1.5 text-muted-foreground">
            {item.location ?? "No location set"}
            {item.expires_on &&
              ` · ${expiring ? "⚠ " : ""}Expires ${formatLocalDate(item.expires_on)}`}
          </div>
          {item.barcode && (
            <div className="mt-0.5 text-xs text-muted-foreground">Barcode {item.barcode}</div>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <button
          onClick={() => adjust(-1, true)}
          disabled={quantity <= 0 || busy}
          aria-label="Use one"
          className="grid h-14 w-14 place-items-center rounded-2xl border border-border text-2xl active:bg-surface-2"
        >
          <Minus />
        </button>
        <div className="text-center">
          <strong className="block text-4xl">{quantity}</strong>
          <span className="text-xs font-bold text-muted-foreground">{item.unit} on hand</span>
        </div>
        <button
          onClick={() => adjust(1)}
          disabled={busy}
          aria-label="Restock one"
          className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-2xl text-brand disabled:opacity-40"
        >
          <Plus />
        </button>
      </div>

      {undo && (
        <button
          onClick={undoLast}
          className="mb-4 w-full rounded-2xl bg-foreground py-3 text-sm font-bold text-background"
        >
          Taken one — tap to undo
        </button>
      )}

      <button
        onClick={addToShopping}
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold"
      >
        <ShoppingCart size={16} /> Add to shopping list
      </button>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold">Where it's kept</h2>
        <div className="grid gap-2">
          <div className="flex items-center justify-between rounded-2xl border border-brand bg-brand-soft p-3 text-sm">
            <span className="truncate font-semibold text-brand">
              {item.location?.trim() || "No place set"}
            </span>
            <strong className="shrink-0 text-brand">
              {quantity} {item.unit}
            </strong>
          </div>
          {(siblings ?? []).map((other) => (
            <Link
              key={other.id}
              to="/item/$itemId"
              params={{ itemId: other.id }}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 text-sm"
            >
              <span className="truncate">{other.location?.trim() || "No place set"}</span>
              <strong className="shrink-0">
                {Number(other.quantity)} {other.unit}
              </strong>
            </Link>
          ))}
          {(siblings?.length ?? 0) > 0 && (
            <p className="px-1 text-xs font-bold text-muted-foreground">
              {quantity + (siblings ?? []).reduce((sum, o) => sum + Number(o.quantity), 0)}{" "}
              {item.unit} in total across {(siblings?.length ?? 0) + 1} places
            </p>
          )}
          <Link
            to="/add"
            search={{
              ...(item.barcode ? { barcode: item.barcode } : {}),
              name: item.name,
              ...(item.image_url ? { image: item.image_url } : {}),
              category: item.category,
            }}
            className="rounded-2xl border border-dashed border-border py-3 text-center text-sm font-bold text-brand"
          >
            + Keep this somewhere else
          </Link>
        </div>
      </section>


      <h2 className="mb-2 text-sm font-bold">Details</h2>
      <div className="grid gap-3">
        <div>
          <label htmlFor="d-name" className={label}>
            Name
          </label>
          <input
            id="d-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="d-cat" className={label}>
              Category
            </label>
            <select
              id="d-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={field}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="d-loc" className={label}>
              Location
            </label>
            <input
              id="d-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={field}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="d-unit" className={label}>
              Unit
            </label>
            <input
              id="d-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="d-min" className={label}>
              Keep at least
            </label>
            <input
              id="d-min"
              type="number"
              min={0}
              step="any"
              value={minQuantity}
              onChange={(e) => setMinQuantity(Math.max(0, Number(e.target.value) || 0))}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="d-exp" className={label}>
              Expires
            </label>
            <input
              id="d-exp"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={field}
            />
          </div>
        </div>
        <div>
          <label htmlFor="d-notes" className={label}>
            Notes
          </label>
          <textarea
            id="d-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={field}
          />
        </div>
        <button
          onClick={saveDetails}
          className="rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground"
        >
          Save changes
        </button>
      </div>

      <div className="mt-6">
        {confirmingDelete ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={remove}
              className="rounded-2xl bg-destructive py-3 text-sm font-bold text-destructive-foreground"
            >
              Yes, remove it
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded-2xl border border-border py-3 text-sm font-bold"
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-muted-foreground"
          >
            <Trash2 size={15} /> Remove from inventory
          </button>
        )}
      </div>
    </AppShell>
  );
}
