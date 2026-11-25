import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = !!url && !!anonKey;
export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export function getSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
}

/** Usernames map to a hidden email, so staff only ever type a username. */
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@guya.local`;

export async function signIn(username: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email: loginEmail(username), password });
}

/** Partners only — creates a staff/partner login through the create-login Edge Function. */
export async function createLogin(input: { full_name: string; username: string; password: string; role: "partner" | "staff" }) {
  return getSupabase().functions.invoke("create-login", { body: input });
}

export async function setLoginActive(user_id: string, active: boolean) {
  return getSupabase().functions.invoke("set-login-active", { body: { user_id, active } });
}

/** Upload a compressed payment screenshot (data URL from the payment form) and return its storage path. */
export async function uploadScreenshot(dataUrl: string, childId: string) {
  const client = getSupabase();
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${childId}/${crypto.randomUUID()}.jpg`;
  const { error } = await client.storage.from("payment-screenshots").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function screenshotUrl(path: string) {
  const { data, error } = await getSupabase().storage.from("payment-screenshots").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
