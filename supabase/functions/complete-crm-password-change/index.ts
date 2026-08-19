import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: current } = await userClient.auth.getUser();
    if (!current?.user?.id) throw new Error("Not authenticated.");

    const body = await req.json();
    const password = String(body.password || "");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: row, error: rowError } = await admin
      .from("admin_users")
      .select("must_change_password,active")
      .eq("user_id", current.user.id)
      .maybeSingle();
    if (rowError || !row) throw new Error("CRM user not found.");
    if (row.active === false) throw new Error("This CRM account is inactive.");
    if (row.must_change_password !== true) throw new Error("A password change is not currently required.");

    const metadata = { ...(current.user.user_metadata || {}) };
    delete metadata.must_change_password;

    const { error: authError } = await admin.auth.admin.updateUserById(current.user.id, {
      password,
      user_metadata: metadata,
    });
    if (authError) throw authError;

    const { error: clearError } = await admin
      .from("admin_users")
      .update({ must_change_password: false })
      .eq("user_id", current.user.id);
    if (clearError) throw clearError;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
