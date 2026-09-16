import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Check, Gauge, ShoppingBasket } from "lucide-react";
import { LogoMark, LogoWordmark } from "@/components/logo";
import {
  FeatureCard,
  HowItWorksStep,
  PrincipleCard,
  Reveal,
  Section,
  SectionHeading,
  Tag,
} from "@/components/marketing";
import {
  ConsumeMock,
  HouseholdMock,
  InventoryMock,
  ListVsCardMock,
  RestockMock,
  RunningLowMock,
  ShoppingMock,
} from "@/components/marketing-mocks";

const TITLE = "About HomeStock — know what you have before you buy another one";
const DESCRIPTION =
  "HomeStock is a simple shared household inventory app: see what's at home, what's running low and what someone asked you to buy.";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://homestock-helper.lovable.app/about" },
      { property: "og:site_name", content: "HomeStock" },
    ],
    links: [{ rel: "canonical", href: "https://homestock-helper.lovable.app/about" }],
  }),
  component: AboutPage,
});

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0";
const secondaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border border-border bg-card px-6 py-3.5 font-semibold transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0";

function AboutPage() {
  return (
    <div className="min-h-dvh scroll-smooth bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="HomeStock home">
            <LogoMark size={30} />
            <LogoWordmark />
          </Link>
          <Link
            to="/auth"
            className="inline-flex min-h-11 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Open HomeStock
          </Link>
        </div>
      </header>

      <main>
        {/* HERO */}
        <Section className="pt-10">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
            <Reveal>
              <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl md:text-5xl">
                Know what you have, wherever you are.
              </h1>
              <div className="mt-4 max-w-prose space-y-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                <p>
                  HomeStock is a simple shared household inventory app that helps you keep track of
                  everyday groceries and household supplies.
                </p>
                <p>
                  See what is already at home, what is running low, and what someone has asked you
                  to buy — without needing to stand in front of the cupboard.
                </p>
              </div>
              <p className="mt-5 border-l-2 border-brand pl-4 text-lg font-semibold text-balance">
                Your cupboard, when you're not standing in front of it.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link to="/auth" className={primaryBtn}>
                  Start using HomeStock
                </Link>
                <a href="#how-it-works" className={secondaryBtn}>
                  See how it works
                </a>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <InventoryMock />
            </Reveal>
          </div>
        </Section>

        {/* WHAT IS HOMESTOCK */}
        <Section className="bg-surface-2">
          <Reveal>
            <SectionHeading
              title="What is HomeStock?"
              intro="HomeStock gives everyone in your household one shared view of the things you keep at home."
            />
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Reveal>
              <FeatureCard icon={<Boxes size={22} />} title="What do we have?">
                See the products currently at home and how many are left.
              </FeatureCard>
            </Reveal>
            <Reveal delay={90}>
              <FeatureCard icon={<Gauge size={22} />} title="What are we running low on?">
                Set the amount you normally want to keep and HomeStock shows when stock falls below
                that level.
              </FeatureCard>
            </Reveal>
            <Reveal delay={180}>
              <FeatureCard icon={<ShoppingBasket size={22} />} title="What should we buy?">
                See low-stock products alongside shopping requests from other household members.
              </FeatureCard>
            </Reveal>
          </div>
        </Section>

        {/* HOW IT WORKS */}
        <Section id="how-it-works">
          <Reveal>
            <SectionHeading title="How does it work?" />
          </Reveal>
          <div className="mt-10 grid gap-14 md:gap-20">
            <HowItWorksStep
              step={1}
              title="Add what you buy"
              caption="Scan. Scan. Scan. Done."
              mockup={<RestockMock />}
              flip
            >
              <p>When you come home with groceries, open Restock and scan the product barcodes.</p>
              <p>
                Keep scanning until you are finished, adjust quantities if needed, and add
                everything to your household inventory at once.
              </p>
              <p>
                You can optionally record where something is stored or when it expires, but these
                details are never required.
              </p>
            </HowItWorksStep>

            <HowItWorksStep
              step={2}
              title="Update items as you use them"
              caption="One tap to keep your inventory useful."
              mockup={<ConsumeMock />}
            >
              <p>When you finish or use an item, open Consume.</p>
              <p>
                Scan the barcode, search for the product, or select something you recently used,
                then reduce the quantity.
              </p>
              <p>
                For everyday updates, HomeStock uses quick actions rather than forms and
                confirmation screens.
              </p>
            </HowItWorksStep>

            <HowItWorksStep
              step={3}
              title="Check before you buy"
              caption="Check from the shop, not from the cupboard."
              mockup={<InventoryMock />}
              flip
            >
              <p>Before buying something, open HomeStock and search your household inventory.</p>
              <p>
                You can also scan a product while you are at the shop to check whether you already
                have it at home.
              </p>
              <p>This helps reduce duplicate purchases and unnecessary clutter.</p>
            </HowItWorksStep>

            <HowItWorksStep
              step={4}
              title="Know what needs restocking"
              caption="No list-keeping for the staples."
              mockup={<RunningLowMock />}
            >
              <p>For products you always want around, you can set a desired quantity.</p>
              <div className="rounded-2xl border border-border bg-card p-4 text-foreground not-prose">
                <strong className="block text-sm">Milk</strong>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-[10px] font-bold tracking-wide uppercase text-muted-foreground">
                      Have
                    </dt>
                    <dd className="text-xl font-extrabold">1</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold tracking-wide uppercase text-muted-foreground">
                      Desired
                    </dt>
                    <dd className="text-xl font-extrabold">3</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold tracking-wide uppercase text-muted-foreground">
                      Need
                    </dt>
                    <dd className="text-xl font-extrabold text-warning">2</dd>
                  </div>
                </dl>
              </div>
              <p>
                When stock falls below your desired level, HomeStock automatically shows it as
                Running Low.
              </p>
              <p>There is no need to manually add every staple to a shopping list each time.</p>
            </HowItWorksStep>
          </div>
        </Section>

        {/* SHOPPING REQUESTS */}
        <Section className="bg-surface-2">
          <Reveal>
            <SectionHeading
              title="A shared shopping list for the household"
              intro="Sometimes you need something that is not simply “running low”. Anyone in the household can create a buy request."
            />
          </Reveal>
          <div className="mt-8 grid items-center gap-8 md:grid-cols-2">
            <Reveal>
              <ShoppingMock />
            </Reveal>
            <Reveal delay={90} className="max-w-prose">
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Requests can be generic or linked to a specific product. Add simple instructions so
                the person shopping knows what matters without turning every request into a detailed
                form.
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {[
                  "Optional",
                  "Only if on sale",
                  "Any brand",
                  "Call if unavailable",
                  "Read notes",
                ].map((t) => (
                  <li key={t}>
                    <Tag>{t}</Tag>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
                Shopping requests stay deliberately simple. The person shopping checks a request off
                manually after buying it. HomeStock does not force every request to match a specific
                barcode or product.
              </p>
            </Reveal>
          </div>
        </Section>

        {/* SHARED HOUSEHOLDS */}
        <Section>
          <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
            <Reveal className="max-w-prose">
              <SectionHeading title="Built for shared households" centered={false} />
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  HomeStock is designed for couples, families, housemates and anyone who shares
                  household supplies.
                </p>
                <p>
                  Each person has their own account, while inventory belongs to the household.
                  Everyone sees the same stock levels while keeping their own interface preferences.
                </p>
                <p>Users can also belong to more than one household, such as:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Your own home</li>
                  <li>Your parents' home</li>
                  <li>A holiday home</li>
                </ul>
              </div>
              <p className="mt-4 text-sm font-semibold text-brand">
                Household switching stays out of the way until you need it.
              </p>
            </Reveal>
            <Reveal delay={90}>
              <HouseholdMock />
            </Reveal>
          </div>
        </Section>

        {/* FAST FIRST */}
        <Section className="bg-surface-2">
          <Reveal>
            <SectionHeading
              title="Fast first. Detailed when useful."
              intro="HomeStock is deliberately not designed to make you meticulously catalogue your pantry."
            />
          </Reveal>
          <Reveal delay={90}>
            <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-[3fr_2fr] sm:items-stretch">
              <div className="rounded-3xl border-2 border-brand bg-card p-6 text-center">
                <span className="text-xs font-bold tracking-wide uppercase text-brand">Always</span>
                <p className="mt-2 text-2xl font-extrabold text-balance sm:text-3xl">
                  Product + Quantity
                </p>
              </div>
              <div className="rounded-3xl border border-dashed border-border p-6 text-center">
                <span className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                  Optional
                </span>
                <p className="mt-2 text-base font-semibold text-muted-foreground">Location</p>
                <p className="text-base font-semibold text-muted-foreground">Expiry</p>
              </div>
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-[15px] leading-relaxed text-muted-foreground">
              The most important information is simply what the product is and how many you have.
              Storage location and expiry dates can be added when they are useful, but they should
              never get in the way of quickly updating stock.
            </p>
          </Reveal>
        </Section>

        {/* VIEW PREFERENCES */}
        <Section>
          <Reveal>
            <SectionHeading
              title="See things your way"
              intro="Different people organise information differently. Where useful, HomeStock supports both List and Card views."
            />
          </Reveal>
          <Reveal delay={90} className="mt-8">
            <ListVsCardMock />
          </Reveal>
          <Reveal delay={150}>
            <div className="mx-auto mt-8 max-w-md rounded-3xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Your preference is remembered separately for each part of the app.
              </p>
              <dl className="mt-3 grid gap-2 text-sm">
                {[
                  ["Inventory", "List"],
                  ["Restock basket", "Cards"],
                  ["Consume", "Cards"],
                  ["Shopping", "List"],
                ].map(([area, mode]) => (
                  <div key={area} className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{area}</dt>
                    <dd className="font-semibold">{mode}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-[15px] text-muted-foreground">
              HomeStock remembers your choices, so you do not have to keep configuring the
              interface.
            </p>
          </Reveal>
        </Section>

        {/* PHILOSOPHY */}
        <Section className="bg-surface-2">
          <Reveal>
            <SectionHeading title="Designed for real household habits" />
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Reveal>
              <PrincipleCard title="Capture first, enrich later">
                Adding an item should be quick. Location and expiry are optional.
              </PrincipleCard>
            </Reveal>
            <Reveal delay={60}>
              <PrincipleCard title="Remember instead of asking again">
                HomeStock remembers your household and interface preferences.
              </PrincipleCard>
            </Reveal>
            <Reveal delay={120}>
              <PrincipleCard title="Undo instead of confirmation">
                Routine actions should be quick and reversible.
              </PrincipleCard>
            </Reveal>
            <Reveal delay={180}>
              <PrincipleCard title="Useful beats perfect">
                An inventory that is approximately correct and regularly maintained is more useful
                than a detailed system nobody wants to update.
              </PrincipleCard>
            </Reveal>
          </div>
        </Section>

        {/* BENEFITS */}
        <Section>
          <Reveal>
            <SectionHeading title="Why HomeStock?" />
          </Reveal>
          <Reveal delay={90}>
            <ul className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
              {[
                "Avoid buying things you already have",
                "Reduce household clutter",
                "Notice staples that are running low",
                "Coordinate shopping between household members",
                "Check inventory while away from home",
                "Keep optional track of where items are stored",
                "Keep optional track of expiry dates",
                "Spend less time messaging someone at home to ask, “Do we still have this?”",
              ].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-[15px]"
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                    <Check size={14} aria-hidden="true" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
        </Section>

        {/* START SMALL */}
        <Section className="bg-brand-soft">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">
              Start small
            </h2>
            <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              <p>
                You do not need to catalogue your entire home before HomeStock becomes useful.
                Create a household and start with the products that matter most.
              </p>
              <p>
                Scan items as you buy them, update them as you use them, and let your household
                inventory build naturally over time.
              </p>
            </div>
            <p className="mt-5 text-xl font-extrabold text-balance">Start scanning what matters.</p>
            <Link to="/auth" className={`${primaryBtn} mt-7 w-full sm:w-auto`}>
              Start using HomeStock
            </Link>
          </Reveal>
        </Section>

        {/* FINAL BRAND MESSAGE */}
        <Section className="py-16 text-center md:py-24">
          <Reveal>
            <div className="flex items-center justify-center gap-3">
              <LogoMark size={40} />
              <LogoWordmark className="text-3xl" />
            </div>
            <p className="mx-auto mt-4 max-w-xl text-lg text-balance text-muted-foreground">
              Know what you have before you buy another one.
            </p>
          </Reveal>
        </Section>
      </main>

      <footer className="border-t border-border px-5 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
            <Link to="/about">About</Link>
            {/* Placeholder links — replace once the pages exist. */}
            <a href="#" aria-disabled="true" className="text-muted-foreground">
              Privacy Policy
            </a>
            <a href="#" aria-disabled="true" className="text-muted-foreground">
              Terms
            </a>
            <a href="#" aria-disabled="true" className="text-muted-foreground">
              Support / Contact
            </a>
            <Link to="/auth">Open HomeStock</Link>
          </nav>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Product names, brands and images come from{" "}
            <a
              href="https://world.openfoodfacts.org"
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              Open Food Facts
            </a>
            , available under the{" "}
            <a
              href="https://opendatacommons.org/licenses/odbl/1-0/"
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              Open Database License
            </a>
            ; individual product images are published under{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/3.0/"
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              CC BY-SA
            </a>
            . HomeStock only reads this data.
          </p>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} HomeStock</p>
        </div>
      </footer>
    </div>
  );
}
