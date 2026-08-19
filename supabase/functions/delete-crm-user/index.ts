// Delete a CRM user from Supabase Auth and the CRM profile.
// The service-role key is intentionally used only inside this Edge Function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller client: keeps the permission check tied to the logged-in user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: allowed, error: permissionError } =
      await userClient.rpc("crm_has_permission", {
        p_section: "users",
        p_action: "delete",
      });

    if (permissionError || allowed !== true) {
      throw new Error("You do not have permission to delete CRM users.");
    }

    const { data: callerResult, error: callerError } =
      await userClient.auth.getUser();

    if (callerError || !callerResult.user) {
      throw new Error("Unable to determine the current user.");
    }

    const body = await req.json();
    const userId = String(body.user_id || "").trim();

    if (!userId) throw new Error("User ID is required.");

    if (callerResult.user.id === userId) {
      throw new Error("You cannot delete your own CRM account.");
    }

    // Service-role client: required for auth.admin.deleteUser().
    // Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: crmUser, error: crmUserError } = await admin
      .from("admin_users")
      .select("user_id,email,full_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (crmUserError) throw crmUserError;
    if (!crmUser) throw new Error("CRM user was not found.");

    // auth.users -> public.admin_users is configured with ON DELETE CASCADE.
    // Deleting Auth first keeps Auth as the source of truth.
    const { error: deleteAuthError } =
      await admin.auth.admin.deleteUser(userId);

    if (deleteAuthError) throw deleteAuthError;

    // Defensive cleanup: normally the FK cascade already removed this row.
    // This makes the operation safe even if an older database was deployed
    // without the expected cascade constraint.
    const { error: cleanupError } = await admin
      .from("admin_users")
      .delete()
      .eq("user_id", userId);

    if (cleanupError) {
      // Auth has already been deleted, so report the cleanup problem clearly.
      throw new Error(
        "The Auth user was deleted, but the CRM profile cleanup failed: " +
          cleanupError.message
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        email: crmUser.email,
        full_name: crmUser.full_name,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      message === "Not authenticated."
        ? 401
        : message.includes("permission")
          ? 403
          : 400;

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }
});
