import { FirstUseTip } from "@/lib/onboarding";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { lookupProduct } from "@/lib/product-lookup";
import { cacheManualProduct } from "@/lib/product-lookup.functions";
import { useHousehold, type Item } from "@/lib/homestock";
import { supabase } from "@/integrations/supabase/client";

type BasketLine = {
  key: string;
  barcode: string;
  /** Set when this product is already on the household's shelves. */
  itemId?: string;
  name: string;
  image?: string | null;
  /** Nobody has named this barcode yet. */
  unknown?: boolean;
  qty: number;
};

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

  // "Restock several": every scan drops into a basket without leaving the camera.
  const [batch, setBatch] = useState(false);
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [committing, setCommitting] = useState(false);
  const lastScan = useRef<{ code: string; at: number } | null>(null);
  const batchRef = useRef(false);
  batchRef.current = batch;
  const unnamed = basket.filter((l) => !l.itemId && !l.name.trim()).length;

  function resumeSoon() {
    setTimeout(() => {
      handled.current = false;
    }, 1200);
  }

  async function addToBasket(code: string) {
    const bump = (match: (l: BasketLine) => boolean, fresh: () => BasketLine) =>
      setBasket((b) =>
        b.some(match) ? b.map((l) => (match(l) ? { ...l, qty: l.qty + 1 } : l)) : [fresh(), ...b],
      );
    if (household) {
      const { data: existing, error } = await supabase
        .from("items")
        .select("id, name")
        .eq("household_id", household.id)
        .eq("barcode", code)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = existing?.[0];
      if (row) {
        bump(
          (l) => l.barcode === code,
          () => ({ key: code, barcode: code, itemId: row.id, name: row.name, qty: 1 }),
        );
        return;
      }
    }
    const info = await lookupProduct(code);
    const name = info ? [info.name, info.brand].filter(Boolean).join(" — ") : "";
    bump(
      (l) => l.barcode === code,
      () => ({
        key: code,
        barcode: code,
        name,
        image: info?.image_url ?? null,
        unknown: !info,
        qty: 1,
      }),
    );
  }

  async function commitBasket() {
    if (!household || unnamed > 0 || basket.length === 0) return;
    setCommitting(true);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const left: BasketLine[] = [];
    for (const line of basket) {
      try {
        if (line.itemId) {
          const { error } = await supabase.rpc("adjust_item_quantity", {
            _item_id: line.itemId,
            _delta: line.qty,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from("items").insert({
            household_id: household.id,
            name: line.name.trim(),
            barcode: line.barcode,
            image_url: line.image ?? null,
            quantity: line.qty,
            unit: "pcs",
            created_by: user?.id ?? null,
          });
          if (error) throw error;
          if (line.unknown) {
            try {
              await cacheManualProduct({ data: { barcode: line.barcode, name: line.name.trim() } });
            } catch {
              // Shared catalogue is best effort; the item is saved either way.
            }
          }
        }
      } catch {
        left.push(line);
      }
    }
    setCommitting(false);
    setBasket(left);
    if (left.length > 0) {
      setMessage(`${left.length} couldn't be saved. Check your connection and tap Save again.`);
    } else {
      toast.success("Restock saved");
      setBatch(false);
    }
  }

  const handleCode = useRef<(code: string) => Promise<void>>(async () => {});
  handleCode.current = async (code: string) => {
    if (batchRef.current) {
      // Same code still in front of the camera — don't count it twice.
      const prev = lastScan.current;
      if (prev && prev.code === code && Date.now() - prev.at < 2500) {
        resumeSoon();
        return;
      }
      lastScan.current = { code, at: Date.now() };
      setMessage(null);
      try {
        await addToBasket(code);
      } catch {
        setMessage("We couldn't check that code. Scan it again when you're back online.");
      }
      resumeSoon();
      return;
    }
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
          shared: info?.source === "manual" ? true : undefined,
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
    setAddQty(1);
    setFound(null);
    setLastCode(null);
    setMessage(null);
    setPhase("scanning");
    handled.current = false;
  }

  const [addQty, setAddQty] = useState(1);
  const [adding, setAdding] = useState(false);

  /** Scan → add straight to stock in one tap, with Undo instead of a confirmation. */
  async function addFoundToStock(item: Item) {
    const qty = addQty;
    setAdding(true);
    const { error } = await supabase.rpc("adjust_item_quantity", {
      _item_id: item.id,
      _delta: qty,
    });
    setAdding(false);
    if (error) {
      setMessage("Couldn't add it. Try again.");
      return;
    }
    toast.success(`Added ${qty} × ${item.name}`, {
      action: {
        label: "Undo",
        onClick: () => {
          void supabase.rpc("adjust_item_quantity", { _item_id: item.id, _delta: -qty });
        },
      },
    });
    setAddQty(1);
    scanAnother();
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

    /** Native detector reads barcodes at any angle (Android Chrome, recent Safari). */
    async function startNative(): Promise<boolean> {
      type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
      const BD = (window as unknown as {
        BarcodeDetector?: {
          new (o: { formats: string[] }): Detector;
          getSupportedFormats: () => Promise<string[]>;
        };
      }).BarcodeDetector;
      if (!BD || !navigator.mediaDevices?.getUserMedia) return false;
      const wanted = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];
      let formats: string[];
      try {
        const supported = await BD.getSupportedFormats();
        formats = wanted.filter((f) => supported.includes(f));
      } catch {
        return false;
      }
      if (formats.length === 0) return false;
      const detector = new BD({ formats });
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return true;
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      let timer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        if (!handled.current && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue && !handled.current && !stopped) {
              handled.current = true;
              void handleCode.current(codes[0].rawValue);
            }
          } catch {
            // Frame not ready — try the next one.
          }
        }
        timer = setTimeout(tick, 120);
      };
      void tick();
      controls = {
        stop: () => {
          stopped = true;
          if (timer) clearTimeout(timer);
          stream.getTracks().forEach((t) => t.stop());
          video.srcObject = null;
        },
      };
      return true;
    }

    /**
     * ZXing fallback for browsers without the native detector. ZXing's own
     * 90° rotation path is unreliable, so we run the scan loop ourselves and
     * alternate between the frame as-is and a properly rotated copy — barcodes
     * held upright or sideways both decode.
     */
    async function startZxing() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
      const hints = new Map<unknown, unknown>([
        [DecodeHintType.TRY_HARDER, true],
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.QR_CODE,
          ],
        ],
      ]);
      const reader = new BrowserMultiFormatReader(hints as never);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const canvas = document.createElement("canvas");
      const rotated = document.createElement("canvas");
      const cctx = canvas.getContext("2d", { willReadFrequently: true });
      const rctx = rotated.getContext("2d", { willReadFrequently: true });
      let timer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      let busy = false;
      let pass = 0;
      const tick = async () => {
        if (stopped) return;
        if (!handled.current && !busy && video.readyState >= 2 && video.videoWidth > 0) {
          busy = true;
          try {
            const w = video.videoWidth;
            const h = video.videoHeight;
            pass = 1 - pass;
            let src: HTMLCanvasElement;
            if (pass === 0) {
              canvas.width = w;
              canvas.height = h;
              cctx?.drawImage(video, 0, 0);
              src = canvas;
            } else {
              // Rotated 90° so upright barcodes read as horizontal scanlines.
              rotated.width = h;
              rotated.height = w;
              if (rctx) {
                rctx.save();
                rctx.translate(h / 2, w / 2);
                rctx.rotate(Math.PI / 2);
                rctx.drawImage(video, -w / 2, -h / 2);
                rctx.restore();
              }
              src = rotated;
            }
            const res = await reader.decodeFromCanvas(src).catch(() => null);
            if (res && !handled.current && !stopped) {
              handled.current = true;
              void handleCode.current(res.getText());
            }
          } finally {
            busy = false;
          }
        }
        timer = setTimeout(tick, 150);
      };
      void tick();
      controls = {
        stop: () => {
          stopped = true;
          if (timer) clearTimeout(timer);
          stream.getTracks().forEach((t) => t.stop());
          video.srcObject = null;
        },
      };
    }

    async function start() {
      try {
        if (await startNative().catch(() => false)) return;
        if (cancelled) return;
        await startZxing();
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
    if (batchRef.current) setManual("");
  }

  const total = (found ?? []).reduce((sum, i) => sum + Number(i.quantity), 0);
  const desired = Math.max(0, ...(found ?? []).map((i) => Number(i.min_quantity)));
  const need = Math.max(desired - total, 0);
  const first = found?.[0];

  return (
    <AppShell title="Scan a barcode" subtitle="Point the camera at a product barcode.">
      <FirstUseTip tip="restock" title="Restocking lots?">
        Turn on Restock several to keep scanning and save everything together at the end.
      </FirstUseTip>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddQty((q) => Math.max(1, q - 1))}
                disabled={addQty <= 1}
                aria-label="Add fewer"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border disabled:opacity-40"
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                onClick={() => void addFoundToStock(first)}
                disabled={adding}
                className="min-h-12 flex-1 rounded-2xl bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {adding ? "Adding…" : `Add ${addQty} to stock`}
              </button>
              <button
                type="button"
                onClick={() => setAddQty((q) => q + 1)}
                aria-label="Add more"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"
              >
                <Plus size={18} />
              </button>
            </div>
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
              className="rounded-2xl border border-border py-3 text-sm font-bold"
            >
              Scan another
            </button>
          </div>
          {message && <p className="mt-2 text-center text-sm text-destructive">{message}</p>}
        </section>
      ) : null}

      {/* Kept mounted while a result is showing so the camera keeps running. */}
      <div className={phase === "result" ? "hidden" : ""}>
        <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-foreground">
          <video
            ref={videoRef}
            className="aspect-[4/3] max-h-[42dvh] w-full object-cover"
            muted
            playsInline
          />
          {/* Orientation guide: a horizontal barcode glyph over the target area. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2"
          >
            <svg
              viewBox="0 0 120 48"
              className="h-16 w-40 rounded-lg bg-black/35 p-2 text-white/90"
              fill="currentColor"
            >
              <rect x="6" y="6" width="3" height="36" />
              <rect x="12" y="6" width="2" height="36" />
              <rect x="17" y="6" width="5" height="36" />
              <rect x="25" y="6" width="2" height="36" />
              <rect x="30" y="6" width="4" height="36" />
              <rect x="37" y="6" width="2" height="36" />
              <rect x="42" y="6" width="6" height="36" />
              <rect x="51" y="6" width="3" height="36" />
              <rect x="57" y="6" width="2" height="36" />
              <rect x="62" y="6" width="5" height="36" />
              <rect x="70" y="6" width="2" height="36" />
              <rect x="75" y="6" width="4" height="36" />
              <rect x="82" y="6" width="2" height="36" />
              <rect x="87" y="6" width="6" height="36" />
              <rect x="96" y="6" width="3" height="36" />
              <rect x="102" y="6" width="2" height="36" />
              <rect x="107" y="6" width="5" height="36" />
            </svg>
            <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white/90">
              Hold the barcode flat like this
            </span>
          </div>
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
      </div>

      {phase !== "result" && (
        <>
          <label className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold">
            Restock several — keep scanning
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={batch}
              onChange={(e) => {
                setBatch(e.target.checked);
                setMessage(null);
                handled.current = false;
                setPhase("scanning");
              }}
            />
          </label>

          {batch && (
            <section className="mt-3 rounded-2xl border border-border bg-card p-3">
              {basket.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  Scan each product — they'll collect here.
                </p>
              ) : (
                <>
                  {unnamed > 0 && (
                    <p className="mb-2 rounded-xl bg-warning-soft px-3 py-2 text-sm font-bold text-warning">
                      {unnamed} product{unnamed === 1 ? " needs" : "s need"} a name
                    </p>
                  )}
                  <ul className="grid gap-2">
                    {basket.map((line) => (
                      <li key={line.key} className="grid gap-1 border-t border-border pt-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {line.itemId || !line.unknown ? (
                            <span className="min-w-0 basis-full break-words text-sm font-semibold">
                              {line.name || line.barcode}
                            </span>
                          ) : (
                            <input
                              value={line.name}
                              onChange={(e) =>
                                setBasket((b) =>
                                  b.map((l) =>
                                    l.key === line.key ? { ...l, name: e.target.value } : l,
                                  ),
                                )
                              }
                              placeholder={`Name for ${line.barcode}`}
                              aria-label={`Name for barcode ${line.barcode}`}
                              className="min-w-0 basis-full rounded-xl border border-warning bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
                            />
                          )}
                          <button
                            aria-label="One fewer"
                            onClick={() =>
                              setBasket((b) =>
                                b.map((l) =>
                                  l.key === line.key ? { ...l, qty: Math.max(1, l.qty - 1) } : l,
                                ),
                              )
                            }
                            className="grid h-10 w-10 place-items-center rounded-xl border border-border"
                          >
                            <Minus size={16} />
                          </button>
                          <strong className="w-6 text-center">{line.qty}</strong>
                          <button
                            aria-label="One more"
                            onClick={() =>
                              setBasket((b) =>
                                b.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l)),
                              )
                            }
                            className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"
                          >
                            <Plus size={16} />
                          </button>
                          <button
                            aria-label="Remove from basket"
                            onClick={() => setBasket((b) => b.filter((l) => l.key !== line.key))}
                            className="grid h-10 w-8 place-items-center text-muted-foreground"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        {!line.itemId && !line.unknown && (
                          <span className="text-xs text-muted-foreground">New to your home</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={commitBasket}
                    disabled={committing || unnamed > 0}
                    className="mt-3 w-full rounded-2xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {committing
                      ? "Saving…"
                      : unnamed > 0
                        ? "Name or remove the new ones first"
                        : `Save ${basket.reduce((s, l) => s + l.qty, 0)} to inventory`}
                  </button>
                </>
              )}
            </section>
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
            We remember every product you identify, so the next scan is instant.
          </p>
        </>
      )}
    </AppShell>
  );
}
