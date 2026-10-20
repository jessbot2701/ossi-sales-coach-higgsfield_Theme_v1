import { createClient } from "@supabase/supabase-js";
import { processingHealth } from "../lib/coaching/processing-health.ts";

try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Monitoring configuration missing");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await processingHealth(db, {
    failureAttempts: Number(process.env.EVALUATION_FAILURE_ATTEMPTS ?? 3),
    maxOverdue: Number(process.env.EVALUATION_MAX_OVERDUE ?? 0),
    maxRepeatedFailures: Number(process.env.EVALUATION_MAX_REPEATED_FAILURES ?? 0),
  });
  console.log(JSON.stringify(report)); // Counts only; no transcripts, keys or user identifiers.
  process.exitCode = report.healthy ? 0 : 2;
} catch {
  console.error(JSON.stringify({ healthy: false, code: "processing_health_unavailable" }));
  process.exitCode = 1;
}
