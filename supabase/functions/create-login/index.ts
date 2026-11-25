// Supabase Edge Function: partners create logins for staff or partners.
// Deploy: supabase functions deploy create-login
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isPartner } = await caller.rpc("is_partner");
  if (!isPartner) return json({ error: "Only partners can create logins" }, 403);

  const { full_name, username, password, role } = await req.json().catch(() => ({}));
  const u = String(username ?? "").trim().toLowerCase();
  if (!String(full_name ?? "").trim()) return json({ error: "Enter the person's full name" }, 400);
  if (!/^[a-z0-9._-]{3,20}$/.test(u)) return json({ error: "Username: 3–20 letters or numbers, no spaces" }, 400);
  if (String(password ?? "").length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
  if (!["partner", "staff"].includes(role)) return json({ error: "Role must be partner or staff" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: taken } = await admin.from("profiles").select("id").ilike("username", u).maybeSingle();
  if (taken) return json({ error: "That username is already taken" }, 409);

  const { data, error } = await admin.auth.admin.createUser({
    email: `${u}@guya.local`, password, email_confirm: true,
    user_metadata: { full_name: String(full_name).trim(), username: u },
    app_metadata: { role },
  });
  if (error || !data.user) return json({ error: error?.message ?? "Could not create login" }, 400);
  const { data: profile, error: profileError } = await admin.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (profileError || !profile) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
    const message = profileError?.message ?? "The login profile was not created";
    return json({ error: cleanupError ? `${message}; cleanup failed: ${cleanupError.message}` : message }, 500);
  }
  return json({ id: data.user.id, username: u });
});
