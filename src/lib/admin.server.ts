// Server-only helpers for the admin console. Never import from components.
import { createHmac, timingSafeEqual } from "crypto";

export type AdminRole = "SUPER_ADMIN" | "BILLING_ADMIN" | "SUPPORT_ADMIN" | "READ_ONLY_ADMIN";

/**
 * A one-way, salted fingerprint of an email address. The plain address is
 * never written to the application database, so neither the code nor a
 * database dump reveals who signed up — an exact address can still be looked
 * up because the same input always produces the same fingerprint.
 */
export function hashEmail(email: string): string {
  const salt = process.env["ADMIN_EMAIL_SALT"];
  if (!salt) throw new Error("ADMIN_EMAIL_SALT is not configured");
  return createHmac("sha256", salt).update(email.trim().toLowerCase()).digest("hex");
}

/** "ernest.see@gmail.com" -> "er…ee@gmail.com" — enough to recognise, not enough to contact. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return "hidden";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 4) return `${local[0] ?? ""}…${local.slice(-1)}${domain}`;
  return `${local.slice(0, 2)}…${local.slice(-2)}${domain}`;
}

/** Constant-time comparison for the hidden console path. */
export function matchesConsoleRoute(candidate: string): boolean {
  const expected = process.env["ADMIN_CONSOLE_ROUTE_ID"];
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Throws unless the caller is an allow-listed admin; returns their role. */
export async function requireAdmin(userId: string, allowed?: AdminRole[]): Promise<AdminRole> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = data?.role as AdminRole | undefined;
  if (!role) throw new Error("Forbidden");
  if (allowed && !allowed.includes(role)) throw new Error("Forbidden");
  return role;
}

export async function writeAudit(entry: {
  adminUserId: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: entry.adminUserId,
    action_type: entry.actionType,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    before_json: (entry.beforeJson ?? null) as never,
    after_json: (entry.afterJson ?? null) as never,
    reason: entry.reason ?? null,
  });
}
