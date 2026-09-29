import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogoMark, LogoWordmark } from "@/components/logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — HomeStock" },
      { name: "description", content: "Choose a new password for your HomeStock account." },
      { property: "og:title", content: "Set a new password — HomeStock" },
      { property: "og:description", content: "Choose a new password for your HomeStock account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: d }) => d.session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setMessage("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    navigate({ to: "/inventory", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <LogoMark size={64} />
        <LogoWordmark className="mt-3 text-3xl" />
        <p className="mt-1 text-sm text-muted-foreground">
          {ready ? "Choose a new password." : "Open this page from the link in your reset email."}
        </p>
      </div>
      {ready && (
        <form onSubmit={save} className="flex flex-col gap-3">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (8+ characters)"
            aria-label="New password"
            autoComplete="new-password"
            className="rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy || !password}
            className="rounded-2xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
      {message && (
        <p className="mt-4 text-center text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
