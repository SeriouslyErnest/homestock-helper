import { ProBadge } from "@/components/pro-badge";

/** Fictional, read-only screenshot subjects. Never query or seed a real home.
 * Rendered by /pro?sample=true so documentation screenshots can be regenerated.
 * Mirrors the headings, rows and units of the real Household insights screen.
 */
export function ProSample({ kind }: { kind: "forecast" | "audit" | "flow" }) {
  return (
    <div data-pro-sample={kind} className="theme-light w-full max-w-[390px] space-y-4 bg-background p-5 text-foreground">
      <header>
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-brand">HOMESTOCK</span><ProBadge /></div>
        <h3 className="mt-3 text-xl font-bold">Household insights</h3>
        <p className="text-xs text-muted-foreground">Maple Street · Fictional sample home</p>
      </header>
      {kind === "forecast" && <>
        <SampleList title="Will run out within a week" rows={[["Oat milk", "~3 days"], ["Eggs", "~5 days"]]} />
        <SampleList title="Your staples (most used, 30 days)" rows={[["Eggs", "30 used · 7/week"], ["Oat milk", "20 used · 4.7/week"], ["Rice", "6 used · 1.4/week"]]} />
        <SampleList title="How often you restock" rows={[["Oat milk", "every ~7 days"], ["Eggs", "every ~14 days"]]} />
      </>}
      {kind === "audit" && <>
        <SampleList title="Expiring in the next 7 days" rows={[["Yoghurt", "13 Oct"], ["Spinach", "15 Oct"]]} />
        <SampleList title="Sitting untouched for 60+ days" rows={[["Chickpeas", "3 left"], ["Coconut milk", "2 left"]]} />
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-2xl font-bold">2</p><p className="text-xs text-muted-foreground">Spoiled on shelf</p></div>
        <p className="text-xs leading-relaxed text-muted-foreground">Counts stock recorded on its expiry date, not confirmed discarded food.</p>
      </>}
      {kind === "flow" && <>
        <div className="grid grid-cols-2 gap-2">{[["Used, 30 days", "56"], ["Added, 30 days", "64"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-3"><p className="text-xl font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>)}</div>
        <section className="rounded-2xl border border-border bg-card p-4">
          <h4 className="text-sm font-bold">In and out, last 8 weeks</h4>
          <p className="mt-2 flex gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Added</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" />Used</span></p>
          <div className="mt-5 flex h-36 items-end gap-2" role="img" aria-label="Fictional eight-week stock flow">
            {[[12, 8], [8, 10], [16, 12], [10, 9], [18, 15], [12, 13], [20, 14], [14, 14]].map(([added = 0, used = 0], i) => <div key={i} className="flex h-full flex-1 items-end gap-1"><div className="flex-1 rounded-t bg-primary" style={{ height: `${added * 5}%` }} /><div className="flex-1 rounded-t bg-muted-foreground" style={{ height: `${used * 5}%` }} /></div>)}
          </div>
          <p className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>18 Aug</span><span>This week</span></p>
        </section>
        <p className="text-xs leading-relaxed text-muted-foreground">Worked out from recorded restocks and consumption. All figures here are examples.</p>
      </>}
    </div>
  );
}

function SampleList({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="rounded-2xl border border-border bg-card p-4"><h4 className="mb-2 text-sm font-bold">{title}</h4><ul className="divide-y divide-border">{rows.map(([name, value]) => <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{name}</span><span className="shrink-0 text-xs font-semibold text-muted-foreground">{value}</span></li>)}</ul></section>;
}