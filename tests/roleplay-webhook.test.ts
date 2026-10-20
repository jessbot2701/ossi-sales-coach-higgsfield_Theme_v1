import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/elevenlabs/route";
import { previewRecovery } from "@/lib/coaching/evaluation-recovery";
import { ROLEPLAY_START_MARKER } from "@/lib/coaching/transcript-phases";
import { coachingReply, coachSuggestion, firstEvidence, learningGoal, secondEvidence, twoRoleplays } from "./fixtures/roleplay";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  verifySignature: vi.fn(),
  recompute: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/elevenlabs/signature", () => ({ verifyElevenLabsSignature: mocks.verifySignature }));
vi.mock("@/lib/coaching/recompute", () => ({ recomputeLearningProfiles: mocks.recompute }));
vi.mock("@/lib/env", () => ({
  requireServerEnv: (name: string) => {
    if (name === "ELEVENLABS_ALLOWED_AGENT_IDS") return "agent_test";
    if (name === "ELEVENLABS_WEBHOOK_SECRET") return "local-test-secret";
    throw new Error(`Unexpected environment lookup: ${name}`);
  },
}));

type Row = Record<string, unknown>;
const criteria = [
  { id: "opening", slug: "conversation_opening", name: "Gesprächseröffnung" },
  { id: "needs", slug: "needs_discovery", name: "Bedarfsermittlung" },
  { id: "value", slug: "value_proposition", name: "Nutzenargumentation" },
  { id: "closing", slug: "closing", name: "Abschluss" },
];
const firstReasoning = "Du hast den Gesprächsanlass konkret benannt und deinen Einstieg klar eingegrenzt.";
const secondReasoning = "Mit deiner offenen Frage hast du gezielt die Engpässe des Kunden ermittelt.";

function payload() {
  return {
    type: "post_call_transcription",
    data: {
      agent_id: "agent_test",
      conversation_id: "conv_local_test",
      transcript: twoRoleplays,
      analysis: { data_collection_results: {
        conversation_opening: { value: 4 },
        conversation_opening_feedback: { value: firstReasoning },
        conversation_opening_evidence: { value: firstEvidence },
        needs_discovery: { value: 3 },
        needs_discovery_feedback: { value: secondReasoning },
        needs_discovery_evidence: { value: secondEvidence },
        needs_discovery_improvement: { value: JSON.stringify({
          improvement: "Die Bedarfsfrage noch stärker auf messbare Auswirkungen ausrichten.",
          alternative: "Welche Auswirkungen haben die Engpässe auf Ihre Liefertermine?",
          evidence: secondEvidence,
          priority: 1,
        }) },
        value_proposition: { value: 4 },
        value_proposition_feedback: { value: "Der angebliche Nutzen ist in diesem Nutzerbeitrag nicht belegt." },
        value_proposition_evidence: { value: coachingReply },
        closing: { value: 4 },
        closing_feedback: { value: "Der vermeintliche Abschluss wurde hier ausschließlich vom Coach vorgeschlagen." },
        closing_evidence: { value: coachSuggestion },
        session_conclusion: { value: JSON.stringify({
          summary: "Du hast einen klaren Einstieg und eine offene Bedarfsfrage gezeigt.",
          strengths: ["Klarer Gesprächsanlass"],
          next_learning_goal: learningGoal,
        }) },
      } },
    },
  };
}

function database() {
  const session = {
    evaluation_revision: 0, id: "session_test", user_id: "user_test", status: "active", scenario_snapshot: { title: "Lokales Training" },
    version: { training_type_id: "training_test", elevenlabs_agent_id: "agent_test" },
  };
  const sessionUpdates: Row[] = [];
  let readError: Row | null = null;
  let evaluations: Row[] = [];
  const receipts = new Map<string, string>();
  const commit = vi.fn(async (result: { evaluations: Row[]; session: Row }) => {
    evaluations = result.evaluations;
    sessionUpdates.push(result.session);
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<{ data?: unknown; error: Row | null }> => {
    const id = String(args.p_conversation_id);
    if (name === "read_evaluation_context") return { data: { code: session.version.elevenlabs_agent_id === "agent_test" ? "accepted" : "agent_mismatch", session, training_type_id: "training_test", received_at: "2026-10-20T10:00:00Z" }, error: readError };
    if (name === "claim_evaluation") {
      const existing = receipts.get(id);
      if (existing) return { data: { code: existing === args.p_payload_hash ? "duplicate" : "conflict" }, error: null };
      return { data: { code: "claimed", token: "attempt-token", received_at: "2026-10-20T10:00:00Z" }, error: null };
    }
    if (name === "complete_evaluation") {
      if (args.p_result) await commit(args.p_result as { evaluations: Row[]; session: Row });
      const claimArgs = rpc.mock.calls.find(([n]) => n === "claim_evaluation")?.[1];
      receipts.set(id, String(claimArgs?.p_payload_hash));
      return { data: { code: args.p_result ? "processed" : "ignored", session_id: session.id }, error: null };
    }
    if (name === "fail_evaluation") return { data: true, error: null };
    throw new Error("Unexpected RPC: " + name);
  });
  const from = vi.fn((table: string) => {
    if (table === "coaching_sessions") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session, error: readError }) }) }),
      update: (row: Row) => ({ eq: async () => {
        sessionUpdates.push(row);
        return { error: null };
      } }),
    };
    if (table === "evaluation_criteria") {
      const query = { eq: () => query, order: async () => ({ data: criteria, error: null }) };
      return { select: () => query };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
  return { client: { from, rpc }, session, sessionUpdates, commit,
    setReadError: (error: Row) => { readError = error; }, get evaluations() { return evaluations; } };
}

function send(body: ReturnType<typeof payload>) {
  return POST(new Request("http://localhost/api/webhooks/elevenlabs", {
    method: "POST", headers: { "elevenlabs-signature": "test-signature" }, body: JSON.stringify(body),
  }));
}

describe("roleplay webhook processing with local database and service mocks", () => {
  let db: ReturnType<typeof database>;
  beforeEach(() => {
    vi.clearAllMocks();
    db = database();
    mocks.createAdminClient.mockReturnValue(db.client);
    mocks.verifySignature.mockReturnValue(true);
    mocks.recompute.mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network access is forbidden in this test"); }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores provider session scores, reasons, evidence and the supplied goal for two exercises", async () => {
    const response = await send(payload());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, sessionId: "session_test" });
    expect(db.evaluations).toMatchObject([
      { criterion_id: "opening", score: 4, reasoning: firstReasoning, evidence: firstEvidence },
      { criterion_id: "needs", score: 3, reasoning: secondReasoning, evidence: secondEvidence,
        recommendation: "Die Bedarfsfrage noch stärker auf messbare Auswirkungen ausrichten.",
        improvement_evidence: secondEvidence, improvement_priority: 1 },
      { criterion_id: "value", score: null, reasoning: null, evidence: null },
      { criterion_id: "closing", score: null, reasoning: null, evidence: null },
    ]);
    expect(db.commit).toHaveBeenCalledWith(expect.objectContaining({ evaluations: db.evaluations }));
    expect(db.sessionUpdates.at(-1)).toMatchObject({
      status: "completed", next_learning_goal: learningGoal, strengths: ["Klarer Gesprächsanlass"],
    });
    expect(db.client.rpc).toHaveBeenLastCalledWith("complete_evaluation", expect.objectContaining({ p_token: "attempt-token" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps only the completed exercise when the second attempt is unfinished", async () => {
    const body = payload();
    body.data.transcript = [...twoRoleplays.slice(0, 4),
      { role: "agent", message: ROLEPLAY_START_MARKER }, { role: "user", message: secondEvidence }];
    expect((await send(body)).status).toBe(200);
    expect(db.evaluations.map((evaluation) => evaluation.score)).toEqual([4, null, null, null]);
    expect(db.sessionUpdates.at(-1)?.next_learning_goal).toBe(learningGoal);
  });

  it.each(["before", "after", "brackets", "markup", "similar"] as const)(
    "rejects invented rating and improvement evidence (%s) in the stored rows",
    async (variant) => {
      const invent = (quote: string) => {
        const extra = "Ich garantiere Ihnen fünfzig Prozent Einsparung.";
        if (variant === "before") return `${extra} ${quote}`;
        if (variant === "after") return `${quote} ${extra}`;
        if (variant === "brackets") return `${quote} [${extra}]`;
        if (variant === "markup") return `${quote} <${extra}>`;
        return quote.replace("Ich", "Wir").replace("Ihre", "unsere");
      };
      const body = payload();
      body.data.analysis.data_collection_results.conversation_opening_evidence.value = invent(firstEvidence);
      const improvement = JSON.parse(body.data.analysis.data_collection_results.needs_discovery_improvement.value);
      improvement.evidence = invent(secondEvidence);
      body.data.analysis.data_collection_results.needs_discovery_improvement.value = JSON.stringify(improvement);
      expect((await send(body)).status).toBe(200);
      expect(db.evaluations.slice(0, 2)).toMatchObject([
        { score: null, reasoning: null, evidence: null },
        { score: null, reasoning: null, evidence: null, recommendation: null,
          alternative_formulation: null, improvement_evidence: null, improvement_priority: null },
      ]);
    },
  );

  it("preserves three structured strengths including punctuation in the session write", async () => {
    const strengths = [
      "Du bleibst ruhig, auch bei Rückfragen.",
      "Du fragst nach, bevor du Lösungen anbietest.",
      "Du fasst zusammen, was dem Kunden wichtig ist.",
    ];
    const body = payload();
    const conclusion = JSON.parse(body.data.analysis.data_collection_results.session_conclusion.value);
    conclusion.strengths = strengths;
    body.data.analysis.data_collection_results.session_conclusion.value = JSON.stringify(conclusion);
    expect((await send(body)).status).toBe(200);
    expect(db.sessionUpdates.at(-1)?.strengths).toEqual(strengths);
  });

  it("does not hide invented evidence suffixes beyond the extraction length limit", async () => {
    const body = payload();
    const genuine = "Das ist ein echter Gesprächsbeitrag. ".repeat(600);
    body.data.transcript = twoRoleplays.map((turn) =>
      turn.message === firstEvidence || turn.message === secondEvidence ? { ...turn, message: genuine } : turn);
    const invented = `${genuine} Ich garantiere eine frei erfundene Einsparung.`;
    body.data.analysis.data_collection_results.conversation_opening_evidence.value = invented;
    body.data.analysis.data_collection_results.needs_discovery_evidence.value = "Das ist ein echter Gesprächsbeitrag.";
    const improvement = JSON.parse(body.data.analysis.data_collection_results.needs_discovery_improvement.value);
    improvement.evidence = invented;
    body.data.analysis.data_collection_results.needs_discovery_improvement.value = JSON.stringify(improvement);
    expect((await send(body)).status).toBe(200);
    expect(db.evaluations.slice(0, 2)).toMatchObject([
      { score: null, evidence: null },
      { score: null, evidence: null, improvement_evidence: null },
    ]);
  });

  it("stores no scores or learning goal when no safe roleplay boundaries exist", async () => {
    const body = payload();
    body.data.transcript = [{ role: "user", message: firstEvidence }];
    expect((await send(body)).status).toBe(200);
    expect(db.evaluations.every((evaluation) => evaluation.score === null)).toBe(true);
    expect(db.sessionUpdates.at(-1)?.next_learning_goal).toBeNull();
  });

  it.each(["missing", "invalid", "standalone"])("handles %s provider learning-goal data independently of valid phases", async (kind) => {
    const body = payload();
    const collection: Record<string, unknown> = body.data.analysis.data_collection_results;
    collection.session_conclusion = { value: kind === "invalid"
      ? { next_learning_goal: { invented: "not a string" } } : { summary: "Gültige deutsche Zusammenfassung." } };
    if (kind === "standalone") collection.next_learning_goal = { value: learningGoal };
    expect((await send(body)).status).toBe(200);
    expect(db.evaluations[0].score).toBe(4);
    expect(db.sessionUpdates.at(-1)?.next_learning_goal).toBe(kind === "standalone" ? learningGoal : null);
  });

  it("does not invent feedback or evidence when provider fields are absent", async () => {
    const body = payload();
    const collection: Record<string, unknown> = body.data.analysis.data_collection_results;
    delete collection.conversation_opening_feedback;
    delete collection.needs_discovery_evidence;
    expect((await send(body)).status).toBe(200);
    expect(db.evaluations.map((evaluation) => evaluation.score)).toEqual([null, null, null, null]);
    expect(db.sessionUpdates.at(-1)?.next_learning_goal).toBeNull();
  });

  it("acknowledges an identical replay without writing or recomputing a second time", async () => {
    const body = payload();
    await send(body);
    const writes = db.sessionUpdates.length;
    const response = await send(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(db.sessionUpdates).toHaveLength(writes);
    expect(db.commit).toHaveBeenCalledTimes(1);
  });

  it("rejects a different payload for the same conversation without overwriting stored results", async () => {
    await send(payload());
    const writes = db.sessionUpdates.length;
    const altered = payload();
    altered.data.analysis.data_collection_results.conversation_opening.value = 5;
    const response = await send(altered);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "payload_conflict" });
    expect(db.sessionUpdates).toHaveLength(writes);
    expect(db.commit).toHaveBeenCalledTimes(1);
    expect(db.evaluations[0].score).toBe(4);
  });

  it("still rejects a session bound to another agent before storing evaluations", async () => {
    db.session.version.elevenlabs_agent_id = "agent_other";
    const response = await send(payload());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "agent_version_mismatch" });
    expect(db.commit).not.toHaveBeenCalled();
  });

  it("ignores a cancelled or deleted conversation without restoring content", async () => {
    const rpc = db.client.rpc.getMockImplementation()!;
    db.client.rpc.mockImplementation(async (name, args) => name === "read_evaluation_context"
      ? { data: { code: "ignored", session_id: db.session.id }, error: null } : rpc(name, args));
    const response = await send(payload());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, ignored: true });
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.sessionUpdates).toEqual([]);
  });

  it("reports a technical session read failure without writing evaluations", async () => {
    db.setReadError({ message: "database offline" });
    const response = await send(payload());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "session_read_failed" });
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.sessionUpdates).toEqual([]);
    expect(db.client.rpc).toHaveBeenLastCalledWith("fail_evaluation", expect.objectContaining({ p_token: "attempt-token" }));
  });

  it.each(["agent_mismatch", "database_error"])("does not mutate a session when correlation fails: %s", async (failure) => {
    const rpc = db.client.rpc.getMockImplementation()!;
    db.client.rpc.mockImplementation(async (name, args) => name === "read_evaluation_context"
      ? { data: failure === "agent_mismatch" ? { code: failure } : null,
        error: failure === "database_error" ? { message: "database unavailable" } : null } : rpc(name, args));
    const response = await send(payload());
    expect(response.status).toBe(failure === "agent_mismatch" ? 403 : 503);
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.sessionUpdates).toEqual([]);
  });

  it("produces identical reviewed results through webhook and recovery", async () => {
    const body = payload();
    const preview = await previewRecovery(db.client as never, body.data.conversation_id,
      { ...body.data, status: "done" }, new Set(["agent_test"]));
    expect(db.commit).not.toHaveBeenCalled();
    expect((await send(body)).status).toBe(200);
    expect(db.commit).toHaveBeenCalledWith(preview.plan.result);
  });

  it("returns retryable failure for a busy claim without acknowledging unfinished work", async () => {
    db.client.rpc.mockResolvedValue({ data: { code: "busy" }, error: null });
    const response = await send(payload());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "receipt_busy" });
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.client.rpc).toHaveBeenCalledOnce();
  });

  it("recovers a lost successful commit response by acknowledging the next delivery", async () => {
    const original = db.client.rpc.getMockImplementation()!;
    let loseResponse = true;
    db.client.rpc.mockImplementation(async (name, args) => {
      const result = await original(name, args);
      if (name === "complete_evaluation" && loseResponse) {
        loseResponse = false;
        throw new Error("lost response");
      }
      return result;
    });
    expect((await send(payload())).status).toBe(503);
    expect((await send(payload())).status).toBe(200);
    expect(db.commit).toHaveBeenCalledOnce();
  });

  it.each(["stale", "write_error"])("does not acknowledge an unconfirmed commit: %s", async (failure) => {
    const original = db.client.rpc.getMockImplementation()!;
    db.client.rpc.mockImplementation(async (name, args) => name === "complete_evaluation"
      ? { data: { code: failure }, error: failure === "write_error" ? { message: "sensitive database detail" } : null }
      : original(name, args));
    expect((await send(payload())).status).toBe(503);
    expect(db.commit).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sensitive database detail");
    expect(db.client.rpc).toHaveBeenLastCalledWith("fail_evaluation", expect.objectContaining({ p_token: "attempt-token" }));
  });
});
