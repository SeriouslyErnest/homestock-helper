import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

/** ISO yyyy-mm-dd -> DD/MM/YYYY (display). */
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Strict calendar check; returns ISO string or null. Never "rolls" dates. */
export function parseDisplayDate(text: string): string | null {
  const t = text.trim();
  const m =
    /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(t) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!m) return null;
  const d = m[1] ?? "", mo = m[2] ?? "", y = m[3] ?? "";
  const day = Number(d), month = Number(mo), year = Number(y);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day)
    return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Auto-insert slashes while typing digits only (only when growing). */
function autoFormat(next: string, prev: string): string {
  if (next.length < prev.length) return next; // deleting: leave alone
  if (!/^[\d/]*$/.test(next)) return next;
  const digits = next.replace(/\D/g, "").slice(0, 8);
  // User typed their own slashes (e.g. 1/2/2027): don't fight them.
  if (next.includes("/") && !/^\d{2}\/(\d{0,2}\/?)?\d{0,4}$/.test(next)) return next;
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += "/" + digits.slice(2, 4);
  if (digits.length > 4) out += "/" + digits.slice(4, 8);
  if (digits.length === 2 || digits.length === 4) out += "/";
  return out;
}

interface Props {
  id?: string;
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (iso: string) => void;
  className?: string;
  "aria-label"?: string;
}

/**
 * DD/MM/YYYY date entry: type it or pick from the calendar. Emits ISO
 * yyyy-mm-dd only for valid calendar dates; "" when cleared.
 */
export function DateField({ id, value, onChange, className, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errId = `${inputId}-err`;
  const [text, setText] = useState(isoToDisplay(value));
  const [error, setError] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // External changes (quick chips, calendar) update the text.
  useEffect(() => {
    if (parseDisplayDate(text) !== value) {
      setText(isoToDisplay(value));
      setError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(t: string) {
    if (t.trim() === "") {
      setError(false);
      if (value !== "") onChange("");
      return;
    }
    const iso = parseDisplayDate(t);
    if (iso) {
      setError(false);
      setText(isoToDisplay(iso));
      if (iso !== value) onChange(iso);
    } else {
      setError(true);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/YYYY"
          maxLength={10}
          value={text}
          aria-label={rest["aria-label"]}
          aria-invalid={error || undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => {
            const t = autoFormat(e.target.value, text);
            setText(t);
            const iso = parseDisplayDate(t);
            if (iso) {
              setError(false);
              if (iso !== value) onChange(iso);
            } else if (t.trim() === "") {
              setError(false);
              if (value !== "") onChange("");
            } else if (value !== "") {
              // Never keep a stale date while the text is invalid/incomplete.
              onChange("");
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          className={`${className ?? ""} flex-1`}
        />
        <div className="relative">
          <button
            type="button"
            aria-label="Pick a date from the calendar"
            onClick={() => {
              const el = pickerRef.current;
              if (!el) return;
              if (typeof el.showPicker === "function") {
                try {
                  el.showPicker();
                  return;
                } catch {
                  /* fall through */
                }
              }
              el.click();
            }}
            className="flex h-full min-h-11 items-center justify-center rounded-md border border-input bg-background px-3 text-foreground hover:bg-muted"
          >
            <CalendarDays className="h-5 w-5" aria-hidden />
          </button>
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </div>
      </div>
      {error && (
        <p id={errId} role="alert" className="mt-1 text-xs text-destructive">
          Enter a valid date in DD/MM/YYYY format.
        </p>
      )}
    </div>
  );
}
