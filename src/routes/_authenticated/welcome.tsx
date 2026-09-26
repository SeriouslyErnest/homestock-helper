import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Home, ScanBarcode, ShoppingCart, MinusCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { useOnboarding, useOnboardingActions } from "@/lib/onboarding";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to HomeStock" },
      { name: "description", content: "A quick look at how HomeStock works." },
      { property: "og:title", content: "Welcome to HomeStock" },
      { property: "og:description", content: "A quick look at how HomeStock works." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WelcomePage,
});

type Step = { icon: ReactNode; heading: string; body: ReactNode };

const Term = ({ t, children }: { t: string; children: ReactNode }) => (
  <li className="rounded-2xl bg-surface-2 p-3">
    <strong className="block">{t}</strong>
    <span className="text-muted-foreground">{children}</span>
  </li>
);

const STEPS: Step[] = [
  {
    icon: <LogoMark size={64} />,
    heading: "Welcome to HomeStock",
    body: (
      <>
        <p>Know what you have at home, what is running low, and what needs buying.</p>
        <p className="text-muted-foreground">
          You don't need to catalogue everything. Start with the things you actually want HomeStock
          to remember.
        </p>
      </>
    ),
  },
  {
    icon: <Home size={40} />,
    heading: "See what you have",
    body: (
      <>
        <p>Inventory shows what your home is tracking and highlights things that may need attention.</p>
        <ul className="grid gap-2 text-sm">
          <Term t="Tracked">Products this home is keeping an eye on.</Term>
          <Term t="Need attention">Running low, or worth checking soon.</Term>
          <Term t="Expiring soon">An expiry date is coming up.</Term>
        </ul>
        <p className="text-muted-foreground">Use + or − for quick changes. Mistakes can be undone.</p>
      </>
    ),
  },
  {
    icon: <ScanBarcode size={40} />,
    heading: "Add stock by scanning",
    body: (
      <>
        <p>Tap the scan button and point your phone camera at a barcode.</p>
        <p>
          Scan one thing and add it straight away — or turn on <strong>Restock several</strong> to
          keep scanning and save everything together at the end.
        </p>
        <p className="text-muted-foreground">
          Never seen a barcode before? Just give the product a name.
        </p>
      </>
    ),
  },
  {
    icon: <ShoppingCart size={40} />,
    heading: "Keep your shopping in one place",
    body: (
      <>
        <ul className="grid gap-2 text-sm">
          <Term t="Running low">
            Shown automatically when you have fewer than your "Keep at least" amount.
          </Term>
          <Term t="Buy requests">Things someone in your home has asked to buy.</Term>
        </ul>
        <p className="text-muted-foreground">
          You can add a quick request without adding it to your inventory first.
        </p>
      </>
    ),
  },
  {
    icon: <MinusCircle size={40} />,
    heading: "Update stock as you use things",
    body: (
      <>
        <p>When you use something, take it off in one tap:</p>
        <ul className="list-disc pl-5 text-sm">
          <li>tap −1 on something you use often</li>
          <li>scan its barcode</li>
          <li>or search for it</li>
        </ul>
        <p className="text-muted-foreground">Made a mistake? Tap Undo.</p>
        <p className="font-semibold">
          That's enough to get started. Add more detail only when it's useful to you.
        </p>
      </>
    ),
  },
];

function WelcomePage() {
  const navigate = useNavigate();
  const { data } = useOnboarding();
  const { step: saveStep, finish } = useOnboardingActions();
  const [step, setStep] = useState<number | null>(null);

  // Resume where they left off (short flow, so restarting would also be fine).
  useEffect(() => {
    if (!data || step !== null) return;
    const s = data.welcome_status === "in_progress" ? data.current_step : 0;
    setStep(Math.min(Math.max(s, 0), STEPS.length - 1));
    if (data.welcome_status === "not_started") void saveStep(0);
  }, [data, step, saveStep]);

  if (step === null) return null;
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  const go = (n: number) => {
    setStep(n);
    void saveStep(n);
  };
  const exit = async (status: "completed" | "skipped") => {
    await finish(status);
    navigate({ to: "/inventory", replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-6 pb-8">
      <div className="flex min-h-11 items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
          {step + 1} of {STEPS.length}
        </p>
        {step > 0 && (
          <button
            type="button"
            onClick={() => void exit("skipped")}
            className="min-h-11 px-3 text-sm font-semibold text-muted-foreground underline"
          >
            Skip
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4 py-6">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-brand-soft text-brand">
          {current.icon}
        </div>
        <h1 className="text-2xl font-bold" tabIndex={-1} key={step}>
          {current.heading}
        </h1>
        <div className="grid gap-3">{current.body}</div>
      </div>

      <div className="mb-4 flex justify-center gap-2" aria-hidden>
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full ${i === step ? "w-6 bg-primary" : "w-2 bg-border"}`}
          />
        ))}
      </div>
      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => (last ? void exit("completed") : go(step + 1))}
          className="min-h-12 rounded-2xl bg-primary font-semibold text-primary-foreground"
        >
          {last ? "Finish" : "Next"}
        </button>
        {step === 0 ? (
          <button
            type="button"
            onClick={() => void exit("skipped")}
            className="min-h-11 text-sm font-semibold text-muted-foreground underline"
          >
            Skip
          </button>
        ) : (
          <button
            type="button"
            onClick={() => go(step - 1)}
            className="min-h-11 text-sm font-semibold text-muted-foreground"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
