import { Sparkles } from "lucide-react";

/** Small mark shown next to a home that has Pro switched on. */
export function ProBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary-foreground"
      aria-label="Pro home"
      title="Pro home"
    >
      <Sparkles size={11} aria-hidden /> PRO
    </span>
  );
}
