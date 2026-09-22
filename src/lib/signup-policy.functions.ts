import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Public read of the "can new people sign themselves up?" switch. Safe for the
 * landing and sign-in pages: it reads a single non-sensitive settings row.
 * Missing row means the app has never been locked down, so signups are open.
 */
export const getSignupPolicy = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await client
    .from("app_settings")
    .select("value")
    .eq("key", "signups_enabled")
    .maybeSingle();
  return { signupsEnabled: data?.value === false ? false : true };
});
