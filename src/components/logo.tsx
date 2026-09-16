export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="14 14 236 260"
      role="img"
      aria-label="HomeStock"
      className="shrink-0"
    >
      <path
        d="M18 111 L118 24 L218 111 V236 H18 Z"
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M54 109 V220 M182 109 V220 M54 145 H182 M54 201 H182"
        fill="none"
        stroke="var(--color-success)"
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="var(--color-success)">
        <rect x="68" y="119" width="24" height="26" rx="3" />
        <path d="M106 120 h18 v25 h-18 z M110 113 h10 v9 h-10 z" />
        <rect x="140" y="115" width="28" height="30" rx="3" />
        <rect x="67" y="166" width="32" height="35" rx="3" />
        <path d="M114 171 h21 v30 h-21 z M118 162 h13 v11 h-13 z" />
        <rect x="149" y="176" width="20" height="25" rx="3" />
      </g>
    </svg>
  );
}

export function LogoWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-condensed text-2xl tracking-tight text-foreground ${className}`}
      style={{ letterSpacing: "-0.6px" }}
    >
      HomeStock
    </span>
  );
}
