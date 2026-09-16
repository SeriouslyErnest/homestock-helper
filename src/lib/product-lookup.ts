import { supabase } from "@/integrations/supabase/client";

export type ProductInfo = {
  barcode: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  quantity_label: string | null;
  source: "cache" | "openfoodfacts" | "manual";
};

const OFF_FIELDS = "code,product_name,brands,image_front_small_url,quantity";

/**
 * Barcode lookup chain: shared HomeStock cache -> Open Food Facts v3.
 * Results are cached so a repeated scan is instant and works for everyone.
 * Provider is abstracted here so another source can be added later.
 */
export async function lookupProduct(barcode: string): Promise<ProductInfo | null> {
  const code = barcode.trim();
  if (!code) return null;

  const { data: cached } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", code)
    .maybeSingle();
  if (cached) {
    return {
      barcode: cached.barcode,
      name: cached.name,
      brand: cached.brand,
      image_url: cached.image_url,
      quantity_label: cached.quantity_label,
      source: "cache",
    };
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?fields=${OFF_FIELDS}`,
      { headers: { "User-Agent": "HomeStock/1.0 (household inventory app)" } },
    );
    if (res.ok) {
      const json = await res.json();
      if (json.status === "success" && json.product) {
        const p = json.product;
        const info: ProductInfo = {
          barcode: code,
          name: p.product_name || null,
          brand: p.brands || null,
          image_url: p.image_front_small_url || null,
          quantity_label: p.quantity || null,
          source: "openfoodfacts",
        };
        await supabase.from("products").upsert({
          barcode: info.barcode,
          name: info.name,
          brand: info.brand,
          image_url: info.image_url,
          quantity_label: info.quantity_label,
          source: "openfoodfacts",
        });
        return info;
      }
    }
  } catch {
    // Network failure: fall through to manual entry.
  }

  return null;
}
