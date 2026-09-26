import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { correctQuantity, useHousehold, useItemUsage, useItems, type Item } from "@/lib/homestock";

export const Route = createFileRoute("/_authenticated/reconcile")({
  head: () => ({
    meta: [
      { title: "Quick stock check — HomeStock" },
      { name: "description", content: "Confirm a handful of counts in under a minute." },
      { property: "og:title", content: "Quick stock check — HomeStock" },
      { property: "og:description", content: "Confirm a handful of counts in under a minute." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconcilePage,
});

type RowState = { status: "open" | "kept" | "changed"; value: number };

function ReconcilePage() {
  const { data: household } = useHousehold();
  const { data: items, isPending } = useItems(household?.id);
  const { data: usage } = useItemUsage(household?.id);
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Plain rule: things you use often, and things nobody has touched in a while.
  const picks = useMemo<Item[]>(() => {
    const now = Date.now();
    return [...(items ?? [])]
      .filter((i) => Number(i.quantity) > 0 || Number(i.min_quantity) > 0)
      .map((i) => {
        const days = (now - new Date(i.updated_at).getTime()) / 86400000;
        const used = usage?.get(i.id)?.consumeCount ?? 0;
        return { i, score: used * 2 + Math.min(days, 60) / 7 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.i);
    // Freeze the list once loaded so rows don't jump while checking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items === undefined, usage === undefined]);

  const done = picks.filter((p) => rows[p.id] && rows[p.id]!.status !== "open").length;

  async function save(item: Item, value: number) {
    setBusy(item.id);
    setError(null);
    try {
      if (value !== Number(item.quantity)) {
        await correctQuantity(item.id, value, "Quick stock check");
        queryClient.invalidateQueries({ queryKey: ["items", household?.id] });
      }
      setRows((r) => ({
        ...r,
        [item.id]: { status: value === Number(item.quantity) ? "kept" : "changed", value },
      }));
      setEditing(null);
    } catch {
      setError(`Couldn't save ${item.name}. Try again.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Quick stock check" subtitle="Glance at the shelf — tap what's still right.">
      {isPending && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      {!isPending && picks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing to check yet.</p>
      )}
      <ul className="grid gap-2">
        {picks.map((item) => {
          const state = rows[item.id];
          const says = Number(item.quantity);
          const isEditing = editing === item.id;
          const value = state?.value ?? says;
          return (
            <li key={item.id} className="rounded-2xl border border-border bg-card p-3">
              <p className="break-words font-semibold">{item.name}</p>
              {state && state.status !== "open" && !isEditing ? (
                <p className="mt-1 flex items-center gap-1 text-sm text-success">
                  <Check size={16} />
                  {state.status === "kept" ? `Still ${says}` : `Updated to ${state.value}`}
                </p>
              ) : isEditing ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    aria-label="One fewer"
                    onClick={() =>
                      setRows((r) => ({
                        ...r,
                        [item.id]: { status: "open", value: Math.max(0, value - 1) },
                      }))
                    }
                    className="grid h-11 w-11 place-items-center rounded-xl border border-border"
                  >
                    <Minus size={18} />
                  </button>
                  <strong className="w-10 text-center text-lg">{value}</strong>
                  <button
                    aria-label="One more"
                    onClick={() =>
                      setRows((r) => ({ ...r, [item.id]: { status: "open", value: value + 1 } }))
                    }
                    className="grid h-11 w-11 place-items-center rounded-xl border border-border"
                  >
                    <Plus size={18} />
                  </button>
                  <button
                    disabled={busy === item.id}
                    onClick={() => save(item, value)}
                    className="ml-auto h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">HomeStock says {says}</span>
                  <button
                    disabled={busy === item.id}
                    onClick={() => save(item, says)}
                    className="ml-auto h-11 rounded-xl bg-success-soft px-3 text-sm font-bold text-success"
                  >
                    Still {says}
                  </button>
                  <button
                    onClick={() => setEditing(item.id)}
                    className="h-11 rounded-xl border border-border px-3 text-sm font-bold"
                  >
                    Change
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p role="alert" className="mt-2 text-sm font-semibold text-warning">
        {error}
      </p>
      {picks.length > 0 && (
        <Link
          to="/inventory"
          className="mt-3 block rounded-2xl bg-primary py-4 text-center font-semibold text-primary-foreground"
        >
          {done === picks.length ? "All checked — done" : `Done (${done} of ${picks.length})`}
        </Link>
      )}
    </AppShell>
  );
}
