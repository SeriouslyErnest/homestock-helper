import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { ProBadge } from "@/components/pro-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useHousehold, useHouseholdPro, useItems } from "@/lib/homestock";
import { PRO_FEATURES } from "@/lib/billing";
import {
  buildProductInsights,
  DEAD_STOCK_DAYS,
  deadStock,
  expiringSoon,
  runningOutSoon,
  topStaples,
  wastedUnits,
  weeklyFlow,
  type InsightEvent,
  type InsightSnapshot,
} from "@/lib/insights";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Household insights — HomeStock" },
      {
        name: "description",
        content: "See what your home uses, what's sitting forgotten and when things will run out.",
      },
      { property: "og:title", content: "Household insights — HomeStock" },
      {
        property: "og:description",
        content: "See what your home uses, what's sitting forgotten and when things will run out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function InsightsPage() {
  const { data: household } = useHousehold();
  const { data: pro, isLoading: proLoading } = useHouseholdPro(household?.id);
  const isPro = !!pro?.pro;
  const { data: items } = useItems(household?.id);

  const events = useQuery({
    queryKey: ["insight-events", household?.id],
    enabled: !!household?.id && isPro,
    queryFn: async (): Promise<InsightEvent[]> => {
      const since = new Date(Date.now() - 180 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("inventory_events")
        .select("item_id, kind, delta, created_at")
        .eq("household_id", household!.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as InsightEvent[];
    },
  });

  const snapshots = useQuery({
    queryKey: ["insight-snapshots", household?.id],
    enabled: !!household?.id && isPro,
    queryFn: async (): Promise<InsightSnapshot[]> => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("stock_snapshots")
        .select("item_id, snapshot_date, quantity, expires_on")
        .eq("household_id", household!.id)
        .gte("snapshot_date", since)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as InsightSnapshot[];
    },
  });

  const view = useMemo(() => {
    if (!items || !events.data) return null;
    const products = buildProductInsights(items, events.data);
    return {
      products,
      dead: deadStock(products),
      soon: runningOutSoon(products, 7),
      staples: topStaples(products, 5),
      expiring: expiringSoon(products, localToday()),
      flow: weeklyFlow(events.data, 8),
      wasted: wastedUnits(snapshots.data ?? []),
      cycles: products
        .filter((p) => p.restockEveryDays !== null)
        .sort((a, b) => a.restockEveryDays! - b.restockEveryDays!)
        .slice(0, 6),
    };
  }, [items, events.data, snapshots.data]);

  if (proLoading || !household) {
    return (
      <AppShell title="Household insights">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!isPro) {
    return (
      <AppShell title="Household insights" subtitle={household.name}>
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-2">
            <ProBadge />
          </div>
          <h2 className="text-lg font-semibold">Insights come with Pro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When the owner of this home is on Pro, everyone here can see:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {PRO_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <Button variant="outline" asChild className="mt-4"><Link to="/pro">Preview Pro with sample screenshots</Link></Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Have a trial or promo code? Enter it under{" "}
            <Link to="/more" className="font-semibold text-brand underline">
              More
            </Link>
            .
          </p>
        </section>
      </AppShell>
    );
  }

  const maxFlow = Math.max(1, ...(view?.flow ?? []).flatMap((w) => [w.inUnits, w.outUnits]));

  return (
    <AppShell
      title="Household insights"
      subtitle={household.name}
      headerExtra={
        <div className="mt-2">
          <ProBadge />
        </div>
      }
    >
      {!view ? (
        <p className="text-sm text-muted-foreground">Counting…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Used, 30 days" value={sum(view.products.map((p) => p.usedLast30))} />
            <Stat label="Added, 30 days" value={sum(view.products.map((p) => p.restockedLast30))} />
            <Stat label="Spoiled on shelf" value={view.wasted} />
          </div>

          <Card title="Will run out within a week" empty="Nothing is about to run out at your current pace.">
            {view.soon.map((p) => (
              <Row key={p.key} name={p.name} right={p.daysLeft === 0 ? "today" : `~${p.daysLeft} days`} />
            ))}
          </Card>

          <Card title="Expiring in the next 7 days" empty="Nothing dated is expiring soon.">
            {view.expiring.map((p) => (
              <Row key={p.key} name={p.name} right={formatDate(p.earliestExpiry!)} />
            ))}
          </Card>

          <Card
            title={`Sitting untouched for ${DEAD_STOCK_DAYS}+ days`}
            empty="Everything in stock has been used or restocked recently."
          >
            {view.dead.map((p) => (
              <Row key={p.key} name={p.name} right={`${p.total} left`} />
            ))}
          </Card>

          <Card title="Your staples (most used, 30 days)" empty="Use things up to see your staples here.">
            {view.staples.map((p) => (
              <Row
                key={p.key}
                name={p.name}
                right={`${trim(p.usedLast30)} used · ${trim(p.perDay * 7)}/week`}
              />
            ))}
          </Card>

          <Card title="How often you restock" empty="Restock things a few times to see your rhythm.">
            {view.cycles.map((p) => (
              <Row key={p.key} name={p.name} right={`every ~${p.restockEveryDays} days`} />
            ))}
          </Card>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-bold">In and out, last 8 weeks</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              <span className="mr-3 inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-primary" /> Added
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Used
              </span>
            </p>
            <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Weekly units added and used">
              {view.flow.map((w) => (
                <div key={w.weekStart} className="flex h-full flex-1 items-end gap-0.5" title={`Week of ${formatDate(w.weekStart)}: +${w.inUnits} / −${w.outUnits}`}>
                  <div className="flex-1 rounded-t bg-primary" style={{ height: `${(w.inUnits / maxFlow) * 100}%` }} />
                  <div className="flex-1 rounded-t bg-muted-foreground" style={{ height: `${(w.outUnits / maxFlow) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{formatDate(view.flow[0]!.weekStart)}</span>
              <span>This week</span>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Worked out from what your home recorded — no guessing. "Spoiled on shelf" counts from
            the day Pro was switched on.
          </p>
        </div>
      )}
    </AppShell>
  );
}

const sum = (xs: number[]) => trim(xs.reduce((a, b) => a + b, 0));
const trim = (n: number) => Math.round(n * 10) / 10;
function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Card({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      {children.length ? <ul className="divide-y divide-border">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function Row({ name, right }: { name: string; right: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{right}</span>
    </li>
  );
}
