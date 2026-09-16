import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, LogOut, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useHousehold, useMembers } from "@/lib/homestock";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [householdName, setHouseholdName] = useState("");
  const [email, setEmail] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isOwner = (members ?? []).some((m) => m.user_id === userId && m.role === "owner");

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
    await queryClient.invalidateQueries();
    setConfirmLeave(false);
    toast.success("You left the household");
    navigate({ to: "/inventory" });
  }

  async function renameHousehold() {
    if (!household || !householdName.trim()) return;
    await supabase.from("households").update({ name: householdName.trim() }).eq("id", household.id);
    queryClient.invalidateQueries({ queryKey: ["household"] });
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

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinMessage(null);
    const { data, error } = await supabase.rpc("join_household_by_code", {
      _code: joinCode.trim(),
    });
    setJoining(false);
    if (error) {
      setJoinMessage(error.message);
    } else {
      setJoinMessage(`You've joined “${data}”. Reloading…`);
      queryClient.invalidateQueries();
      setTimeout(() => window.location.assign("/inventory"), 800);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const field =
    "w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand";

  return (
    <AppShell title="Household & account">
      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Household</h2>
        <label htmlFor="hh-name" className="mb-1 block text-xs font-bold text-muted-foreground">
          Name
        </label>
        <div className="flex gap-2">
          <input
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
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs font-bold text-brand"
          >
            <Copy size={14} /> Copy
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Share this code so family or flatmates can join.
        </p>
      </section>

      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Members · {members?.length ?? 0}</h2>
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
          Have a code? Joining switches this account to that household.
        </p>
        <form onSubmit={join} className="flex gap-2">
          <input
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
            {joining ? "Joining…" : "Join"}
          </button>
        </form>
        {joinMessage && <p className="mt-2 text-sm text-muted-foreground">{joinMessage}</p>}
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
