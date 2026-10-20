import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { applyRecovery, previewRecovery, type SealedRecoveryPlan } from "../lib/coaching/evaluation-recovery.ts";

// Preview is read-only. Apply consumes exactly one saved, reviewed plan and never refetches the provider.
const [mode, planFile, conversationId, ...extra] = process.argv.slice(2);
if (!["--preview", "--apply"].includes(mode) || !planFile || extra.length
  || (mode === "--preview" ? !/^conv_[A-Za-z0-9_-]{8,190}$/.test(conversationId ?? "") : !!conversationId)) {
  throw new Error("Usage: node --experimental-strip-types --env-file-if-exists=.env.local scripts/recover-elevenlabs-sessions.mts --preview artifacts/recovery/plan.json <conversation-id> | --apply artifacts/recovery/plan.json");
}
const destination = resolve(planFile);
const within = relative(resolve("artifacts"), destination);
if (!within || within.startsWith("..") || isAbsolute(within) || resolve("artifacts", within) !== destination) throw new Error("Keep private recovery plans under ignored artifacts/");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Database configuration missing");
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
try {
  if (mode === "--apply") {
    const sealed = JSON.parse(await readFile(destination, "utf8")) as SealedRecoveryPlan;
    console.log(JSON.stringify({ mode, result: await applyRecovery(db, sealed), sessionId: sealed.plan.sessionId }));
  } else {
    const providerKey = process.env.ELEVENLABS_API_KEY;
    const allowed = new Set((process.env.ELEVENLABS_ALLOWED_AGENT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
    if (!providerKey || !allowed.size) throw new Error("Provider configuration missing");
    const response = await fetch("https://api.elevenlabs.io/v1/convai/conversations/" + encodeURIComponent(conversationId), {
      headers: { "xi-api-key": providerKey }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Provider lookup failed");
    const sealed = await previewRecovery(db, conversationId, await response.json(), allowed);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(sealed, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ mode, sessionId: sealed.plan.sessionId, previousStatus: sealed.plan.expectedStatus,
      expectedRevision: sealed.plan.expectedRevision, acceptedScores: sealed.plan.result.evaluations.filter((e) => e.score !== null).length,
      plan: destination }));
  }
} catch (error) {
  // Errors produced by the recovery module contain no provider bodies or database details.
  const safeMessage = error instanceof Error && /^(Recovery rejected:|Recovery transaction|Invalid or changed recovery plan|Session protected:|Verified session unavailable|Evaluation criteria unavailable|Provider identity\/status rejected)/.test(error.message)
    ? error.message : "Recovery preparation or request failed";
  console.error(JSON.stringify({ code: "recovery_failed", message: safeMessage }));
  process.exitCode = 1;
}
