import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, LogOut, RefreshCw, RotateCcw, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PromoCard } from "@/components/promo-code";
import { TelegramCard } from "@/components/telegram-card";
import { AskForMoreHomes } from "@/components/limit-request";
import { useOnboardingActions } from "@/lib/onboarding";

import {
  createHousehold,
  planLimitMessage,
  setActiveHouseholdId,
  clearActiveHouseholdId,
  useEntitlements,
  useHousehold,
  useHouseholds,
  useJoinRequests,
  useMembers,
  useMyJoinRequests,
} from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/more")({
  head: () => ({
    meta: [
      { title: "Household & account — HomeStock" },
      { name: "description", content: "Manage your household, invite code, members and account." },
      { property: "og:title", content: "Household & account — HomeStock" },
      {
        property: "og:description",
        content: "Manage your household, invite code, members and account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MorePage,
});

function MorePage() {
  const { data: household } = useHousehold();
  const { data: members } = useMembers(household?.id);
  const { data: joinRequests } = useJoinRequests(household?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [householdName, setHouseholdName] = useState("");
  const [email, setEmail] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const { data: households } = useHouseholds();
  const { data: plan } = useEntitlements();
  const { data: myRequests } = useMyJoinRequests();
  const [newHomeName, setNewHomeName] = useState("");
  const [creatingHome, setCreatingHome] = useState(false);
  const [showCreateHome, setShowCreateHome] = useState(false);

  async function switchTo(id: string) {
    if (id === household?.id) return;
    setActiveHouseholdId(id);
    await queryClient.invalidateQueries();
    toast.success("Switched home");
  }

  async function createNewHome(e: React.FormEvent) {
    e.preventDefault();
    if (!newHomeName.trim()) return;
    setCreatingHome(true);
    try {
      await createHousehold(newHomeName);
      await queryClient.invalidateQueries();
      setNewHomeName("");
      setShowCreateHome(false);
      toast.success("New home created");
    } catch (err) {
      toast.error(planLimitMessage(err) ?? "Couldn't create that home. Try again.");
    } finally {
      setCreatingHome(false);
    }
  }

  const canCreateHome = plan?.can_create_household ?? true;
  const memberLimitReached =
    !!plan?.enforced && (members?.length ?? 0) >= (plan?.max_members ?? Infinity);
  const myPending = (myRequests ?? []).filter((r) => r.status === "pending");
  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === "owner");
  const pending = (joinRequests ?? []).filter((r) => r.status === "pending");
  const blocked = (joinRequests ?? []).filter((r) => r.status === "blocked");

  useEffect(() => {
    if (household) setHouseholdName(household.name);
  }, [household]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setUserId(data.user?.id ?? null);
    });
  }, []);

  async function removeMember(memberUserId: string, name: string) {
    if (!household) return;
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", household.id)
      .eq("user_id", memberUserId);
    if (error) {
      toast.error("Could not remove them — you need to be the owner.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["members", household.id] });
    toast.success(`${name} removed`);
  }

  async function leaveHousehold() {
    if (!household || !userId) return;
    const { error } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", household.id)
      .eq("user_id", userId);
    if (error) {
      toast.error("Could not leave this household.");
      return;
    }
    // Don't keep pointing at a home the user is no longer in.
    const next = (households ?? []).find((h) => h.id !== household.id);
    if (next) setActiveHouseholdId(next.id);
    else clearActiveHouseholdId();
    await queryClient.invalidateQueries();
    setConfirmLeave(false);
    toast.success("You left the household");
    navigate({ to: "/inventory" });
  }

  async function renameHousehold() {
    if (!household || !householdName.trim()) return;
    const { error } = await supabase
      .from("households")
      .update({ name: householdName.trim() })
      .eq("id", household.id);
    if (error) {
      toast.error("Couldn't rename the household. Try again.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["households"] });
    toast.success("Household renamed");
  }

  async function copyCode() {
    if (!household) return;
    try {
      await navigator.clipboard.writeText(household.invite_code);
      toast.success("Invite code copied");
    } catch {
      toast.info(`Invite code: ${household.invite_code}`);
    }
  }

  async function regenerateCode() {
    if (!household) return;
    const { data, error } = await supabase.rpc("regenerate_invite_code", {
      _household_id: household.id,
    });
    if (error || !data) {
      toast.error("Couldn't make a new code. You need to be the owner.");
      return;
    }
    queryClient.setQueryData<typeof households>(["households"], (old) =>
      old?.map((h) => (h.id === household.id ? { ...h, invite_code: data } : h)),
    );
    toast.success("New invite code — the old one no longer works");
  }

  async function decide(requestId: string, decision: "approved" | "rejected" | "blocked") {
    setDeciding(requestId);
    const { error } = await supabase.rpc("decide_join_request", {
      _request_id: requestId,
      _decision: decision,
    });
    setDeciding(null);
    if (error) {
      toast.error(
        planLimitMessage(error) ?? "Could not update that request. You need to be the owner.",
      );
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["join-requests", household?.id] });
    queryClient.invalidateQueries({ queryKey: ["members", household?.id] });
    toast.success(
      decision === "approved"
        ? "Approved — they're in"
        : decision === "blocked"
          ? "Blocked"
          : "Rejected",
    );
  }

  async function unblock(requestId: string) {
    setDeciding(requestId);
    const { error } = await supabase.from("household_join_requests").delete().eq("id", requestId);
    setDeciding(null);
    if (error) {
      toast.error("Could not unblock them.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["join-requests", household?.id] });
    toast.success("Unblocked — they can ask again");
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinMessage(null);
    const { data, error } = await supabase.rpc("request_household_join", {
      _code: joinCode.trim(),
    });
    setJoining(false);
    if (error) {
      setJoinMessage("Something went wrong. Try again.");
    } else if (data === "member") {
      setJoinMessage("You're already a member of that household.");
    } else if (data === "blocked") {
      setJoinMessage("That household isn't accepting a request from you.");
    } else if (data === "too_many") {
      setJoinMessage("Too many wrong codes. Wait an hour and try again.");
    } else if (data === "closed") {
      setJoinMessage("That household isn't accepting new members right now.");
    } else {
      setJoinMessage("Request sent. An owner of that household needs to approve you.");
      setJoinCode("");
      queryClient.invalidateQueries({ queryKey: ["join-requests"] });
    }
  }

  const { restart: restartWelcome } = useOnboardingActions();
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const field =
    "w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand";

  return (
    <AppShell title="Household & account">
      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Your homes · {households?.length ?? 0}</h2>
        <ul className="grid gap-2">
          {(households ?? []).map((h) => {
            const active = h.id === household?.id;
            return (
              <li key={h.id}>
                <button
                  onClick={() => switchTo(h.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm ${
                    active ? "bg-brand-soft font-bold text-brand" : "bg-surface-2"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{h.name}</span>
                  {active ? (
                    <span className="text-xs font-bold">Viewing</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Switch</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {!canCreateHome ? (
          <AskForMoreHomes limit={plan?.max_owned_households ?? 2} />
        ) : showCreateHome ? (
          <form onSubmit={createNewHome} className="mt-3 flex gap-2">
            <input
              maxLength={200}
              value={newHomeName}
              onChange={(e) => setNewHomeName(e.target.value)}
              placeholder="Beach house"
              aria-label="New home name"
              maxLength={40}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={creatingHome || !newHomeName.trim()}
              className="shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {creatingHome ? "…" : "Create"}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowCreateHome(true)}
            className="mt-3 w-full rounded-xl border border-border py-3 text-sm font-semibold"
          >
            Create a new home
          </button>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Household</h2>
        <label htmlFor="hh-name" className="mb-1 block text-xs font-bold text-muted-foreground">
          Name
        </label>
        <div className="flex gap-2">
          <input
            maxLength={80}
            id="hh-name"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            className={field}
          />
          <button
            onClick={renameHousehold}
            className="shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Save
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand-soft p-3.5">
          <div>
            <span className="block text-xs font-bold text-brand">Invite code</span>
            <strong className="text-lg tracking-[0.3em]">
              {household?.invite_code ?? "······"}
            </strong>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-bold text-brand"
            >
              <Copy size={14} /> Copy
            </button>
            {isOwner && (
              <button
                onClick={regenerateCode}
                className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-bold text-brand"
              >
                <RefreshCw size={14} /> New code
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Share this code so family or flatmates can ask to join. Nobody gets in until an owner
          approves them.
          {isOwner &&
            " “New code” replaces it — the old code stops working straight away, handy if it leaked."}
        </p>
      </section>

      {isOwner && household && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-bold">Optional details</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Applies to everyone in this household. Turning the first two off only hides the box —
            anything already filled in is kept. Turning off join requests means nobody new can ask
            to join until you turn it back on; people already in stay in.
          </p>
          {(
            [
              ["show_expiry", "Ask for expiry dates"],
              ["show_locations", "Ask where things are kept"],
              ["join_open", "Open for join requests"],
            ] as const
          ).map(([key, text]) => (
            <label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm">
              {text}
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={household[key] !== false}
                onChange={async (e) => {
                  const next = e.target.checked;
                  const patch: Partial<Record<typeof key, boolean>> = { [key]: next };
                  const setCache = (value: boolean) =>
                    queryClient.setQueryData<typeof households>(["households"], (old) =>
                      old?.map((h) => (h.id === household.id ? { ...h, [key]: value } : h)),
                    );
                  setCache(next);
                  const { error } = await supabase
                    .from("households")
                    .update(patch)
                    .eq("id", household.id);
                  if (error) {
                    setCache(!next);
                    toast.error("Couldn't save that. Try again.");
                  }
                }}
              />
            </label>
          ))}
        </section>
      )}

      {isOwner && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-bold">
            Join requests{pending.length > 0 ? ` · ${pending.length}` : ""}
          </h2>
          {pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nobody is waiting. Requests from people using your invite code show up here.
            </p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {pending.map((r) => (
                <li key={r.id} className="rounded-xl bg-surface-2 p-3">
                  <p className="truncate text-sm font-semibold">
                    {r.display_name ?? r.email ?? "Someone"}
                  </p>
                  {r.email && r.display_name && (
                    <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                  )}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => decide(r.id, "approved")}
                      disabled={deciding === r.id || memberLimitReached}
                      title={memberLimitReached ? "This home is full for its plan" : undefined}
                      className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-success px-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <Check size={15} /> Approve
                    </button>
                    <button
                      onClick={() => decide(r.id, "rejected")}
                      disabled={deciding === r.id}
                      className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      <X size={15} /> Reject
                    </button>
                    <button
                      onClick={() => decide(r.id, "blocked")}
                      aria-label={`Block ${r.display_name ?? r.email ?? "this person"}`}
                      disabled={deciding === r.id}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground disabled:opacity-50"
                    >
                      <Ban size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {blocked.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-xs font-bold text-muted-foreground">
                Blocked · {blocked.length}
              </h3>
              <ul className="grid gap-2">
                {blocked.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl bg-surface-2 p-2.5 text-sm"
                  >
                    <span className="flex-1 truncate">
                      {r.display_name ?? r.email ?? "Someone"}
                    </span>
                    <button
                      onClick={() => unblock(r.id)}
                      disabled={deciding === r.id}
                      className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-brand disabled:opacity-50"
                    >
                      <RotateCcw size={14} /> Unblock
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {myPending.length > 0 && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-bold">Waiting for approval · {myPending.length}</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            You'll get in as soon as an owner approves you.
          </p>
          <ul className="grid gap-2">
            {myPending.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{r.household_name}</span>
                <span className="shrink-0 rounded-lg bg-warning-soft px-2 py-1 text-xs font-bold">
                  Pending
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">
          Members · {members?.length ?? 0}
          {plan?.enforced ? ` of ${plan.max_members}` : ""}
        </h2>
        {memberLimitReached && (
          <p className="mb-2 text-xs text-muted-foreground">
            This home has reached the number of people its plan allows.
          </p>
        )}
        <ul className="grid gap-2">
          {(members ?? []).map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5 text-sm"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-xs font-extrabold text-brand">
                {(m.display_name ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 truncate font-semibold">
                {m.user_id === userId ? "You" : (m.display_name ?? "Housemate")}
              </span>
              <span className="text-xs text-muted-foreground">{m.role}</span>
              {isOwner && m.user_id !== userId && (
                <button
                  onClick={() => removeMember(m.user_id, m.display_name ?? "Housemate")}
                  aria-label={`Remove ${m.display_name ?? "housemate"}`}
                  className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground active:bg-card"
                >
                  <UserMinus size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {confirmLeave ? (
          <div className="mt-3 rounded-xl bg-warning-soft p-3">
            <p className="text-sm">
              Leave {household?.name}? You'll lose access to its inventory until someone invites you
              back.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={leaveHousehold}
                className="flex-1 rounded-xl bg-warning py-2.5 text-sm font-semibold text-white"
              >
                Leave
              </button>
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLeave(true)}
            className="mt-3 w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground"
          >
            Leave this household
          </button>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 text-sm font-bold">Join another household</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Have a code? We'll send a request — an owner there has to approve you.
        </p>
        <form onSubmit={join} className="flex gap-2">
          <input
            maxLength={200}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="AB12CD"
            maxLength={8}
            aria-label="Invite code"
            className={`${field} tracking-[0.3em] uppercase`}
          />
          <button
            type="submit"
            disabled={joining || !joinCode.trim()}
            className="shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {joining ? "Sending…" : "Ask"}
          </button>
        </form>
        <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
          {joinMessage}
        </p>
      </section>

      {household && <TelegramCard householdId={household.id} householdName={household.name} />}

      <PromoCard />

      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 text-sm font-bold">Help & welcome</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Restart the welcome flow and first-use tips. Only affects you.
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              await restartWelcome();
              navigate({ to: "/welcome" });
            } catch {
              toast.error("Couldn't restart the welcome. Try again.");
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-semibold"
        >
          <RotateCcw size={15} /> Restart welcome flow
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Account</h2>
        <p className="mb-3 truncate text-sm text-muted-foreground">{email}</p>
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-semibold"
        >
          <LogOut size={15} /> Sign out
        </button>
      </section>
    </AppShell>
  );
}
