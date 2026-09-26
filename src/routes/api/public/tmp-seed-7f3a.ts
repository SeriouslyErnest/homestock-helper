import { createFileRoute } from "@tanstack/react-router";
// TEMPORARY: creates one confirmed test account for an end-to-end check. Deleted right after.
export const Route = createFileRoute("/api/public/tmp-seed-7f3a")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-seed") !== "ae38affc3b695be94c0fe710a5fc6846")
          return new Response("no", { status: 401 });
        const { email, password } = (await request.json()) as { email: string; password: string };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: "Test Tester" },
        });
        return Response.json({ id: data.user?.id ?? null, error: error?.message ?? null });
      },
    },
  },
});
