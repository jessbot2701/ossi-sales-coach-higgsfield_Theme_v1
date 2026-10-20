import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_PROCESSING_THRESHOLDS = { failureAttempts: 3, maxOverdue: 0, maxRepeatedFailures: 0 };
export async function processingHealth(db: SupabaseClient, thresholds = DEFAULT_PROCESSING_THRESHOLDS) {
  if (!Object.values(thresholds).every((value) => Number.isSafeInteger(value) && value >= 0)
    || thresholds.failureAttempts < 1) throw new Error("Invalid monitoring thresholds");
  const { data, error } = await db.rpc("evaluation_health", { p_failure_threshold: thresholds.failureAttempts });
  if (error || !data || !["overdue", "repeated_failures", "failed", "processing", "oldest_overdue_seconds"]
    .every((key) => typeof data[key] === "number" && Number.isFinite(data[key]) && data[key] >= 0)) {
    throw new Error("Processing health unavailable");
  }
  return { healthy: data.overdue <= thresholds.maxOverdue && data.repeated_failures <= thresholds.maxRepeatedFailures,
    thresholds, metrics: data };
}
