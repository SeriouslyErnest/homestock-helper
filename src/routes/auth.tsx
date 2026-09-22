import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { getSignupPolicy } from "@/lib/signup-policy.functions";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — HomeStock" },
      { name: "description", content: "Sign in to HomeStock with a link sent to your email — no password needed." },
      { property: "og:title", content: "Sign in — HomeStock" },
      {
        property: "og:description",
        content: "Sign in to HomeStock with a link sent to your email — no password needed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "sent">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const { data: policy } = useQuery({
    queryKey: ["signup-policy"],
    queryFn: () => getSignupPolicy(),
  });
  const signupsOpen = policy?.signupsEnabled ?? true;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inventory", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: signupsOpen,
        emailRedirectTo: `${window.location.origin}/inventory`,
        ...(name.trim() ? { data: { display_name: name.trim() } } : {}),
      },
    });
    setBusy(false);
    if (error) {
      setMessage(
        !signupsOpen && /not allowed|signups/i.test(error.message)
          ? "New accounts are invite only at the moment. If you've been invited, use the link in your invitation email."
          : error.message,
      );
      return;
    }
    setStep("sent");
    setCooldown(30);
  }

  async function google() {
    setBusy(true);
    setMessage(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setMessage(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/inventory", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <LogoMark size={64} />
        <LogoWordmark className="mt-3 text-3xl" />
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "email"
            ? "Enter your email and we'll send you a sign-in link — no password needed."
            : `We emailed ${email}. Tap the link in that email and you're in.`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          {!signupsOpen && (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-center text-sm text-muted-foreground">
              HomeStock is invite only right now. Sign in below if you already have an account, or
              use the link in your invitation email.
            </p>
          )}
          {signupsOpen && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (new here? optional)"
              autoComplete="name"
              className="rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            inputMode="email"
            className="rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="rounded-2xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="rounded-2xl bg-brand-soft px-4 py-4 text-center text-sm" aria-live="polite">
            You can close this tab once you've tapped the link — you'll come straight back here
            signed in.
          </p>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setMessage(null);
              }}
              className="py-2 text-muted-foreground underline"
            >
              Use another email
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => sendLink()}
              className="py-2 font-semibold text-brand disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
            </button>
          </div>
        </div>
      )}

      {signupsOpen && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="rounded-2xl border border-border bg-card px-4 py-3.5 font-semibold disabled:opacity-60"
          >
            Continue with Google
          </button>
        </>
      )}

      {message && (
        <p className="mt-4 text-center text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
