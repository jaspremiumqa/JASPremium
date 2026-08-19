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

    const { data: allowed, error: allowedError } = await userClient.rpc("crm_has_permission", {
      p_section: "users",
      p_action: "update",
    });
    if (allowedError || allowed !== true) {
      throw new Error("You do not have permission to reset CRM user passwords.");
    }

    const { data: current } = await userClient.auth.getUser();
    if (!current?.user?.id) throw new Error("Not authenticated.");

    const body = await req.json();
    const targetUserId = String(body.user_id || "").trim();
    const password = String(body.password || "");
    if (!targetUserId) throw new Error("A target user is required.");
    if (targetUserId === current.user.id) throw new Error("You cannot set a temporary password for your own account.");
    if (password.length < 8) throw new Error("Temporary password must be at least 8 characters.");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: target, error: targetError } = await admin
      .from("admin_users")
      .select("user_id,email,full_name,active")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetError || !target) throw new Error("CRM user not found.");
    if (target.active === false) throw new Error("Activate the CRM user before setting a temporary password.");

    const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, {
      password,
      user_metadata: { must_change_password: true },
    });
    if (authError) throw authError;

    const { error: rowError } = await admin
      .from("admin_users")
      .update({ must_change_password: true })
      .eq("user_id", targetUserId);
    if (rowError) throw rowError;

    return new Response(JSON.stringify({ ok: true, user_id: targetUserId, email: target.email }), {
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
