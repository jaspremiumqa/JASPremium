// CRM INVITE FUNCTION v4 - role-permission authorization
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Uses the authenticated caller for permission checks and the service-role client only for Auth/admin operations.
// No legacy "Administrator access required" check.

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

    const { data: allowed, error: allowedError } =
      await userClient.rpc("crm_has_permission", {
        p_section: "users",
        p_action: "create",
      });

    if (allowedError || allowed !== true) {
      throw new Error("You do not have permission to invite CRM users.");
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const roleId = Number(body.role_id);
    const requestedRedirect = String(
      body.redirect_to ||
        "https://shereenakoum.github.io/Salon1/admin.html?invite=1"
    ).trim();

    if (!email || !fullName) throw new Error("Name and email are required.");
    if (!Number.isInteger(roleId) || roleId <= 0) {
      throw new Error("A valid CRM role is required.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleRow, error: roleError } = await admin
      .from("crm_roles")
      .select("id,name")
      .eq("id", roleId)
      .maybeSingle();

    if (roleError || !roleRow) throw new Error("Invalid CRM role.");

    const { data: canAssignRoles, error: rolePermissionError } =
      await userClient.rpc("crm_has_permission", {
        p_section: "roles",
        p_action: "update",
      });

    if (rolePermissionError || canAssignRoles !== true) {
      throw new Error("You do not have permission to assign CRM roles.");
    }

    let redirectTo =
      "https://shereenakoum.github.io/Salon1/admin.html?invite=1";
    try {
      const url = new URL(requestedRedirect);
      if (
        url.protocol === "https:" &&
        url.hostname === "shereenakoum.github.io" &&
        url.pathname.endsWith("/admin.html")
      ) {
        redirectTo = url.toString();
      }
    } catch (_) {
      // Keep the safe production fallback.
    }

    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName,
          crm_role_id: roleRow.id,
          crm_role: roleRow.name,
        },
        redirectTo,
      });

    if (inviteError) throw inviteError;
    if (!invited?.user?.id) throw new Error("Supabase did not return the new user.");

    const { error: rowError } = await admin.from("admin_users").upsert(
      {
        user_id: invited.user.id,
        email,
        full_name: fullName,
        role: roleRow.name,
        role_id: roleRow.id,
        active: true,
      },
      { onConflict: "user_id" }
    );

    if (rowError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      throw rowError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: invited.user.id,
        role_id: roleRow.id,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message.includes("permission") || message.includes("Not authenticated")
        ? (message.includes("Not authenticated") ? 401 : 403)
        : 400;

    return new Response(
      JSON.stringify({ error: message }),
      {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }
});