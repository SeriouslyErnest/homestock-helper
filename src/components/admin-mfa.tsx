import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminIssueRecoveryCodes, adminUseRecoveryCode } from "@/lib/admin.functions";

type Props = {
  routeId: string;
  enrolled: boolean;
  onVerified: () => void;
};

const boxClass =
  "mx-auto w-full max-w-md rounded-3xl border border-border bg-card p-6 text-left shadow-sm";
const inputClass =
  "h-12 w-full rounded-2xl border border-border bg-background px-4 text-center text-lg tracking-[0.4em]";
const buttonClass =
  "h-12 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50";

/**
 * The console is unusable until this screen is cleared. First visit sets up an
 * authenticator app; later visits ask for the current six-digit code. A saved
 * recovery code is the way back in when the phone is gone.
 */
export function AdminMfaGate({ routeId, enrolled, onVerified }: Props) {
  const [mode, setMode] = useState<"code" | "recovery">("code");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Setting up: prepare a fresh authenticator entry and show the QR code.
  useEffect(() => {
    if (enrolled) return;
    let cancelled = false;
    void (async () => {
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `HomeStock console ${Date.now()}`,
        issuer: "HomeStock",
      });
      if (cancelled) return;
      if (error || !data) {
        toast.error("Could not start the setup. Reload the page and try again.");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
    return () => {
      cancelled = true;
    };
  }, [enrolled]);

  // Signing in again: find the authenticator that is already set up.
  useEffect(() => {
    if (!enrolled) return;
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.all ?? []).find(
        (f) => f.factor_type === "totp" && f.status === "verified",
      );
      setFactorId(verified?.id ?? null);
    })();
  }, [enrolled]);

  async function submitCode() {
    if (!factorId || code.replace(/\D/g, "").length !== 6) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.replace(/\D/g, ""),
      });
      if (error) {
        toast.error("That code did not match. Check your authenticator and try again.");
        return;
      }
      if (!enrolled) {
        // Brand new authenticator: hand over a set of backup codes right away.
        const { codes } = await adminIssueRecoveryCodes({ data: { routeId } });
        setRecoveryCodes(codes);
        return;
      }
      onVerified();
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  async function submitRecovery() {
    setBusy(true);
    try {
      await adminUseRecoveryCode({ data: { routeId, code } });
      toast.success("Recovery code accepted. Set up your authenticator again.");
      setCode("");
      setMode("code");
      onVerified();
    } catch (e) {
      toast.error((e as Error).message || "That recovery code is not valid.");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="grid min-h-dvh place-items-center px-5 py-10">
        <div className={boxClass}>
          <h1 className="text-lg font-semibold">Save your recovery codes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Each code works once, and only to set up a new authenticator if you lose your phone.
            They are shown this one time.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-4 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-brand underline"
            onClick={() => {
              void navigator.clipboard.writeText(recoveryCodes.join("\n"));
              toast.success("Copied");
            }}
          >
            Copy all
          </button>
          <button type="button" className={`${buttonClass} mt-4`} onClick={onVerified}>
            I have saved them
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className={boxClass}>
        <h1 className="text-lg font-semibold">
          {mode === "recovery"
            ? "Use a recovery code"
            : enrolled
              ? "Enter your six-digit code"
              : "Set up your authenticator"}
        </h1>

        {mode === "code" && !enrolled && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Scan this with your authenticator app, then type the six-digit code it shows.
            </p>
            {qr ? (
              <img
                src={qr}
                alt="Setup code for your authenticator app"
                className="mx-auto mt-4 h-48 w-48 rounded-2xl bg-white p-2"
              />
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Preparing…</p>
            )}
            {secret && (
              <p className="mt-3 break-all text-center font-mono text-xs text-muted-foreground">
                {secret}
              </p>
            )}
          </>
        )}

        {mode === "code" && enrolled && (
          <p className="mt-2 text-sm text-muted-foreground">
            Open your authenticator app and type the current code for HomeStock.
          </p>
        )}

        {mode === "recovery" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Enter one of the codes you saved. It removes the old authenticator so you can set up a
            new one.
          </p>
        )}

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={mode === "code" ? "numeric" : "text"}
          autoComplete="one-time-code"
          maxLength={mode === "code" ? 6 : 16}
          placeholder={mode === "code" ? "000000" : "abcde-fghij"}
          aria-label={mode === "code" ? "Six-digit code" : "Recovery code"}
          className={`${inputClass} mt-4`}
        />

        <button
          type="button"
          disabled={busy || (mode === "code" && !factorId)}
          onClick={() => void (mode === "code" ? submitCode() : submitRecovery())}
          className={`${buttonClass} mt-3`}
        >
          {busy ? "Checking…" : "Continue"}
        </button>

        {enrolled && (
          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground underline"
            onClick={() => {
              setMode(mode === "code" ? "recovery" : "code");
              setCode("");
            }}
          >
            {mode === "code" ? "I lost my authenticator" : "Back to the six-digit code"}
          </button>
        )}
      </div>
    </div>
  );
}
