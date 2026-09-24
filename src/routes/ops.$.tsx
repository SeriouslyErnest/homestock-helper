import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useEffect } from "react";
import {
  adminAccountDetail,
  adminAuditLog,
  adminClaimConsole,
  adminConsoleUnclaimed,
  adminCreatePromotion,
  adminDismissLimitRequest,
  adminLimitRequests,
  adminGetCategories,
  adminGrantAccess,
  adminInviteUser,
  adminListAccounts,
  adminListInvites,
  adminListPromotions,
  adminOverview,
  adminPlans,
  adminRevokeGrant,
  adminSession,
  adminSetCategories,
  adminSetPlanEnforcement,
  adminSetPlanLimits,
  adminSetPromotionStatus,
  adminSetSignupsEnabled,
  adminSignupSettings,
  adminApprovalSettings,
  adminSetApprovalEnabled,
  adminListApplications,
  adminDecideApplication,
  adminProductReports,
  adminResolveProductReport,
} from "@/lib/admin.functions";
import { CATEGORIES } from "@/lib/homestock";

export const Route = createFileRoute("/ops/$")({
  ssr: false,
  component: Console,
  head: () => ({
    meta: [
      { title: "Not found" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Page not found." },
    ],
  }),
});

type Tab = "dashboard" | "accounts" | "signups" | "promotions" | "plans" | "places" | "audit";

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function fmt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Console() {
  const routeId = Route.useParams()._splat ?? "";
  const [tab, setTab] = useState<Tab>("dashboard");

  const session = useQuery({
    queryKey: ["admin-session", routeId],
    retry: false,
    queryFn: () => adminSession({ data: { routeId } }),
  });

  if (session.isPending) {
    return <div className="grid min-h-dvh place-items-center text-muted-foreground">Loading…</div>;
  }

  if (session.isError) {
    return <Locked routeId={routeId} onClaimed={() => void session.refetch()} />;
  }

  const role = session.data.role;
  const tabs: Tab[] = [
    "dashboard",
    "accounts",
    "signups",
    "promotions",
    "plans",
    "places",
    "audit",
  ];

  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">HomeStock operations</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-semibold">{role}</span>. Email addresses are stored
            only as salted fingerprints and shown masked.
          </p>
        </div>
      </header>

      <nav className="mt-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-10 rounded-full border px-4 text-sm capitalize ${
              tab === t
                ? "border-brand bg-brand-soft font-semibold text-brand"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="mt-6">
        {tab === "dashboard" && <Dashboard routeId={routeId} />}
        {tab === "accounts" && <Accounts routeId={routeId} role={role} />}
        {tab === "signups" && <Signups routeId={routeId} />}
        {tab === "promotions" && <Promotions routeId={routeId} />}
        {tab === "plans" && <Plans routeId={routeId} />}
        {tab === "places" && <Places routeId={routeId} />}
        {tab === "audit" && <Audit routeId={routeId} />}
      </main>
    </div>
  );
}

function Locked({ routeId, onClaimed }: { routeId: string; onClaimed: () => void }) {
  const unclaimed = useQuery({
    queryKey: ["admin-unclaimed", routeId],
    retry: false,
    queryFn: () => adminConsoleUnclaimed({ data: { routeId } }),
  });
  const claim = useMutation({
    mutationFn: () => adminClaimConsole({ data: { routeId } }),
    onSuccess: () => {
      toast.success("You are now the operator of this console");
      onClaimed();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page does not exist, or your account is not an operator.
        </p>
        {unclaimed.data?.unclaimed && (
          <button
            type="button"
            onClick={() => claim.mutate()}
            disabled={claim.isPending}
            className="mt-4 h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {claim.isPending ? "Claiming…" : "Claim this console"}
          </button>
        )}
      </div>
    </div>
  );
}

function Dashboard({ routeId }: { routeId: string }) {
  const { data } = useQuery({
    queryKey: ["admin-overview", routeId],
    queryFn: () => adminOverview({ data: { routeId } }),
  });
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <Applications routeId={routeId} />
      <ProductReports routeId={routeId} />
      <LimitRequests routeId={routeId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card label="Accounts signed up" value={data.accounts} />
        <Card label="Households" value={data.households} />
        <Card label="Active grants" value={data.activeGrants} />
        <Card label="Expiring in 7 days" value={data.expiringSoon} />
        <Card label="Active promotions" value={data.activePromotions} />
        <Card label="Promo redemptions" value={data.redemptions} />
      </div>
    </div>
  );
}

/** Transient inbox: disappears entirely once every request has been cleared. */
function LimitRequests({ routeId }: { routeId: string }) {
  const qc = useQueryClient();
  const requests = useQuery({
    queryKey: ["admin-limit-requests", routeId],
    queryFn: () => adminLimitRequests({ data: { routeId } }),
    refetchInterval: 60_000,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => adminDismissLimitRequest({ data: { routeId, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-limit-requests", routeId] }),
  });
  const list = requests.data ?? [];
  if (list.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold">Requests for more · {list.length}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        People asking for a higher limit. Contact them, act if you agree, then dismiss — dismissed
        requests are deleted.
      </p>
      <ul className="mt-3 grid gap-2">
        {list.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {r.email ?? "Unknown address"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.displayName ?? "No name"} · wants more {r.kind} · {fmt(r.createdAt)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => dismiss.mutate(r.id)}
              disabled={dismiss.isPending}
              className="h-9 shrink-0 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Accounts({ routeId, role }: { routeId: string; role: string }) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ["admin-accounts", routeId, applied],
    queryFn: () => adminListAccounts({ data: { routeId, search: applied } }),
  });

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search);
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search full email address or display name"
          className="h-11 flex-1 rounded-2xl border border-border bg-card px-4 text-sm"
        />
        <button
          type="submit"
          className="h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border">
        {(accounts.data ?? []).map((a) => (
          <button
            key={a.userId}
            type="button"
            onClick={() => setSelected(a.userId === selected ? null : a.userId)}
            className="flex w-full items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 text-left last:border-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{a.emailMasked}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {a.displayName ?? "No name"} · joined {fmt(a.firstSeenAt)}
              </span>
            </span>
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              {a.tier}
            </span>
          </button>
        ))}
        {accounts.data?.length === 0 && (
          <p className="bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No accounts match that search.
          </p>
        )}
      </div>

      {selected && <AccountDetail routeId={routeId} userId={selected} role={role} />}
    </div>
  );
}

function AccountDetail({
  routeId,
  userId,
  role,
}: {
  routeId: string;
  userId: string;
  role: string;
}) {
  const qc = useQueryClient();
  const [tier, setTier] = useState("paid");
  const [days, setDays] = useState<string>("90");
  const [reason, setReason] = useState("");

  const detail = useQuery({
    queryKey: ["admin-account", routeId, userId],
    queryFn: () => adminAccountDetail({ data: { routeId, userId } }),
  });

  const grant = useMutation({
    mutationFn: () =>
      adminGrantAccess({
        data: {
          routeId,
          userId,
          tier,
          source: "complimentary",
          days: days === "never" ? null : Number(days),
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Access granted");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin-account", routeId, userId] });
      void qc.invalidateQueries({ queryKey: ["admin-accounts", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (grantId: string) => {
      const why = window.prompt("Reason for revoking this grant?") ?? "";
      if (!why.trim()) throw new Error("A reason is required");
      return adminRevokeGrant({ data: { routeId, grantId, reason: why } });
    },
    onSuccess: () => {
      toast.success("Grant revoked");
      void qc.invalidateQueries({ queryKey: ["admin-account", routeId, userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!detail.data?.account) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const a = detail.data.account;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">{a.emailMasked}</h2>
        <p className="text-xs text-muted-foreground">
          {a.displayName ?? "No name"} · effective plan {a.tier} · last seen {fmt(a.lastSeenAt)}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Households</h3>
        <ul className="mt-1 text-sm text-muted-foreground">
          {detail.data.households.map((h) => (
            <li key={h.id}>
              {h.name} — {h.role}
            </li>
          ))}
          {detail.data.households.length === 0 && <li>None yet</li>}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Entitlement grants</h3>
        <ul className="mt-1 space-y-2">
          {detail.data.grants.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span>
                <strong>{g.tier}</strong> · {g.source}
                {g.promoCode ? ` (${g.promoCode})` : ""} · ends {fmt(g.endsAt)}
                {g.revokedAt && " · revoked"}
                {g.reason && (
                  <span className="block text-xs text-muted-foreground">{g.reason}</span>
                )}
              </span>
              {!g.revokedAt && (role === "SUPER_ADMIN" || role === "BILLING_ADMIN") && (
                <button
                  type="button"
                  onClick={() => revoke.mutate(g.id)}
                  className="h-9 rounded-xl border border-border px-3 text-xs font-semibold text-destructive"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
          {detail.data.grants.length === 0 && (
            <li className="text-sm text-muted-foreground">No grants yet</li>
          )}
        </ul>
      </div>

      <form
        className="space-y-2 rounded-xl border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          grant.mutate();
        }}
      >
        <h3 className="text-sm font-semibold">Give complimentary access</h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="paid">paid</option>
            <option value="free">free</option>
          </select>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">365 days</option>
            {role === "SUPER_ADMIN" && <option value="never">No end date</option>}
          </select>
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required, internal only)"
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          disabled={!reason.trim() || grant.isPending}
          className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {grant.isPending ? "Saving…" : "Grant access"}
        </button>
      </form>
    </section>
  );
}

function Promotions({ routeId }: { routeId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: "",
    campaignName: "",
    tier: "paid",
    durationDays: "90",
    maxRedemptions: "",
  });

  const promos = useQuery({
    queryKey: ["admin-promos", routeId],
    queryFn: () => adminListPromotions({ data: { routeId } }),
  });

  const create = useMutation({
    mutationFn: () =>
      adminCreatePromotion({
        data: {
          routeId,
          code: form.code,
          campaignName: form.campaignName,
          tier: form.tier,
          durationDays: Number(form.durationDays) || 90,
          endsAt: null,
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Promotion created");
      setForm({ code: "", campaignName: "", tier: "paid", durationDays: "90", maxRedemptions: "" });
      void qc.invalidateQueries({ queryKey: ["admin-promos", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (v: { code: string; status: "active" | "paused" | "expired" }) =>
      adminSetPromotionStatus({ data: { routeId, ...v } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-promos", routeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="text-sm font-semibold sm:col-span-2">New promotion</h2>
        <input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="CODE"
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <input
          value={form.campaignName}
          onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
          placeholder="Campaign name"
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <select
          value={form.tier}
          onChange={(e) => setForm({ ...form, tier: e.target.value })}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="paid">paid</option>
          <option value="free">free</option>
        </select>
        <input
          value={form.durationDays}
          onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
          placeholder="Days of access"
          inputMode="numeric"
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <input
          value={form.maxRedemptions}
          onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
          placeholder="Max redemptions (blank = unlimited)"
          inputMode="numeric"
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm sm:col-span-2"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2"
        >
          {create.isPending ? "Creating…" : "Create promotion"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border">
        {(promos.data ?? []).map((p) => (
          <div
            key={p.code}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 last:border-0"
          >
            <div>
              <div className="text-sm font-semibold">
                {p.code} · {p.campaignName}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.tier} for {p.durationDays} days · {p.redemptions}
                {p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""} redeemed · {p.status}
              </div>
            </div>
            <div className="flex gap-2">
              {p.status !== "active" && (
                <button
                  type="button"
                  onClick={() => setStatus.mutate({ code: p.code, status: "active" })}
                  className="h-9 rounded-xl border border-border px-3 text-xs font-semibold"
                >
                  Resume
                </button>
              )}
              {p.status === "active" && (
                <button
                  type="button"
                  onClick={() => setStatus.mutate({ code: p.code, status: "paused" })}
                  className="h-9 rounded-xl border border-border px-3 text-xs font-semibold"
                >
                  Pause
                </button>
              )}
              {p.status !== "expired" && (
                <button
                  type="button"
                  onClick={() => setStatus.mutate({ code: p.code, status: "expired" })}
                  className="h-9 rounded-xl border border-border px-3 text-xs font-semibold text-destructive"
                >
                  Expire now
                </button>
              )}
            </div>
          </div>
        ))}
        {promos.data?.length === 0 && (
          <p className="bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No promotions yet.
          </p>
        )}
      </div>
    </div>
  );
}

function PlanRow({
  routeId,
  plan,
}: {
  routeId: string;
  plan: {
    tier: string;
    enforced: boolean;
    max_owned_households: number;
    max_members: number;
    max_items: number;
  };
}) {
  const qc = useQueryClient();
  const [homes, setHomes] = useState(String(plan.max_owned_households));
  const [members, setMembers] = useState(String(plan.max_members));
  const [items, setItems] = useState(String(plan.max_items));
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-plans", routeId] });

  const toggle = useMutation({
    mutationFn: () =>
      adminSetPlanEnforcement({ data: { routeId, tier: plan.tier, enforced: !plan.enforced } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: () =>
      adminSetPlanLimits({
        data: {
          routeId,
          tier: plan.tier,
          maxOwnedHouseholds: Number(homes),
          maxMembers: Number(members),
          maxItems: Number(items),
        },
      }),
    onSuccess: () => {
      toast.success("Limits saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
      />
    </label>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold capitalize">{plan.tier}</div>
        <button
          type="button"
          onClick={() => toggle.mutate()}
          className={`h-10 rounded-xl border px-4 text-sm font-semibold ${
            plan.enforced ? "border-brand bg-brand-soft text-brand" : "border-border"
          }`}
        >
          {plan.enforced ? "Enforced" : "Not enforced"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {field("Homes owned", homes, setHomes)}
        {field("People per home", members, setMembers)}
        {field("Line items", items, setItems)}
      </div>
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {save.isPending ? "Saving…" : "Save limits"}
      </button>
    </div>
  );
}

function Plans({ routeId }: { routeId: string }) {
  const plans = useQuery({
    queryKey: ["admin-plans", routeId],
    queryFn: () => adminPlans({ data: { routeId } }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Limits only apply when a plan is switched on. Everything stays unlimited while enforcement
        is off. "Line items" is how many inventory rows a home may show.
      </p>
      {(plans.data ?? []).map((p) => (
        <PlanRow key={p.tier} routeId={routeId} plan={p} />
      ))}
    </div>
  );
}

type PlaceRow = { id: string; emoji: string; originalId: string };

function Places({ routeId }: { routeId: string }) {
  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["admin-categories", routeId],
    queryFn: () => adminGetCategories({ data: { routeId } }),
  });
  const [rows, setRows] = useState<PlaceRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saved.data) return;
    const list = saved.data.categories ?? CATEGORIES;
    setRows(list.map((c) => ({ id: c.id, emoji: c.emoji, originalId: c.id })));
  }, [saved.data]);

  const save = useMutation({
    mutationFn: () => {
      const renames = rows
        .filter((r) => r.originalId !== r.id)
        .map((r) => ({ from: r.originalId, to: r.id }));
      return adminSetCategories({
        data: { routeId, categories: rows.map(({ id, emoji }) => ({ id, emoji })), renames },
      });
    },
    onSuccess: () => {
      toast.success("Places saved");
      qc.invalidateQueries({ queryKey: ["admin-categories", routeId] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setSaving(false),
  });

  function setRow(index: number, patch: Partial<PlaceRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const duplicate = (name: string, index: number) =>
    rows.some((r, i) => i !== index && r.id.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The places people can sort items into. Renaming one moves existing items with it. Removing
        one leaves its items on the old label — they still show under "All items" in the app.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.originalId + i} className="flex items-center gap-2">
            <input
              value={r.emoji}
              onChange={(e) => setRow(i, { emoji: e.target.value })}
              maxLength={4}
              aria-label={`Emoji for place ${i + 1}`}
              className="h-11 w-14 rounded-xl border border-border bg-card px-2 text-center text-lg outline-none focus:border-brand"
            />
            <input
              value={r.id}
              maxLength={20}
              onChange={(e) => setRow(i, { id: e.target.value })}
              aria-label={`Name of place ${i + 1}`}
              placeholder="Place name"
              className={`h-11 min-w-0 flex-1 rounded-xl border bg-card px-3 outline-none focus:border-brand ${
                r.id.trim() && duplicate(r.id, i) ? "border-destructive" : "border-border"
              }`}
            />
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Remove place ${r.id || i + 1}`}
              disabled={rows.length <= 1}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground outline-none focus:border-brand disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { id: "", emoji: "📦", originalId: "" }])}
          disabled={rows.length >= 16}
          className="h-11 rounded-full border border-border bg-card px-4 text-sm font-semibold outline-none focus:border-brand disabled:opacity-40"
        >
          + Add a place
        </button>
        <button
          type="button"
          onClick={() => {
            if (rows.some((r) => !r.id.trim() || duplicate(r.id, rows.indexOf(r)))) {
              toast.error("Every place needs a unique name.");
              return;
            }
            setSaving(true);
            save.mutate();
          }}
          disabled={saving || rows.some((r) => !r.id.trim())}
          className="h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground outline-none focus:border-brand disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save places"}
        </button>
        {saved.isPending && <span className="text-sm text-muted-foreground">Loading…</span>}
      </div>
    </div>
  );
}

function Audit({ routeId }: { routeId: string }) {
  const { data } = useQuery({
    queryKey: ["admin-audit", routeId],
    queryFn: () => adminAuditLog({ data: { routeId } }),
  });
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      {(data ?? []).map((e) => (
        <div key={e.id} className="border-b border-border bg-card px-4 py-3 text-sm last:border-0">
          <div className="font-semibold">{e.actionType}</div>
          <div className="text-xs text-muted-foreground">
            {fmt(e.createdAt)} · {e.targetType ?? "—"} {e.targetId ?? ""}
            {e.reason ? ` · ${e.reason}` : ""}
          </div>
        </div>
      ))}
      {data?.length === 0 && (
        <p className="bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No admin activity yet.
        </p>
      )}
    </div>
  );
}

function Signups({ routeId }: { routeId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const settings = useQuery({
    queryKey: ["admin-signups", routeId],
    queryFn: () => adminSignupSettings({ data: { routeId } }),
  });
  const invites = useQuery({
    queryKey: ["admin-invites", routeId],
    queryFn: () => adminListInvites({ data: { routeId } }),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => adminSetSignupsEnabled({ data: { routeId, enabled } }),
    onSuccess: (_r, enabled) => {
      toast.success(enabled ? "Open sign-ups are on" : "Sign-ups are now invite only");
      void qc.invalidateQueries({ queryKey: ["admin-signups", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invite = useMutation({
    mutationFn: () => adminInviteUser({ data: { routeId, email, origin: window.location.origin } }),
    onSuccess: (r) => {
      toast.success(`Invitation sent to ${r.emailMasked}`);
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["admin-invites", routeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = settings.data?.signupsEnabled ?? true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div>
          <div className="text-sm font-semibold">New account sign-ups</div>
          <div className="text-xs text-muted-foreground">
            {open
              ? "Anyone can create an account from the landing page."
              : "Invite only — the “Get started” button is hidden and only invited addresses can register."}
          </div>
        </div>
        <button
          type="button"
          disabled={settings.isPending || toggle.isPending}
          onClick={() => toggle.mutate(!open)}
          className={`h-10 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50 ${
            open ? "border-brand bg-brand-soft text-brand" : "border-border"
          }`}
        >
          {open ? "Open to everyone" : "Invite only"}
        </button>
      </div>

      <form
        className="space-y-2 rounded-2xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">Invite someone by email</h2>
        <p className="text-xs text-muted-foreground">
          Sends a one-time sign-up link. Works whether sign-ups are open or closed.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            disabled={!email.trim() || invite.isPending}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {invite.isPending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border">
        {(invites.data ?? []).map((i) => (
          <div
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 last:border-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{i.emailMasked}</div>
              <div className="text-xs text-muted-foreground">Last sent {fmt(i.lastSentAt)}</div>
            </div>
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              {i.acceptedAt ? "Joined" : "Invited"}
            </span>
          </div>
        ))}
        {invites.data?.length === 0 && (
          <p className="bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No invitations sent yet.
          </p>
        )}
      </div>
    </div>
  );
}
