import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminRole = "SUPER_ADMIN" | "BILLING_ADMIN" | "SUPPORT_ADMIN" | "READ_ONLY_ADMIN";

export type AdminAccount = {
  userId: string;
  emailMasked: string;
  displayName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  tier: string;
};

export type AdminGrant = {
  id: string;
  tier: string;
  source: string;
  promoCode: string | null;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
  reason: string | null;
  createdAt: string;
};

export type AdminPromotion = {
  code: string;
  campaignName: string;
  tier: string;
  durationDays: number;
  startsAt: string;
  endsAt: string | null;
  maxRedemptions: number | null;
  perAccountLimit: number;
  status: string;
  redemptions: number;
};

export type AdminAuditEntry = {
  id: string;
  adminUserId: string;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
};

/** Keeps the pseudonymous directory current. Called by the app after sign-in. */
export const syncAccountDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hashEmail, maskEmail } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = userData?.user?.email;
    if (!email) return { ok: false };
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();
    const emailHash = hashEmail(email);
    await supabaseAdmin.from("account_directory").upsert(
      {
        user_id: context.userId,
        email_hash: emailHash,
        email_masked: maskEmail(email),
        display_name: profile?.display_name ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    // Closes the loop on an invitation once that person actually signs in.
    await supabaseAdmin
      .from("signup_invites")
      .update({ accepted_at: new Date().toISOString(), user_id: context.userId })
      .eq("email_hash", emailHash)
      .is("accepted_at", null);
    return { ok: true };
  });

/** Validates the hidden path and the caller's admin allow-listing in one step. */
export const adminSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }) => {
    const { matchesConsoleRoute, requireAdmin } = await import("./admin.server");
    if (!matchesConsoleRoute(data.routeId)) throw new Error("Not found");
    const role = await requireAdmin(context.userId);
    return { role: role as AdminRole };
  });

async function guard(routeId: string, userId: string, allowed?: AdminRole[]) {
  const { matchesConsoleRoute, requireAdmin } = await import("./admin.server");
  if (!matchesConsoleRoute(routeId)) throw new Error("Not found");
  return requireAdmin(userId, allowed);
}

export const adminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const soon = new Date(Date.now() + 7 * 86400000).toISOString();
    const [accounts, households, grants, expiring, promos, redemptions] = await Promise.all([
      supabaseAdmin.from("account_directory").select("user_id", { count: "exact", head: true }),
      supabaseAdmin.from("households").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("entitlement_grants")
        .select("id", { count: "exact", head: true })
        .is("revoked_at", null)
        .or(`ends_at.is.null,ends_at.gt.${nowIso}`),
      supabaseAdmin
        .from("entitlement_grants")
        .select("id", { count: "exact", head: true })
        .is("revoked_at", null)
        .gt("ends_at", nowIso)
        .lt("ends_at", soon),
      supabaseAdmin
        .from("promotions")
        .select("code", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin.from("promo_redemptions").select("id", { count: "exact", head: true }),
    ]);
    return {
      accounts: accounts.count ?? 0,
      households: households.count ?? 0,
      activeGrants: grants.count ?? 0,
      expiringSoon: expiring.count ?? 0,
      activePromotions: promos.count ?? 0,
      redemptions: redemptions.count ?? 0,
    };
  });

export const adminListAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; search?: string }) => input)
  .handler(async ({ data, context }): Promise<AdminAccount[]> => {
    await guard(data.routeId, context.userId);
    const { hashEmail } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("account_directory")
      .select("user_id, email_masked, display_name, first_seen_at, last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(50);

    const search = data.search?.trim();
    if (search) {
      if (search.includes("@")) {
        query = query.eq("email_hash", hashEmail(search));
      } else {
        query = query.ilike("display_name", `%${search}%`);
      }
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const results: AdminAccount[] = [];
    for (const row of rows ?? []) {
      const { data: tier } = await supabaseAdmin.rpc("effective_tier", { _user_id: row.user_id });
      results.push({
        userId: row.user_id,
        emailMasked: row.email_masked,
        displayName: row.display_name,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        tier: (tier as string | null) ?? "free",
      });
    }
    return results;
  });

export const adminAccountDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; userId: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [account, tier, grants, memberships] = await Promise.all([
      supabaseAdmin
        .from("account_directory")
        .select("user_id, email_masked, display_name, first_seen_at, last_seen_at")
        .eq("user_id", data.userId)
        .maybeSingle(),
      supabaseAdmin.rpc("effective_tier", { _user_id: data.userId }),
      supabaseAdmin
        .from("entitlement_grants")
        .select("*")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("household_members")
        .select("household_id, role, households(name)")
        .eq("user_id", data.userId),
    ]);

    return {
      account: account.data
        ? {
            userId: account.data.user_id,
            emailMasked: account.data.email_masked,
            displayName: account.data.display_name,
            firstSeenAt: account.data.first_seen_at,
            lastSeenAt: account.data.last_seen_at,
            tier: (tier.data as string | null) ?? "free",
          }
        : null,
      grants: (grants.data ?? []).map((g): AdminGrant => ({
        id: g.id,
        tier: g.tier,
        source: g.source,
        promoCode: g.promo_code,
        startsAt: g.starts_at,
        endsAt: g.ends_at,
        revokedAt: g.revoked_at,
        reason: g.reason,
        createdAt: g.created_at,
      })),
      households: (memberships.data ?? []).map((m) => ({
        id: m.household_id,
        role: m.role,
        name: (m.households as { name: string } | null)?.name ?? "—",
      })),
    };
  });

export const adminGrantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      routeId: string;
      userId: string;
      tier: string;
      source: "complimentary" | "trial";
      days: number | null;
      reason: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const role = await guard(data.routeId, context.userId, [
      "SUPER_ADMIN",
      "BILLING_ADMIN",
      "SUPPORT_ADMIN",
    ]);
    if (!data.reason.trim()) throw new Error("A reason is required");
    if (data.days === null && role !== "SUPER_ADMIN") {
      throw new Error("Only a super admin can grant access with no end date");
    }
    if (data.days !== null && (!Number.isInteger(data.days) || data.days < 1 || data.days > 3650)) {
      throw new Error("Length must be a whole number of days between 1 and 3650");
    }
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const endsAt =
      data.days === null ? null : new Date(Date.now() + data.days * 86400000).toISOString();
    const { data: grant, error } = await supabaseAdmin
      .from("entitlement_grants")
      .insert({
        user_id: data.userId,
        tier: data.tier,
        source: data.source,
        ends_at: endsAt,
        reason: data.reason.trim(),
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "grant.created",
      targetType: "account",
      targetId: data.userId,
      afterJson: grant,
      reason: data.reason.trim(),
    });
    return { ok: true };
  });

export const adminRevokeGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; grantId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN", "BILLING_ADMIN"]);
    if (!data.reason.trim()) throw new Error("A reason is required");
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("entitlement_grants")
      .select("*")
      .eq("id", data.grantId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("entitlement_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.grantId);
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "grant.revoked",
      targetType: "grant",
      targetId: data.grantId,
      beforeJson: before,
      reason: data.reason.trim(),
    });
    return { ok: true };
  });

export const adminListPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }): Promise<AdminPromotion[]> => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("promotions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const out: AdminPromotion[] = [];
    for (const p of rows ?? []) {
      const { count } = await supabaseAdmin
        .from("promo_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("code", p.code);
      out.push({
        code: p.code,
        campaignName: p.campaign_name,
        tier: p.tier,
        durationDays: p.duration_days,
        startsAt: p.starts_at,
        endsAt: p.ends_at,
        maxRedemptions: p.max_redemptions,
        perAccountLimit: p.per_account_limit,
        status: p.status,
        redemptions: count ?? 0,
      });
    }
    return out;
  });

export const adminCreatePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      routeId: string;
      code: string;
      campaignName: string;
      tier: string;
      durationDays: number;
      endsAt: string | null;
      maxRedemptions: number | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN", "BILLING_ADMIN"]);
    const code = data.code.trim().toUpperCase();
    if (code.length < 3) throw new Error("Code must be at least 3 characters");
    if (!data.campaignName.trim()) throw new Error("A campaign name is required");
    if (!Number.isInteger(data.durationDays) || data.durationDays < 1 || data.durationDays > 3650) {
      throw new Error("Length must be a whole number of days between 1 and 3650");
    }
    if (
      data.maxRedemptions !== null &&
      (!Number.isInteger(data.maxRedemptions) || data.maxRedemptions < 1)
    ) {
      throw new Error("Maximum redemptions must be a whole number of 1 or more");
    }
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("promotions").insert({
      code,
      campaign_name: data.campaignName.trim(),
      tier: data.tier,
      duration_days: data.durationDays,
      ends_at: data.endsAt,
      max_redemptions: data.maxRedemptions,
      created_by: context.userId,
    });
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "promotion.created",
      targetType: "promotion",
      targetId: code,
      afterJson: { ...data, routeId: undefined },
    });
    return { ok: true };
  });

export const adminSetPromotionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { routeId: string; code: string; status: "active" | "paused" | "expired" }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN", "BILLING_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("promotions")
      .update({ status: data.status })
      .eq("code", data.code);
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "promotion.status",
      targetType: "promotion",
      targetId: data.code,
      afterJson: { status: data.status },
    });
    return { ok: true };
  });

export const adminAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }): Promise<AdminAuditEntry[]> => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, admin_user_id, action_type, target_type, target_id, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      adminUserId: r.admin_user_id,
      actionType: r.action_type,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  });

export const adminPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("app_plans").select("*").order("tier");
    return rows ?? [];
  });

export const adminSetPlanEnforcement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; tier: string; enforced: boolean }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_plans")
      .update({ enforced: data.enforced })
      .eq("tier", data.tier);
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "plan.enforcement",
      targetType: "plan",
      targetId: data.tier,
      afterJson: { enforced: data.enforced },
    });
    return { ok: true };
  });

/** Change what a plan allows: homes owned, people per home, and line items. */
export const adminSetPlanLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      routeId: string;
      tier: string;
      maxOwnedHouseholds: number;
      maxMembers: number;
      maxItems: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN"]);
    const whole = (n: number, label: string) => {
      if (!Number.isInteger(n) || n < 1 || n > 1_000_000)
        throw new Error(`${label} must be a whole number between 1 and 1,000,000.`);
      return n;
    };
    const after = {
      max_owned_households: whole(data.maxOwnedHouseholds, "Homes owned"),
      max_members: whole(data.maxMembers, "People per home"),
      max_items: whole(data.maxItems, "Line items"),
      updated_at: new Date().toISOString(),
    };
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_plans").update(after).eq("tier", data.tier);
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "plan.limits",
      targetType: "plan",
      targetId: data.tier,
      afterJson: after,
    });
    return { ok: true };
  });

/**
 * Break-glass bootstrap: the very first operator claims the console by signing
 * in and visiting the secret address while no operators exist yet.
 */
export const adminClaimConsole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }) => {
    const { matchesConsoleRoute, writeAudit } = await import("./admin.server");
    if (!matchesConsoleRoute(data.routeId)) throw new Error("Not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("admin_users")
      .select("user_id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("This console already has an operator.");
    // bootstrap=true is guarded by a unique index, so only one claim can ever win,
    // even if two people hit this at the same moment.
    const { error } = await supabaseAdmin.from("admin_users").insert({
      user_id: context.userId,
      role: "SUPER_ADMIN",
      note: "First operator",
      bootstrap: true,
    });
    if (error) throw new Error("This console already has an operator.");
    await writeAudit({
      adminUserId: context.userId,
      actionType: "admin.claimed",
      targetType: "admin",
      targetId: context.userId,
      reason: "First operator claimed the console",
    });
    return { ok: true };
  });

/** True when no operator exists yet, so the claim button can be offered. */
export const adminConsoleUnclaimed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data }) => {
    const { matchesConsoleRoute } = await import("./admin.server");
    if (!matchesConsoleRoute(data.routeId)) return { unclaimed: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("admin_users")
      .select("user_id", { count: "exact", head: true });
    return { unclaimed: (count ?? 0) === 0 };
  });

export type AdminInvite = {
  id: string;
  emailMasked: string;
  createdAt: string;
  lastSentAt: string;
  acceptedAt: string | null;
};

/** Current state of the "anyone can sign up" switch, for the console. */
export const adminSignupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "signups_enabled")
      .maybeSingle();
    return { signupsEnabled: row?.value === false ? false : true };
  });

export const adminSetSignupsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key: "signups_enabled",
        value: data.enabled as never,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "signups.toggled",
      targetType: "setting",
      targetId: "signups_enabled",
      afterJson: { enabled: data.enabled },
    });
    return { ok: true };
  });

export const adminListInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }): Promise<AdminInvite[]> => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("signup_invites")
      .select("id, email_masked, created_at, last_sent_at, accepted_at")
      .order("last_sent_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      emailMasked: r.email_masked,
      createdAt: r.created_at,
      lastSentAt: r.last_sent_at,
      acceptedAt: r.accepted_at,
    }));
  });

/**
 * Emails a one-time sign-up link. The address itself is never stored in the
 * app's tables — only a salted fingerprint and a masked form for display.
 */
export const adminInviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; email: string; origin: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN", "SUPPORT_ADMIN"]);
    const email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
    if (!/^https?:\/\//.test(data.origin)) throw new Error("Invalid redirect address");

    const { hashEmail, maskEmail, writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${data.origin.replace(/\/+$/, "")}/inventory`,
    });
    if (error) {
      throw new Error(
        error.message.toLowerCase().includes("already")
          ? "That address already has an account."
          : error.message,
      );
    }

    const hash = hashEmail(email);
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("signup_invites").upsert(
      {
        email_hash: hash,
        email_masked: maskEmail(email),
        invited_by: context.userId,
        last_sent_at: nowIso,
      },
      { onConflict: "email_hash" },
    );
    await writeAudit({
      adminUserId: context.userId,
      actionType: "invite.sent",
      targetType: "invite",
      targetId: hash.slice(0, 12),
    });
    return { ok: true, emailMasked: maskEmail(email) };
  });

export type AdminCategory = { id: string; emoji: string };

/** The saved place list, or null when the app is still using its built-in one. */
export const adminGetCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }): Promise<{ categories: AdminCategory[] | null }> => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "categories")
      .maybeSingle();
    const list = row?.value as AdminCategory[] | undefined;
    return { categories: Array.isArray(list) && list.length > 0 ? list : null };
  });

/**
 * Save the place list. Renames move existing items onto the new label; a
 * removed place leaves its items on the old label (they still show under
 * "All items" in the app).
 */
export const adminSetCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      routeId: string;
      categories: AdminCategory[];
      renames: { from: string; to: string }[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.categories.length < 1 || data.categories.length > 16)
      throw new Error("Keep between 1 and 16 places.");
    const seen = new Set<string>();
    const clean = data.categories.map((c) => {
      const id = c.id.trim();
      const emoji = c.emoji.trim();
      if (id.length < 1 || id.length > 20) throw new Error("Place names must be 1–20 characters.");
      if (emoji.length < 1 || emoji.length > 8) throw new Error("Pick an emoji for every place.");
      const key = id.toLowerCase();
      if (seen.has(key)) throw new Error(`"${id}" appears twice.`);
      seen.add(key);
      return { id, emoji };
    });

    // A rename must move items from a place that actually existed before.
    const { data: row } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "categories")
      .maybeSingle();
    const before = (row?.value as AdminCategory[] | undefined) ?? [];
    const beforeIds = new Set(before.map((c) => c.id));
    const afterIds = new Set(clean.map((c) => c.id));
    const renames = data.renames.filter(
      (r) => beforeIds.has(r.from) && afterIds.has(r.to) && r.from !== r.to,
    );

    for (const r of renames) {
      const { error } = await supabaseAdmin
        .from("items")
        .update({ category: r.to })
        .eq("category", r.from);
      if (error) throw error;
    }

    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key: "categories",
        value: clean as never,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw error;

    await writeAudit({
      adminUserId: context.userId,
      actionType: "categories.updated",
      targetType: "setting",
      targetId: "categories",
      afterJson: { categories: clean, renamed: renames },
    });
    return { ok: true };
  });

export type AdminLimitRequest = {
  id: string;
  userId: string;
  kind: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
};

/**
 * People asking for a higher limit. Kept out of the app's own tables in plain
 * form: the contact address is read from the auth system at view time, so
 * nothing readable is ever stored alongside the request.
 */
export const adminLimitRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }): Promise<AdminLimitRequest[]> => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("limit_requests")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(200);
    const list = rows ?? [];
    return Promise.all(
      list.map(async (r) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", r.user_id)
          .maybeSingle();
        return {
          id: r.id,
          userId: r.user_id,
          kind: r.kind,
          email: u?.user?.email ?? null,
          displayName: p?.display_name ?? null,
          createdAt: r.created_at,
        };
      }),
    );
  });

/** Clears a handled request so the inbox stays empty when there's nothing to do. */
export const adminDismissLimitRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; id: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN", "BILLING_ADMIN", "SUPPORT_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("limit_requests").delete().eq("id", data.id);
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "limit_request.dismissed",
      targetType: "limit_request",
      targetId: data.id,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Shared catalogue reports
// ---------------------------------------------------------------------------

export type AdminProductReport = {
  barcode: string;
  name: string | null;
  reports: number;
  contributorId: string | null;
  contributorEmail: string | null;
  firstReportedAt: string;
};

export const adminProductReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }): Promise<AdminProductReport[]> => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("product_reports")
      .select("barcode, created_at")
      .order("created_at", { ascending: true })
      .limit(500);
    const grouped = new Map<string, { count: number; first: string }>();
    for (const r of rows ?? []) {
      const g = grouped.get(r.barcode);
      if (g) g.count += 1;
      else grouped.set(r.barcode, { count: 1, first: r.created_at });
    }
    return Promise.all(
      [...grouped.entries()].map(async ([barcode, g]) => {
        const { data: p } = await supabaseAdmin
          .from("products")
          .select("name, created_by")
          .eq("barcode", barcode)
          .maybeSingle();
        let email: string | null = null;
        if (p?.created_by) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.created_by);
          email = u?.user?.email ?? null;
        }
        return {
          barcode,
          name: p?.name ?? null,
          reports: g.count,
          contributorId: p?.created_by ?? null,
          contributorEmail: email,
          firstReportedAt: g.first,
        };
      }),
    );
  });

/** keep = name was fine, show it again; remove = forget it; ban = remove and ban whoever typed it. */
export const adminResolveProductReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { routeId: string; barcode: string; action: "keep" | "remove" | "ban" }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN", "SUPPORT_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("products")
      .select("name, created_by")
      .eq("barcode", data.barcode)
      .maybeSingle();
    if (data.action === "keep") {
      await supabaseAdmin.from("products").update({ hidden_at: null }).eq("barcode", data.barcode);
      await supabaseAdmin.from("product_reports").delete().eq("barcode", data.barcode);
    } else {
      // Deleting the product also clears its reports; the barcode can be named afresh.
      await supabaseAdmin.from("products").delete().eq("barcode", data.barcode);
      if (data.action === "ban" && p?.created_by) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(p.created_by, {
          ban_duration: "876000h",
        });
        if (error) throw error;
      }
    }
    await writeAudit({
      adminUserId: context.userId,
      actionType: `product_report.${data.action}`,
      targetType: "product",
      targetId: data.barcode,
      beforeJson: { name: p?.name ?? null, contributor: p?.created_by ?? null },
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Account approval
// ---------------------------------------------------------------------------

async function approvalEnabled(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "account_approval")
    .maybeSingle();
  const v = data?.value as { enabled?: boolean } | null;
  return v?.enabled === true;
}

/** Called by the app after sign-in. Registers a pending application when needed. */
export const myApprovalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: "approved" | "pending" | "rejected" }> => {
    if (!(await approvalEnabled())) return { status: "approved" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("account_approvals")
      .select("status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) {
      await supabaseAdmin
        .from("account_approvals")
        .upsert({ user_id: context.userId, status: "pending" }, { onConflict: "user_id", ignoreDuplicates: true });
      return { status: "pending" };
    }
    return { status: row.status as "approved" | "pending" | "rejected" };
  });

export const adminApprovalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId);
    return { enabled: await approvalEnabled() };
  });

export const adminSetApprovalEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Everyone already signed up stays in — approval only applies to newcomers.
    if (data.enabled) {
      const { error } = await supabaseAdmin.rpc("approve_existing_accounts" as never);
      if (error) throw error;
    }
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key: "account_approval",
        value: { enabled: data.enabled } as never,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: "account_approval.toggled",
      targetType: "setting",
      targetId: "account_approval",
      afterJson: { enabled: data.enabled },
    });
    return { ok: true };
  });

export type AdminApplication = {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  createdAt: string;
};

export const adminListApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routeId: string }) => input)
  .handler(async ({ data, context }): Promise<AdminApplication[]> => {
    await guard(data.routeId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("account_approvals")
      .select("*")
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: true })
      .limit(200);
    return Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        const meta = u?.user?.user_metadata as { display_name?: string } | undefined;
        return {
          userId: r.user_id,
          email: u?.user?.email ?? null,
          displayName: meta?.display_name ?? null,
          status: r.status,
          createdAt: r.created_at,
        };
      }),
    );
  });

export const adminDecideApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { routeId: string; userId: string; decision: "approved" | "rejected" }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(data.routeId, context.userId, ["SUPER_ADMIN", "SUPPORT_ADMIN"]);
    const { writeAudit } = await import("./admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("account_approvals")
      .update({ status: data.decision, decided_by: context.userId, decided_at: new Date().toISOString() })
      .eq("user_id", data.userId);
    if (error) throw error;
    await writeAudit({
      adminUserId: context.userId,
      actionType: `account.${data.decision}`,
      targetType: "user",
      targetId: data.userId,
    });
    return { ok: true };
  });
