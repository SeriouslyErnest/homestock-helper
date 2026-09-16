import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { lookupProduct } from "@/lib/product-lookup";
import { useHousehold } from "@/lib/homestock";
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

type Phase = "scanning" | "looking-up" | "error";

function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const navigate = useNavigate();
  const { data: household } = useHousehold();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);

  const [lastCode, setLastCode] = useState<string | null>(null);

  const handleCode = useRef<(code: string) => Promise<void>>(async () => {});
  handleCode.current = async (code: string) => {
    setPhase("looking-up");
    setMessage(null);
    setLastCode(code);

    try {
      // Already on the shelf? Go straight to the item so scanning doubles as "do we have this?".
      if (household) {
        const { data: existing, error } = await supabase
          .from("items")
          .select("id")
          .eq("household_id", household.id)
          .eq("barcode", code)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (existing) {
          navigate({ to: "/item/$itemId", params: { itemId: existing.id } });
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

  return (
    <AppShell title="Scan a barcode" subtitle="Point the camera at a product barcode.">
      <div className="overflow-hidden rounded-3xl border border-border bg-black">
        <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline />
      </div>

      {phase === "looking-up" && (
        <p className="mt-3 text-center text-sm font-semibold text-brand">Looking up product…</p>
      )}
      {message && <p className="mt-3 text-center text-sm text-muted-foreground">{message}</p>}

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

      <p className="mt-4 text-center text-xs text-muted-foreground">
        New products are saved to your shared cache, so the next scan is instant.{" "}
        <Link to="/add" className="font-semibold text-brand">
          Add without a barcode
        </Link>
      </p>
    </AppShell>
  );
}
