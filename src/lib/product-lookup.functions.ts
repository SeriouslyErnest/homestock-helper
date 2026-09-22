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
