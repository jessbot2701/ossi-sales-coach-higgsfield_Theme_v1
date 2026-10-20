import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluationPayloadHash, prepareEvaluation, type ProviderEvaluation } from "./prepare-evaluation.ts";

type RecoveryPlan = {
  version: 1; planId: string; sessionId: string; conversationId: string; agentId: string;
  expectedRevision: number; expectedStatus: string; payloadHash: string;
  result: ReturnType<typeof prepareEvaluation>;
};
export type SealedRecoveryPlan = { plan: RecoveryPlan; checksum: string };
const checksum = (plan: RecoveryPlan) => createHash("sha256").update(JSON.stringify(plan)).digest("hex");

export async function previewRecovery(
  db: SupabaseClient, conversationId: string, provider: ProviderEvaluation & { status?: string }, allowedAgents: Set<string>,
): Promise<SealedRecoveryPlan> {
  if (provider.conversation_id !== conversationId || provider.status !== "done"
    || !provider.agent_id || !allowedAgents.has(provider.agent_id)) throw new Error("Provider identity/status rejected");
  const { data: context, error } = await db.rpc("read_evaluation_context", {
    p_conversation_id: conversationId, p_agent_id: provider.agent_id,
  });
  if (error || context?.code !== "accepted") throw new Error("Verified session unavailable");
  const session = context.session;
  if (!["created", "active", "failed", "processing"].includes(session.status)) throw new Error("Session protected: completed sessions cannot be recovered");
  const { data: criteria, error: criteriaError } = await db.from("evaluation_criteria")
    .select("id,slug,name,sort_order").eq("training_type_id", context.training_type_id).eq("is_active", true).order("sort_order");
  if (criteriaError || !criteria?.length) throw new Error("Evaluation criteria unavailable");
  const plan: RecoveryPlan = {
    version: 1, planId: randomUUID(), sessionId: session.id, conversationId, agentId: provider.agent_id,
    expectedRevision: session.evaluation_revision, expectedStatus: session.status,
    payloadHash: evaluationPayloadHash(provider),
    result: prepareEvaluation(provider, session, criteria, context.received_at ?? new Date().toISOString()),
  };
  return { plan, checksum: checksum(plan) };
}

export async function applyRecovery(db: SupabaseClient, sealed: SealedRecoveryPlan) {
  const plan = sealed?.plan;
  if (!plan || plan.version !== 1 || checksum(plan) !== sealed.checksum
    || !Number.isSafeInteger(plan.expectedRevision) || plan.expectedRevision < 0
    || !["created", "active", "failed", "processing"].includes(plan.expectedStatus)) throw new Error("Invalid or changed recovery plan");
  const { data, error } = await db.rpc("apply_evaluation_recovery", {
    p_session_id: plan.sessionId, p_expected_revision: plan.expectedRevision, p_plan_id: plan.planId,
    p_payload_hash: plan.payloadHash, p_agent_id: plan.agentId, p_result: plan.result,
  });
  if (error) throw new Error("Recovery transaction failed; safe to retry the same plan");
  if (!["processed", "duplicate"].includes(data?.code)) throw new Error(`Recovery rejected: ${data?.code ?? "unknown"}`);
  return data.code as "processed" | "duplicate";
}
