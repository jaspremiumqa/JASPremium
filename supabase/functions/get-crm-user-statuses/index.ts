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
      p_action: "read",
    });
    if (permissionError || allowed !== true) throw new Error("You do not have permission to view CRM users.");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const users: any[] = [];
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      users.push(...(data.users || []));
      if (!data.users || data.users.length < perPage) break;
      page += 1;
    }

    const statuses = users.map((u) => ({
      user_id: u.id,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      invited_at: u.invited_at ?? null,
      created_at: u.created_at ?? null,
    }));

    return new Response(JSON.stringify({ ok: true, users: statuses }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("permission") ? 403 : message.includes("Not authenticated") ? 401 : 400;
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
