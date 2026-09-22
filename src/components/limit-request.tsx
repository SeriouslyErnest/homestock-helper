import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, MailQuestion } from "lucide-react";
import { requestLimitIncrease, useMyLimitRequest } from "@/lib/homestock";

/**
 * Shown where "create a new home" is out of reach. Explains the cap in plain
 * words and lets the person put their hand up; the ask lands in the operator's
 * dashboard and disappears again once it's been dealt with.
 */
export function AskForMoreHomes({ limit }: { limit: number }) {
  const queryClient = useQueryClient();
  const { data: existing } = useMyLimitRequest("households");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const asked = !!existing;

  async function ask() {
    setBusy(true);
    setFailed(false);
    try {
      await requestLimitIncrease("households");
      await queryClient.invalidateQueries({ queryKey: ["my-limit-request", "households"] });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface-2 p-4">
      <p className="text-sm font-semibold">You've set up {limit} homes</p>
      <p className="mt-1 text-xs text-muted-foreground">
        While HomeStock is being tested, each account can create {limit} homes. You can still join
        as many other homes as you like with an invite code.
      </p>
      {asked ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 text-xs font-semibold text-brand"
        >
          <Check size={16} aria-hidden="true" />
          We've passed this on — we'll be in touch by email.
        </p>
      ) : (
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <MailQuestion size={18} aria-hidden="true" />
          {busy ? "Sending…" : "Ask for another home"}
        </button>
      )}
      {failed && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          Couldn't send that just now. Please try again.
        </p>
      )}
    </div>
  );
}
