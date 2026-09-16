import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Home, KeyRound } from "lucide-react";
import { LogoMark, LogoWordmark } from "@/components/logo";
import {
  createHousehold,
  planLimitMessage,
  useEntitlements,
  useMyJoinRequests,
} from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Set up your household — HomeStock" },
      {
        name: "description",
        content: "Create a household or join one with an invite code to start using HomeStock.",
      },
      { property: "og:title", content: "Set up your household — HomeStock" },
      {
        property: "og:description",
        content: "Create a household or join one with an invite code to start using HomeStock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [name, setName] = useState("Our Home");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { data: plan } = useEntitlements();
  const { data: myRequests } = useMyJoinRequests();
  const canCreate = plan?.can_create_household ?? true;
  const myPending = (myRequests ?? []).filter((r) => r.status === "pending");

  const field =
    "w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await createHousehold(name);
      await queryClient.invalidateQueries();
      navigate({ to: "/inventory" });
    } catch (err) {
      setMessage(planLimitMessage(err) ?? "Couldn't create that home. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("request_household_join", {
      _code: code.trim(),
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
    } else if (data === "member") {
      await queryClient.invalidateQueries();
      navigate({ to: "/inventory" });
    } else if (data === "blocked") {
      setMessage("That home isn't accepting a request from you.");
    } else {
      setMessage(
        "Request sent. Someone who owns that home has to approve you — you'll get in once they do.",
      );
      setCode("");
      setMode("choose");
      queryClient.invalidateQueries({ queryKey: ["my-join-requests"] });
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoMark size={36} />
        <LogoWordmark />
      </div>

      {mode === "choose" && (
        <>
          <h1 className="text-[26px] leading-tight font-semibold">Set up your home</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            HomeStock keeps one shared list per home. Join someone else's with their invite code,
            or start a fresh one.
          </p>
          <div className="mt-6 grid gap-3">
            <button
              onClick={() => setMode("join")}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <KeyRound size={20} />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm">I have an invite code</strong>
                <span className="text-xs text-muted-foreground">
                  Join a home someone already set up
                </span>
              </span>
            </button>
            <button
              onClick={() => setMode("create")}
              disabled={!canCreate}
              aria-describedby={!canCreate ? "create-locked" : undefined}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <Home size={20} />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm">Create a new home</strong>
                <span className="text-xs text-muted-foreground">
                  Start your own and invite others later
                </span>
              </span>
            </button>
            {!canCreate && (
              <p id="create-locked" className="text-xs text-muted-foreground">
                Your plan includes {plan?.max_owned_households ?? 1} home. Ask the owner of the home
                you want to share for their invite code, then use the option above.
              </p>
            )}
          </div>

          {myPending.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-4">
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
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {r.household_name}
                    </span>
                    <span className="shrink-0 rounded-lg bg-warning-soft px-2 py-1 text-xs font-bold">
                      Pending
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {mode === "create" && (
        <form onSubmit={create}>
          <h1 className="text-[26px] leading-tight font-semibold">Name your home</h1>
          <p className="mt-2 text-sm text-muted-foreground">You can change this at any time.</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Home name"
            maxLength={40}
            className={`${field} mt-5`}
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="mt-4 w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create and start"}
          </button>
        </form>
      )}

      {mode === "join" && (
        <form onSubmit={join}>
          <h1 className="text-[26px] leading-tight font-semibold">Enter the invite code</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask whoever set up the home for their 6-character code.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="AB12CD"
            maxLength={8}
            aria-label="Invite code"
            className={`${field} mt-5 tracking-[0.3em] uppercase`}
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="mt-4 w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Sending…" : "Ask to join"}
          </button>
        </form>
      )}

      {mode !== "choose" && (
        <button
          onClick={() => {
            setMode("choose");
            setMessage(null);
          }}
          className="mt-3 w-full rounded-2xl border border-border py-3 text-sm font-semibold"
        >
          Back
        </button>
      )}

      <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
