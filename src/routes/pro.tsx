import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowLeft, ChartColumn, PackageSearch, TrendingUp } from "lucide-react";
import { LogoMark, LogoWordmark } from "@/components/logo";
import { ProBadge } from "@/components/pro-badge";
import { ProSample } from "@/components/pro-samples";
import { Button } from "@/components/ui/button";

const title = "HomeStock Pro — Household insights & consumption forecasts";
const description = "Explore HomeStock Pro with fictional sample screenshots: run-out forecasts, pantry checks, staples and weekly stock flow for your whole home.";

export const Route = createFileRoute("/pro")({
  validateSearch: (search: Record<string, unknown>) => ({ sample: search.sample === true || search.sample === "true" }),
  head: () => ({ meta: [
    { title }, { name: "description", content: description },
    { property: "og:title", content: title }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ProPage,
});

const features = [
  { kind: "forecast" as const, icon: TrendingUp, title: "Plan your next shop", intro: "See what your home reaches for, and what might run out next.", bullets: ["Run-out estimates for the next week, based on consumption recorded over 30 days.", "Most-used staples with weekly consumption rates.", "Average time between restocks, once there is enough history."] },
  { kind: "audit" as const, icon: PackageSearch, title: "Give forgotten stock a second look", intro: "Make the next thing you use something you already have.", bullets: ["Dated stock expiring in the next 7 days, including overdue items.", "Products left untouched for 60 days or more.", "Stock still recorded on its expiry date, counted from Pro daily records — not a confirmed food-waste measure."] },
  { kind: "flow" as const, icon: ChartColumn, title: "Find your household’s rhythm", intro: "Compare what comes in with what gets used.", bullets: ["Units added and used over the last 30 days.", "An eight-week view of restocking and consumption.", "Shared insights for every member when an owner has Pro."] },
];

function ProPage() {
  return <div className="min-h-dvh bg-background">
    <header className="border-b border-border"><nav aria-label="Pro navigation" className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
      <Link to="/" aria-label="HomeStock home" className="flex items-center gap-2"><LogoMark size={30} /><LogoWordmark /></Link>
      <Button variant="ghost" asChild><Link to="/about"><ArrowLeft />User guide</Link></Button>
    </nav></header>
    <main className="mx-auto max-w-5xl px-5">
      <section className="border-b border-border py-10 sm:py-14">
        <ProBadge /><h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">HomeStock Pro</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">Turn your household’s stock history into a better next shop. Spot forgotten supplies, understand what gets used, and plan ahead.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link to="/insights">Household insights<ArrowRight /></Link></Button><Button variant="outline" asChild><Link to="/more">Have a trial code?</Link></Button></div>
        <p className="mt-4 text-sm text-muted-foreground">One Pro owner unlocks insights for everyone in that home. Payments aren’t connected yet; access is available through admin grants, trials and promo codes.</p>
      </section>
      <p className="pt-7 text-xs font-semibold text-muted-foreground">PREVIEW · Fictional sample home and figures, not your household’s data.</p>
      {features.map(({ kind, icon: Icon, title: heading, intro, bullets }, index) => <section key={kind} className="grid items-center gap-8 border-b border-border py-9 md:grid-cols-2 md:gap-12">
        <div className={index % 2 ? "md:order-2" : ""}><Icon className="mb-4 text-brand" size={28} /><h2 className="text-2xl font-bold">{heading}</h2><p className="mt-3 text-muted-foreground">{intro}</p><ul className="mt-5 space-y-3 text-sm leading-relaxed">{bullets.map(bullet => <li key={bullet} className="flex gap-3"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /><span>{bullet}</span></li>)}</ul></div>
        <figure className={`mx-auto w-full max-w-[390px] overflow-hidden rounded-lg border border-border shadow-lg ${index % 2 ? "md:order-1" : ""}`}><ProSample kind={kind} /><figcaption className="border-t border-border bg-card px-4 py-3 text-xs text-muted-foreground">Sample: {heading}</figcaption></figure>
      </section>)}
      <section className="py-9"><h2 className="text-xl font-bold">Your home, your recorded history</h2><p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">Ordinary inventory history stays unchanged. Additional daily stock records are collected only while the home is Pro. Forecasts are estimates from recorded use, not guarantees. New homes need some history before patterns appear.</p><p className="mt-3 text-sm text-muted-foreground">To check your home’s access, open More and look for the PRO badge beside Household. Open Household insights there. An eligible trial or promo code can be entered under “Have a code?”.</p></section>
    </main>
    <footer className="border-t border-border px-5 py-5 text-center text-xs text-muted-foreground">HomeStock Pro · <Link to="/about" className="underline">Read the full user guide</Link></footer>
  </div>;
}