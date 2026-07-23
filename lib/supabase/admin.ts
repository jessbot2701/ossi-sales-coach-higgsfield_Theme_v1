import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getSupabaseSecretKey } from "@/lib/env";

export function createAdminClient() {
  const { url } = getPublicSupabaseEnv();
  return createClient(url, getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
