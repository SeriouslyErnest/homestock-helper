import { Minus, Plus, ScanBarcode, Search } from "lucide-react";
import { PhoneFrame } from "@/components/marketing";

function Row({
  emoji,
  name,
  meta,
  qty,
  status,
  tone = "success",
}: {
  emoji: string;
  name: string;
  meta: string;
  qty: string;
  status: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-base">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">{name}</strong>
        <span className="block truncate text-[10px] text-muted-foreground">{meta}</span>
      </span>
      <span className="text-right">
        <strong className="block text-sm leading-none">{qty}</strong>
        <span
          className={`block text-[8px] font-extrabold uppercase ${
            tone === "warning" ? "text-warning" : "text-success"
          }`}
        >
          {status}
        </span>
      </span>
    </div>
  );
}

export function InventoryMock() {
  return (
    <PhoneFrame label="HomeStock inventory screen listing milk, pasta and washing-up liquid with quantities">
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-card px-2.5 py-2 text-[11px] text-muted-foreground">
        <Search size={12} /> Search what's at home
      </div>
      <div className="grid gap-1.5">
        <Row emoji="🥛" name="Whole milk" meta="Fridge · exp 20 Sep" qty="2" status="In stock" />
        <Row emoji="🍜" name="Pasta" meta="Pantry" qty="4" status="In stock" />
        <Row
          emoji="🧴"
          name="Washing-up liquid"
          meta="Under sink · min 2"
          qty="1"
          status="Low"
          tone="warning"
        />
        <Row emoji="🧻" name="Kitchen roll" meta="Cleaning" qty="3" status="In stock" />
      </div>
    </PhoneFrame>
  );
}

export function RestockMock() {
  return (
    <PhoneFrame label="HomeStock restock screen: barcode scanner above a basket of three scanned items">
      <div className="grid h-24 place-items-center rounded-xl border-2 border-dashed border-brand bg-brand-soft text-brand">
        <ScanBarcode size={28} />
      </div>
      <p className="mt-2 text-center text-[10px] font-semibold text-muted-foreground">
        Point at the barcode
      </p>
      <div className="mt-2 grid gap-1.5">
        <Row emoji="🥛" name="Whole milk" meta="Just scanned" qty="×2" status="Basket" />
        <Row emoji="🍜" name="Pasta" meta="Just scanned" qty="×1" status="Basket" />
        <Row emoji="🧻" name="Kitchen roll" meta="Just scanned" qty="×4" status="Basket" />
      </div>
      <div className="mt-2 rounded-xl bg-primary py-2 text-center text-[11px] font-bold text-primary-foreground">
        Add 7 items to inventory
      </div>
    </PhoneFrame>
  );
}

export function ConsumeMock() {
  return (
    <PhoneFrame label="HomeStock consume screen: large minus button beside a product with an undo message">
      <div className="rounded-xl border border-border bg-card p-3 text-center">
        <span className="text-3xl">🥛</span>
        <strong className="mt-1 block text-sm">Whole milk</strong>
        <span className="text-[10px] text-muted-foreground">Fridge</span>
        <div className="mt-3 flex items-center justify-center gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
            <Minus size={18} />
          </span>
          <strong className="text-3xl leading-none">1</strong>
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-border text-muted-foreground">
            <Plus size={18} />
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl bg-foreground px-3 py-2 text-[10px] font-semibold text-background">
        Took one Whole milk <span className="font-extrabold underline">Undo</span>
      </div>
    </PhoneFrame>
  );
}

export function RunningLowMock() {
  return (
    <PhoneFrame label="HomeStock running low list showing milk, washing-up liquid and coffee below their desired levels">
      <p className="mb-2 text-[11px] font-bold text-warning">Running low · 3</p>
      <div className="grid gap-1.5">
        <Row
          emoji="🥛"
          name="Whole milk"
          meta="Desired 3 · need 2"
          qty="1"
          status="Low"
          tone="warning"
        />
        <Row
          emoji="🧴"
          name="Washing-up liquid"
          meta="Desired 2 · need 1"
          qty="1"
          status="Low"
          tone="warning"
        />
        <Row
          emoji="☕"
          name="Coffee"
          meta="Desired 2 · need 2"
          qty="0"
          status="Out"
          tone="warning"
        />
      </div>
    </PhoneFrame>
  );
}

export function ShoppingMock() {
  return (
    <PhoneFrame label="HomeStock shopping list with a bread request tagged any brand and a milk request tagged only if on sale">
      <p className="mb-2 text-[11px] font-bold">To buy · 2</p>
      <div className="grid gap-1.5">
        <div className="rounded-xl border border-border bg-card p-2.5">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-border" />
            <strong className="flex-1 text-xs">Bread ×1</strong>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
              Any brand
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-2.5">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-border" />
            <strong className="flex-1 text-xs">Milk ×2</strong>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
              Only if on sale
            </span>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function ListVsCardMock() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <figure className="rounded-3xl border border-border bg-card p-4">
        <div
          role="img"
          aria-label="List view: compact rows showing product, quantity and status"
          className="grid gap-1.5"
        >
          <Row emoji="🥛" name="Whole milk" meta="Fridge" qty="2" status="In stock" />
          <Row emoji="🍜" name="Pasta" meta="Pantry" qty="4" status="In stock" />
          <Row emoji="☕" name="Coffee" meta="Pantry" qty="0" status="Out" tone="warning" />
        </div>
        <figcaption className="mt-3 text-sm">
          <strong>List view</strong>
          <span className="block text-muted-foreground">
            Compact rows with product, quantity and status.
          </span>
        </figcaption>
      </figure>

      <figure className="rounded-3xl border border-border bg-card p-4">
        <div
          role="img"
          aria-label="Card view: larger product cards with images and big quantities"
          className="grid grid-cols-2 gap-2"
        >
          {[
            { e: "🥛", n: "Whole milk", q: "2" },
            { e: "🍜", n: "Pasta", q: "4" },
            { e: "🧻", n: "Kitchen roll", q: "3" },
            { e: "☕", n: "Coffee", q: "0" },
          ].map((p) => (
            <div
              key={p.n}
              className="rounded-xl border border-border bg-surface-2 p-2.5 text-center"
            >
              <span className="text-2xl">{p.e}</span>
              <strong className="mt-1 block truncate text-[11px]">{p.n}</strong>
              <strong className="block text-xl leading-tight">{p.q}</strong>
            </div>
          ))}
        </div>
        <figcaption className="mt-3 text-sm">
          <strong>Card view</strong>
          <span className="block text-muted-foreground">
            Visual product cards with larger images and quantities.
          </span>
        </figcaption>
      </figure>
    </div>
  );
}

export function HouseholdMock() {
  const people = ["Alex", "Jamie", "Mum", "Dad"];
  return (
    <figure className="rounded-3xl border border-border bg-card p-6 text-center">
      <div
        role="img"
        aria-label="Diagram: one HomeStock household shared by Alex, Jamie, Mum and Dad"
      >
        <span className="inline-block rounded-full bg-brand-soft px-4 py-2 text-sm font-bold text-brand">
          HomeStock Household
        </span>
        <div className="mx-auto mt-4 h-5 w-px bg-border" aria-hidden="true" />
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {people.map((p) => (
            <li
              key={p}
              className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm font-semibold"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-background text-[10px] font-extrabold text-brand">
                {p.slice(0, 2).toUpperCase()}
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
