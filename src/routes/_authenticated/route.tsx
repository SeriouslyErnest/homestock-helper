import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogoMark } from "@/components/logo";
import { useHouseholds } from "@/lib/homestock";
import { useQuery } from "@tanstack/react-query";
import { myApprovalStatus, syncAccountDirectory } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <LogoMark size={56} />
    </div>
  );
}

function AuthGate() {
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        navigate({ to: "/auth", replace: true });
      } else {
        setReady(true);
        // Keeps the operations directory current without ever storing a plain
        // email address in the app's own tables.
        void syncAccountDirectory().catch(() => undefined);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/auth", replace: true });
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (!ready) return <Splash />;

  return <ApprovalGate />;
}

/** When the admin has switched on account approval, newcomers wait here. */
function ApprovalGate() {
  const { data, isPending, refetch, isFetching } = useQuery({
    queryKey: ["my-approval"],
    queryFn: () => myApprovalStatus(),
    staleTime: 5 * 60_000,
  });
  if (isPending) return <Splash />;
  // If the check itself fails, don't lock people out — the database still enforces it.
  if (!data || data.status === "approved") return <HouseholdGate />;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-8 text-center">
      <LogoMark size={64} />
      <h1 className="text-xl font-bold">
        {data.status === "pending" ? "Thanks for signing up" : "Your account wasn't approved"}
      </h1>
      <p className="text-sm text-muted-foreground" role="status">
        {data.status === "pending"
          ? "New accounts are being approved by hand right now. You'll be able to use HomeStock as soon as yours is approved — check back soon."
          : "HomeStock isn't taking new accounts like yours at the moment. If you think this is a mistake, contact whoever invited you."}
      </p>
      {data.status === "pending" && (
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="min-h-11 rounded-2xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {isFetching ? "Checking…" : "Check again"}
        </button>
      )}
      <button
        type="button"
        onClick={() => void supabase.auth.signOut()}
        className="min-h-11 px-4 text-sm font-semibold text-muted-foreground underline"
      >
        Sign out
      </button>
    </div>
  );
}

/** New accounts have no home yet — send them to choose join or create. */
function HouseholdGate() {
  const { data: households, isPending, isError } = useHouseholds();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onSetup = pathname === "/setup";

  useEffect(() => {
    if (isPending || isError) return;
    const count = households?.length ?? 0;
    if (count === 0 && !onSetup) {
      navigate({ to: "/setup", replace: true });
    } else if (count > 0 && onSetup) {
      // First-run only — once you have a home, this screen can't make duplicates.
      navigate({ to: "/inventory", replace: true });
    }
  }, [households, isPending, isError, onSetup, navigate]);

  if (isPending) return <Splash />;
  if (!isError && (households?.length ?? 0) === 0 && !onSetup) return <Splash />;
  if (!isError && (households?.length ?? 0) > 0 && onSetup) return <Splash />;

  return <Outlet />;
}
