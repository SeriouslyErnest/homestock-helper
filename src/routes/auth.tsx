import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { LogoMark, LogoWordmark } from "@/components/logo";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — HomeStock" },
      { name: "description", content: "Sign in to HomeStock with a code sent to your email." },
      { property: "og:title", content: "Sign in — HomeStock" },
      {
        property: "og:description",
        content: "Sign in to HomeStock with a code sent to your email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

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

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/inventory`,
        ...(name.trim() ? { data: { display_name: name.trim() } } : {}),
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setStep("code");
    setCooldown(30);
    setMessage(`We emailed ${address}. Tap the sign-in link in that email and you're in. If it shows a 6-digit code, you can enter it below instead.`);
    setTimeout(() => codeInput.current?.focus(), 50);
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: digits,
      type: "email",
    });
    if (error) {
      setBusy(false);
      setCode("");
      setMessage("That code didn't work. Check it or send a new one.");
      return;
    }
    if (data.user && name.trim()) {
      await supabase.from("profiles").upsert({ id: data.user.id, display_name: name.trim() });
    }
    navigate({ to: "/inventory", replace: true });
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
            ? "Enter your email and we'll send you a sign-in link."
            : "Check your email — tap the link inside, or enter the code it shows."}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (new here? optional)"
            autoComplete="name"
            className="rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
          />
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
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <input
            ref={codeInput}
            value={code}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(next);
              if (next.length === 6) setTimeout(() => verify(), 0);
            }}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            className="rounded-2xl border border-border bg-surface-2 px-4 py-4 text-center font-condensed text-3xl tracking-[0.4em] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="rounded-2xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setMessage(null);
              }}
              className="py-2 text-muted-foreground underline"
            >
              Use another email
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => sendCode()}
              className="py-2 font-semibold text-brand disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

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

      {message && <p className="mt-4 text-center text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
