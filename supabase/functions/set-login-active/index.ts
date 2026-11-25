// Supabase Edge Function: partners turn a login on or off (also signs the person out everywhere).
// Deploy: supabase functions deploy set-login-active
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isPartner } = await caller.rpc("is_partner");
  if (!isPartner) return json({ error: "Only partners can change logins" }, 403);
  const { data: me } = await caller.auth.getUser();

  const { user_id, active } = await req.json().catch(() => ({}));
  if (!user_id || typeof active !== "boolean") return json({ error: "user_id and active are required" }, 400);
  if (user_id === me.user?.id) return json({ error: "You can't turn off your own login" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: target, error: lookupError } = await admin.from("profiles").select("id").eq("id", user_id).maybeSingle();
  if (lookupError) return json({ error: lookupError.message }, 500);
  if (!target) return json({ error: "Login not found" }, 404);
  const { error: profileError } = await admin.from("profiles").update({ active }).eq("id", user_id);
  if (profileError) return json({ error: profileError.message }, 500);
  // Banning blocks new sign-ins and token refresh; "none" lifts it.
  const { error: authError } = await admin.auth.admin.updateUserById(user_id, { ban_duration: active ? "none" : "876000h" });
  if (authError) return json({ error: authError.message }, 500);
  return json({ ok: true });
});
