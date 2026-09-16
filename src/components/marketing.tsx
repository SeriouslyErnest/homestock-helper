import { useEffect, useRef, useState, type ReactNode } from "react";

/** Gentle fade-and-rise when a section scrolls into view. Skipped for reduced motion. */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-32 px-5 py-14 sm:px-8 md:py-20 ${className}`}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

export function SectionHeading({
  title,
  intro,
  centered = true,
}: {
  title: string;
  intro?: string;
  centered?: boolean;
}) {
  return (
    <header className={centered ? "text-center" : ""}>
      <h2 className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {intro && (
        <p
          className={`mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base ${
            centered ? "mx-auto" : ""
          }`}
        >
          {intro}
        </p>
      )}
    </header>
  );
}

export function FeatureCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-border bg-card p-6 transition-shadow duration-300 hover:shadow-lg">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </article>
  );
}

export function PrincipleCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 transition-shadow duration-300 hover:shadow-md">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </article>
  );
}

export function HowItWorksStep({
  step,
  title,
  caption,
  children,
  mockup,
  flip = false,
}: {
  step: number;
  title: string;
  caption: string;
  children: ReactNode;
  mockup: ReactNode;
  flip?: boolean;
}) {
  return (
    <Reveal className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div className={flip ? "md:order-2" : ""}>
        <span className="inline-grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-extrabold text-primary-foreground">
          {step}
        </span>
        <h3 className="mt-3 text-xl font-bold sm:text-2xl">{title}</h3>
        <div className="mt-2 max-w-prose space-y-3 text-[15px] leading-relaxed text-muted-foreground">
          {children}
        </div>
        <p className="mt-4 text-sm font-semibold text-brand">{caption}</p>
      </div>
      <div className={flip ? "md:order-1" : ""}>{mockup}</div>
    </Reveal>
  );
}

/** A phone-shaped frame used to present the app mockups. Decorative. */
export function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="mx-auto w-full max-w-[280px]">
      <div
        role="img"
        aria-label={label}
        className="rounded-[2rem] border border-border bg-background p-3 shadow-xl"
      >
        <div className="rounded-[1.4rem] bg-surface-2 p-3">{children}</div>
      </div>
    </figure>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  );
}
