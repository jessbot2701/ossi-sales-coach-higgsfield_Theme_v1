import type { SupabaseClient } from "@supabase/supabase-js";

/** Rebuild every scope atomically, also when the original source session is gone. */
export async function recomputeLearningProfiles(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.rpc("rebuild_learning_profiles", { p_user_id: userId });
  if (error) throw new Error("Learning profile rebuild failed");
}
