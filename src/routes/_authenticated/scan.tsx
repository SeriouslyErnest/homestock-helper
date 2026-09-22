import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { lookupProduct } from "@/lib/product-lookup";
import { useHousehold, type Item } from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Scan a barcode — HomeStock" },
      { name: "description", content: "Scan a product barcode to add or find it in HomeStock." },
      { property: "og:title", content: "Scan a barcode — HomeStock" },
      {
        property: "og:description",
        content: "Scan a product barcode to add or find it in HomeStock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

type Phase = "scanning" | "looking-up" | "error" | "result";

function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const navigate = useNavigate();
  const { data: household } = useHousehold();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);
  // "Do we have this?" answered first — the scan result, before any next step.
  const [found, setFound] = useState<Item[] | null>(null);

  const [lastCode, setLastCode] = useState<string | null>(null);

  const handleCode = useRef<(code: string) => Promise<void>>(async () => {});
  handleCode.current = async (code: string) => {
    setPhase("looking-up");
    setMessage(null);
    setLastCode(code);
    setFound(null);

    try {
      // Already on the shelf? Answer "do we have this?" right here — no workflow.
      if (household) {
        const { data: existing, error } = await supabase
          .from("items")
          .select("*")
          .eq("household_id", household.id)
          .eq("barcode", code);
        if (error) throw error;
        if (existing && existing.length > 0) {
          setFound(existing as Item[]);
          setPhase("result");
          return;
        }
      }

      const info = await lookupProduct(code);
      navigate({
        to: "/add",
        search: {
          barcode: code,
          name: info?.name ?? undefined,
          brand: info?.brand ?? undefined,
          image: info?.image_url ?? undefined,
          notFound: info ? undefined : true,
        },
      });
    } catch {
      // Network hiccup — never leave the screen hanging with no way forward.
      handled.current = false;
      setPhase("error");
      setMessage("We couldn't check that code. Check your connection and try again.");
    }
  };

  async function retry() {
    if (!lastCode) return;
    handled.current = true;
    await handleCode.current(lastCode);
  }

  function scanAnother() {
    setFound(null);
    setLastCode(null);
    setMessage(null);
    setPhase("scanning");
    handled.current = false;
  }

  async function addFoundToShopping(item: Item, need: number) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("shopping_items").insert({
      household_id: item.household_id,
      item_id: item.id,
      name: item.name,
      quantity: Math.max(1, need),
      requested_by: user?.id ?? null,
    });
    if (error) {
      setMessage("Couldn't add it to the shopping list. Try again.");
      return;
    }
    navigate({ to: "/shopping" });
  }

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        if (devices.length === 0) {
          setPhase("error");
          setMessage("No camera found. Enter the barcode by hand below.");
          return;
        }
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (res) => {
            if (res && !handled.current) {
              handled.current = true;
              void handleCode.current(res.getText());
            }
          },
        );
        // Left the page while the camera was still starting up.
        if (cancelled) controls.stop();
      } catch {
        if (!cancelled) {
          setPhase("error");
          setMessage("Camera isn't available. Enter the barcode by hand below.");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code || handled.current) return;
    handled.current = true;
    await handleCode.current(code);
  }

  const total = (found ?? []).reduce((sum, i) => sum + Number(i.quantity), 0);
  const desired = Math.max(0, ...(found ?? []).map((i) => Number(i.min_quantity)));
  const need = Math.max(desired - total, 0);
  const first = found?.[0];

  return (
    <AppShell title="Scan a barcode" subtitle="Point the camera at a product barcode.">
      {phase === "result" && first ? (
        <section className="rounded-3xl border border-border bg-card p-4">
          <h2 className="text-lg font-bold break-words">{first.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You have <strong className="text-foreground">{total}</strong> at home
            {desired > 0 ? ` · you like to keep ${desired}` : ""}
          </p>
          <ul className="mt-3 grid gap-1 text-sm">
            {found!.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 border-t border-border pt-1">
                <span className="truncate">{row.location?.trim() || "No place set"}</span>
                <strong className="shrink-0">
                  {Number(row.quantity)} {row.unit}
                </strong>
              </li>
            ))}
          </ul>
          <p
            className={`mt-3 rounded-2xl px-3 py-2 text-sm font-bold ${
              need > 0 || total <= 0
                ? "bg-warning-soft text-warning"
                : "bg-success-soft text-success"
            }`}
          >
            {total <= 0
              ? "You're out of this one"
              : need > 0
                ? `Need ${need} more`
                : "You're stocked"}
          </p>
          <div className="mt-3 grid gap-2">
            <button
              onClick={() => addFoundToShopping(first, need || 1)}
              className="rounded-2xl border border-border py-3 text-sm font-bold"
            >
              Add to shopping list
            </button>
            <Link
              to="/item/$itemId"
              params={{ itemId: first.id }}
              className="rounded-2xl border border-border py-3 text-center text-sm font-bold"
            >
              View details
            </Link>
            <button
              onClick={scanAnother}
              className="rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              Scan another
            </button>
          </div>
          {message && <p className="mt-2 text-center text-sm text-destructive">{message}</p>}
        </section>
      ) : (
        <>
          <div className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-foreground">
            <video
              ref={videoRef}
              className="aspect-[4/3] max-h-[42dvh] w-full object-cover"
              muted
              playsInline
            />
          </div>

          <p role="status" aria-live="polite" className="mt-3 text-center text-sm">
            {phase === "looking-up" && (
              <span className="font-semibold text-brand">Checking what's at home…</span>
            )}
            {message && <span className="text-muted-foreground">{message}</span>}
          </p>
          {phase === "error" && lastCode && (
            <div className="mt-2 grid gap-2">
              <button
                onClick={retry}
                className="mx-auto block rounded-2xl border border-border px-5 py-3 text-sm font-bold"
              >
                Try {lastCode} again
              </button>
              <Link
                to="/inventory"
                className="mx-auto block rounded-2xl px-5 py-2 text-sm font-semibold text-brand"
              >
                Search by name instead
              </Link>
            </div>
          )}
        </>
      )}

      <form onSubmit={submitManual} className="mt-4 flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          inputMode="numeric"
          placeholder="Or type the barcode number"
          aria-label="Type the barcode number"
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={!manual.trim() || phase === "looking-up"}
          className="shrink-0 rounded-2xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50"
        >
          Look up
        </button>
      </form>

      <Link
        to="/add"
        className="mt-4 block rounded-2xl border border-border bg-card py-4 text-center text-base font-semibold text-brand active:bg-surface-2"
      >
        Add without a barcode
      </Link>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        New products are saved to your shared cache, so the next scan is instant.
      </p>
    </AppShell>
  );
}
