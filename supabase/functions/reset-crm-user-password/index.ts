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

    const { data: allowed, error: permissionError } = await userClient.rpc("crm_has_permission", {
      p_section: "users",
      p_action: "update",
    });
    if (permissionError || allowed !== true) throw new Error("You do not have permission to reset CRM user passwords.");

    const { data: current } = await userClient.auth.getUser();
    if (!current?.user?.id) throw new Error("Not authenticated.");

    const body = await req.json();
    const targetUserId = String(body.user_id || "").trim();
    if (!targetUserId) throw new Error("A target user is required.");
    if (targetUserId === current.user.id) throw new Error("Use the normal forgot-password flow to reset your own password.");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: target, error: targetError } = await admin
      .from("admin_users")
      .select("user_id,email,full_name,active")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetError || !target) throw new Error("CRM user not found.");
    if (!target.email) throw new Error("This CRM user does not have an email address.");
    if (target.active === false) throw new Error("Activate the CRM user before sending a password reset.");

    const requestedRedirect = String(body.redirect_to || "").trim();
    let redirectTo = "https://shereenakoum.github.io/Salon1/admin.html?recovery=1";
    try {
      const url = new URL(requestedRedirect);
      if ((url.protocol === "https:" && url.hostname === "shereenakoum.github.io" || url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) && url.pathname.endsWith("/admin.html")) {
        url.searchParams.set("recovery", "1");
        redirectTo = url.toString();
      }
    } catch (_) {}

    const { error: resetError } = await userClient.auth.resetPasswordForEmail(target.email, { redirectTo });
    if (resetError) throw resetError;

    return new Response(JSON.stringify({ ok: true, user_id: targetUserId, email: target.email }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
