import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ShoppingCart, ScanBarcode, MoreHorizontal, MinusCircle } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { useProfile } from "@/lib/homestock";

function initials(name: string | null | undefined, email: string | undefined): string {
  const base = name || email || "?";
  return base
    .split(/[\s@._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function AppShell({
  title,
  subtitle,
  children,
  headerExtra,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  headerExtra?: ReactNode;
}) {
  const { data: profile } = useProfile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItem = (to: string, label: string, Icon: typeof Home) => {
    const active = pathname === to;
    return (
      <Link
        to={to}
        className={`flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] ${
          active ? "font-extrabold text-brand" : "text-muted-foreground"
        }`}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={20} />
        {label}
      </Link>
    );
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <header className="px-5 pt-5 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link
            to="/inventory"
            className="flex min-w-0 items-center gap-2.5 overflow-hidden"
            aria-label="HomeStock home"
          >
            <LogoMark size={32} />
            <LogoWordmark />
          </Link>
          <Link
            to="/more"
            aria-label={`Your account${profile?.email ? ` (${profile.email})` : ""}`}
            title={profile?.displayName || profile?.email || "Your account"}
            className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-sm font-extrabold text-brand"
          >
            {initials(profile?.displayName, profile?.email).slice(0, 2)}
          </Link>
        </div>
        <h1 className="mt-4 text-[23px] leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {headerExtra}
      </header>

      <main className="min-h-0 flex-1 px-5 pb-32">{children}</main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background from-30% to-transparent px-3 pt-7 pb-3">
        <nav
          aria-label="Main navigation"
          className="pointer-events-auto mx-auto grid h-16 w-full max-w-md grid-cols-5 items-center justify-items-center rounded-3xl border border-border bg-card/95 shadow-lg backdrop-blur"
        >
          {navItem("/inventory", "Inventory", Home)}
          {navItem("/consume", "Use up", MinusCircle)}
          <Link
            to="/scan"
            aria-label="Scan a barcode"
            className="grid h-14 w-14 -translate-y-4 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/40"
          >
            <ScanBarcode size={24} />
          </Link>
          {navItem("/shopping", "Shopping", ShoppingCart)}
          {navItem("/more", "More", MoreHorizontal)}
        </nav>
      </div>
    </div>
  );
}
