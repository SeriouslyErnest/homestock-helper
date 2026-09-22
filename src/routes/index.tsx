import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { getSignupPolicy } from "@/lib/signup-policy.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HomeStock — Shared household inventory" },
      {
        name: "description",
        content:
          "HomeStock is a lightweight shared household inventory: know what you have, what's running low, and what to buy.",
      },
      { property: "og:title", content: "HomeStock — Shared household inventory" },
      {
        property: "og:description",
        content: "A lightweight shared memory for your household consumables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-8 text-center">
      <LogoMark size={96} />
      <LogoWordmark className="mt-4 text-4xl" />
      <p className="mt-3 text-muted-foreground">
        A shared memory for your household. Know what you have, what's running low, and what to buy.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3">
        {signupsOpen && (
          <Link
            to="/auth"
            className="rounded-2xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground"
          >
            Get started
          </Link>
        )}
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          className={
            signupsOpen
              ? "rounded-2xl border border-border bg-card px-4 py-3.5 font-semibold"
              : "rounded-2xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground"
          }
        >
          {signupsOpen ? "I already have an account" : "Sign in"}
        </Link>
        {!signupsOpen && (
          <p className="text-sm text-muted-foreground">
            HomeStock is invite only right now. If someone has invited you, use the link in your
            email to set up your account.
          </p>
        )}
        <Link to="/about" className="px-4 py-3 font-semibold text-muted-foreground">
          Find out more about HomeStock
        </Link>
      </div>
    </div>
  );
}
