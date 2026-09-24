import { supabase } from "@/integrations/supabase/client";
import { fetchAndCacheProduct } from "@/lib/product-lookup.functions";

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
    // A reported name is hidden for everyone until an admin reviews it.
    if (cached.hidden_at) return null;
    return {
      barcode: cached.barcode,
      name: cached.name,
      brand: cached.brand,
      image_url: cached.image_url,
      quantity_label: cached.quantity_label,
      source: cached.source === "manual" ? "manual" : "cache",
    };
  }

  try {
    const info = await fetchAndCacheProduct({ data: { barcode: code } });
    if (info) return { ...info, source: "openfoodfacts" };
  } catch {
    // Network failure or unusable barcode: fall through to manual entry.
  }

  return null;
}
