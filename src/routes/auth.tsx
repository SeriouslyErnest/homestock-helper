import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
      { name: "description", content: "Sign in or create your HomeStock account." },
      { property: "og:title", content: "Sign in — HomeStock" },
      { property: "og:description", content: "Sign in or create your HomeStock account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(mode !== "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inventory", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || undefined } },
        });
        if (error) throw error;
        if (data.user && name) {
          await supabase.from("profiles").upsert({ id: data.user.id, display_name: name });
        }
        if (!data.session) {
          setMessage("Check your email to confirm your account, then sign in.");
          setIsSignup(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/inventory" });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
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
    navigate({ to: "/inventory" });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <LogoMark size={64} />
        <LogoWordmark className="mt-3 text-3xl" />
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignup ? "Create your account to start stocking." : "Welcome back."}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-2xl border border-border bg-surface-2 p-1">
        {(["Sign in", "Create account"] as const).map((label, i) => {
          const active = isSignup === (i === 1);
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setIsSignup(i === 1);
                setMessage(null);
              }}
              className={`rounded-xl py-2 text-sm font-semibold ${
                active ? "bg-card text-brand shadow-sm" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {isSignup && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
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
          className="rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          className="rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "One moment…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

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
