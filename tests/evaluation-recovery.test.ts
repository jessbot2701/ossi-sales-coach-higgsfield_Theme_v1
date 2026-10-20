import { describe, expect, it, vi } from "vitest";
import { applyRecovery, previewRecovery } from "@/lib/coaching/evaluation-recovery";
import { evaluationPayloadHash } from "@/lib/coaching/prepare-evaluation";
import { processingHealth } from "@/lib/coaching/processing-health";
import { recomputeLearningProfiles } from "@/lib/coaching/recompute";

function fixture(status = "failed") {
  const session = { id: "session-1", status, evaluation_revision: 12, scenario_snapshot: { title: "Test" } };
  const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: unknown }> => ({
    data: name === "read_evaluation_context" ? { code: "accepted", session, training_type_id: "type",
      received_at: "2026-10-20T08:00:00Z" } : { code: "processed" }, error: null,
  }));
  const query = { eq: () => query, order: async () => ({ data: [{ id: "criterion", slug: "closing", name: "Abschluss" }], error: null }) };
  const db = { rpc, from: vi.fn(() => ({ select: () => query })) };
  const provider = { conversation_id: "conv_selected", agent_id: "agent_test", status: "done", transcript: [], analysis: {} };
  const preview = () => previewRecovery(db as never, "conv_selected", provider, new Set(["agent_test"]));
  return { db, session, provider, preview };
}

describe("recovery review and compare-and-set", () => {
  it("previews exactly the selected verified session without claiming or writing", async () => {
    const { db, preview } = fixture();
    const sealed = await preview();
    expect(sealed.plan).toMatchObject({ sessionId: "session-1", expectedRevision: 12, expectedStatus: "failed" });
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["read_evaluation_context"]);
  });
  it.each(["completed", "unknown"])("protects %s sessions by default", async (status) => {
    const { preview } = fixture(status);
    await expect(preview()).rejects.toThrow("Session protected");
  });
  it.each(["conversation_id", "agent_id", "status"] as const)("rejects an unrelated provider %s", async (field) => {
    const { provider, preview, db } = fixture();
    provider[field] = "foreign";
    await expect(preview()).rejects.toThrow("Provider identity/status rejected");
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("rejects an edited preview before touching the database", async () => {
    const { db, preview } = fixture();
    const sealed = await preview();
    sealed.plan.result.session.title = "edited";
    db.rpc.mockClear();
    await expect(applyRecovery(db as never, sealed)).rejects.toThrow("changed recovery plan");
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("sends the reviewed revision and exact result without a new provider read", async () => {
    const { db, preview } = fixture();
    const sealed = await preview();
    db.rpc.mockClear();
    await expect(applyRecovery(db as never, sealed)).resolves.toBe("processed");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("apply_evaluation_recovery", expect.objectContaining({
      p_expected_revision: 12, p_session_id: "session-1", p_plan_id: sealed.plan.planId, p_result: sealed.plan.result,
    }));
  });
  it.each(["changed", "busy", "protected", "unverified", "not_found"])("reports database rejection %s", async (code) => {
    const { db, preview } = fixture();
    const sealed = await preview();
    db.rpc.mockResolvedValue({ data: { code }, error: null });
    await expect(applyRecovery(db as never, sealed)).rejects.toThrow(code);
  });
  it("accepts an already applied identical plan and handles transaction errors", async () => {
    const { db, preview } = fixture();
    const sealed = await preview();
    db.rpc.mockResolvedValue({ data: { code: "duplicate" }, error: null });
    await expect(applyRecovery(db as never, sealed)).resolves.toBe("duplicate");
    db.rpc.mockResolvedValue({ data: null, error: { message: "private DB details" } });
    await expect(applyRecovery(db as never, sealed)).rejects.toThrow("transaction failed");
  });
  it("uses the same identity for GET/webhook envelopes and detects changed evaluation inputs", () => {
    const { provider } = fixture();
    const first = { ...provider, metadata: { call_duration_secs: 30, start_time_unix_secs: 123 } };
    const second = { ...provider, metadata: { start_time_unix_secs: 123, call_duration_seconds: 30, transport_only: "extra" } };
    expect(evaluationPayloadHash(first)).toBe(evaluationPayloadHash(second));
    expect(evaluationPayloadHash({ ...first, transcript: [{ role: "user", message: "changed" }] })).not.toBe(evaluationPayloadHash(first));
  });
  it("repairs all learning scopes without requiring a source session", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ error: null }) };
    await recomputeLearningProfiles(db as never, "user");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("rebuild_learning_profiles", { p_user_id: "user" });
  });
});

describe("processing monitoring thresholds", () => {
  const metrics = { overdue: 0, repeated_failures: 0, failed: 0, processing: 1, oldest_overdue_seconds: 0 };
  it("distinguishes a live lease from overdue claims and repeated failures", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: metrics, error: null }) };
    expect((await processingHealth(db as never)).healthy).toBe(true);
    for (const change of [{ overdue: 1 }, { repeated_failures: 1 }]) {
      db.rpc.mockResolvedValue({ data: { ...metrics, ...change }, error: null });
      expect((await processingHealth(db as never)).healthy).toBe(false);
    }
    expect((await processingHealth(db as never, { failureAttempts: 5, maxOverdue: 0, maxRepeatedFailures: 1 })).healthy).toBe(true);
    expect(db.rpc).toHaveBeenLastCalledWith("evaluation_health", { p_failure_threshold: 5 });
  });
  it("fails closed when health is unavailable or thresholds are invalid", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) };
    await expect(processingHealth(db as never)).rejects.toThrow("unavailable");
    await expect(processingHealth(db as never, { failureAttempts: 0, maxOverdue: -1, maxRepeatedFailures: 0 })).rejects.toThrow("thresholds");
  });
});
