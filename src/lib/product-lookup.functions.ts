import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OFF_FIELDS = "code,product_name,brands,image_front_small_url,quantity";

export type FetchedProduct = {
  barcode: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  quantity_label: string | null;
};

/**
 * Looks a barcode up on Open Food Facts and writes the shared cache server-side.
 * Clients can read the cache but never write it, so nobody can inject product data.
 */
export const fetchAndCacheProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { barcode: string }) => {
    const barcode = String(input?.barcode ?? "").trim();
    if (!/^[0-9]{6,18}$/.test(barcode)) throw new Error("Invalid barcode");
    return { barcode };
  })
  .handler(async ({ data }): Promise<FetchedProduct | null> => {
    const code = data.barcode;
    let info: FetchedProduct | null = null;
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?fields=${OFF_FIELDS}`,
        { headers: { "User-Agent": "HomeStock/1.0 (household inventory app)" } },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          status?: string;
          product?: Record<string, string | undefined>;
        };
        if (json.status === "success" && json.product) {
          const p = json.product;
          const trim = (v: string | undefined) => {
            const s = (v ?? "").trim().slice(0, 300);
            return s || null;
          };
          info = {
            barcode: code,
            name: trim(p["product_name"]),
            brand: trim(p["brands"]),
            image_url: trim(p["image_front_small_url"]),
            quantity_label: trim(p["quantity"]),
          };
        }
      }
    } catch {
      return null;
    }
    if (!info) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("products").upsert({
      barcode: info.barcode,
      name: info.name,
      brand: info.brand,
      image_url: info.image_url,
      quantity_label: info.quantity_label,
      source: "openfoodfacts",
    });
    return info;
  });

/**
 * First save wins: when someone identifies an unknown barcode by typing its
 * name, that identification joins the shared catalogue, so the next person to
 * scan the same code — in any household — resolves instantly. The barcode is
 * the unique key, so 100 households scanning one code share one row; later
 * saves are ignored rather than overwriting the first (real corrections are an
 * explicit future flow, never a silent rewrite).
 */
export const cacheManualProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { barcode: string; name: string }) => {
    const barcode = String(input?.barcode ?? "").trim();
    const name = String(input?.name ?? "")
      .trim()
      .slice(0, 300);
    if (!/^[0-9]{6,18}$/.test(barcode) || !name) return null;
    return { barcode, name };
  })
  .handler(async ({ data, context }): Promise<boolean> => {
    if (!data) return false;
    const { isNameAllowed } = await import("./name-filter.server");
    // Rude names stay private to the household that typed them.
    if (!isNameAllowed(data.name)) return false;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("products")
      .upsert(
        { barcode: data.barcode, name: data.name, source: "manual", created_by: context.userId },
        { onConflict: "barcode", ignoreDuplicates: true },
      );
    return !error;
  });

/**
 * Anyone can flag a shared, typed-in name. One flag hides it for everyone
 * straight away and puts it in the admin console queue — no paid scanning.
 */
export const reportProductName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { barcode: string }) => {
    const barcode = String(input?.barcode ?? "").trim();
    if (!/^[0-9]{6,18}$/.test(barcode)) throw new Error("Invalid barcode");
    return { barcode };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("barcode, name, source")
      .eq("barcode", data.barcode)
      .maybeSingle();
    if (!product || product.source !== "manual") return { ok: false };
    await supabaseAdmin
      .from("product_reports")
      .upsert(
        { barcode: data.barcode, reporter_id: context.userId, reported_name: product.name },
        { onConflict: "barcode,reporter_id", ignoreDuplicates: true },
      );
    await supabaseAdmin
      .from("products")
      .update({ hidden_at: new Date().toISOString() })
      .eq("barcode", data.barcode);
    return { ok: true };
  });
