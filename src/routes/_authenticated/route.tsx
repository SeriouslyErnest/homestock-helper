import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogoMark } from "@/components/logo";
import { useHouseholds } from "@/lib/homestock";
import { syncAccountDirectory } from "@/lib/admin.functions";

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

  return <HouseholdGate />;
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
