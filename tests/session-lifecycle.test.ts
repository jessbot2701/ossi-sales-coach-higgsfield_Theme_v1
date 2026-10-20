import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as start } from "@/app/api/sessions/start/route";
import { POST as bind } from "@/app/api/sessions/[id]/bind/route";
import { POST as abort } from "@/app/api/sessions/[id]/abort/route";
import { DELETE as remove } from "@/app/api/sessions/[id]/route";
import { reconcilePendingVoiceSession } from "@/lib/coaching/session-lifecycle";
import { ApiError } from "@/lib/api";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), recompute: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/coaching/recompute", () => ({ recomputeLearningProfiles: mocks.recompute }));
vi.mock("@/lib/env", () => ({ requireServerEnv: () => "synthetic-key" }));
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const scenarioId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";
const typeId = "55555555-5555-4555-8555-555555555555";
const params = { params: Promise.resolve({ id: sessionId }) };
const input = { trainingTypeId: typeId, scenarioId, mode: "surprise", consent: true, consentVersion: "2026-07-18" };
const request = (body: unknown) => new Request("http://localhost/api/sessions", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});
const grant = () => new Response(JSON.stringify({
  signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?conversation_id=conv_reserved&conversation_signature=synthetic",
}));

function database() {
  const errors: Record<string, object> = {};
  const session = { id: sessionId, user_id: userId, status: "completed", version: { training_type_id: typeId } };
  let deleteRows: object[] = [{ id: sessionId }];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (errors[String(args.p_action)] || errors[name]) return { data: null, error: errors[String(args.p_action)] ?? errors[name] };
    if (name === "delete_session_consistently") return {
      data: deleteRows.length && ["completed", "failed"].includes(session.status) ? "deleted" : "session_not_closed", error: null,
    };
    if (name === "reserve_voice_session") return { data: { code: "reserved", session_id: sessionId }, error: null };
    const codes: Record<string, string> = { issue: "issued", fail_preparation: "compensated", bind: "bound", abort: "aborted", settle: "settled" };
    return { data: args.p_action === "pending" ? null : { code: codes[String(args.p_action)] }, error: null };
  });
  const from = vi.fn((table: string) => {
    let columns = "";
    let deleting = false;
    const data = () => {
      if (table === "scenarios") return { id: scenarioId, slug: "standard", title: "Training", is_active: true,
        is_user_selectable: true, training_type: { id: typeId, name: "Kaltakquise", is_active: true } };
      if (table === "training_type_versions") return [{ id: versionId, is_active: true, elevenlabs_agent_id: "agent_test", elevenlabs_branch_id: "branch_test" }];
      if (table === "profiles") return { display_name: "Test" };
      if (table === "evaluation_criteria") return [{ id: "criterion", name: "Gesprächseinstieg" }];
      if (table === "coaching_sessions") return deleting ? deleteRows : columns.startsWith("summary") ? [] : session;
      if (table === "learning_profiles") return [];
      throw new Error(`Unexpected table ${table}`);
    };
    const query = {
      select: (value: string) => { columns = value; return query; },
      delete: () => { deleting = true; return query; },
      eq: () => query, in: () => query, not: () => query, order: () => query, limit: () => query,
      single: () => query, maybeSingle: () => query,
      then: (resolve: (value: object) => unknown) => Promise.resolve({ data: data(), error: errors[table] ?? null }).then(resolve),
    };
    return query;
  });
  return { client: { from, rpc }, errors, session, setDeleteRows: (rows: object[]) => { deleteRows = rows; } };
}
let db: ReturnType<typeof database>;
beforeEach(() => {
  vi.clearAllMocks();
  db = database();
  mocks.admin.mockReturnValue(db.client);
  mocks.auth.mockResolvedValue({ id: userId, role: "user", displayName: "Test", isActive: true });
  mocks.recompute.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => grant()));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("TRANSCRIPT_CONSENT_VERSION", "2026-07-18");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("session start and provider compensation", () => {
  it("reserves atomically and persists the provider-issued ID before returning the single-use grant", async () => {
    const response = await start(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sessionId, signedUrl: expect.stringContaining("conv_reserved") });
    expect(db.client.rpc).toHaveBeenCalledWith("reserve_voice_session", expect.objectContaining({ p_user_id: userId }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("include_conversation_id=true"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(db.client.rpc).toHaveBeenLastCalledWith("voice_session_control", {
      p_action: "issue", p_user_id: userId, p_session_id: sessionId, p_conversation_id: "conv_reserved",
    });
  });
  it.each(["network", "timeout", "http", "json", "schema", "missing-id", "conflicting-id"])(
    "compensates a prepared session after provider %s failure", async (kind) => {
      vi.mocked(fetch).mockImplementation(async () => {
        if (kind === "network") throw new TypeError("Network failed");
        if (kind === "timeout") throw new DOMException("Timeout", "TimeoutError");
        if (kind === "http") return new Response("provider", { status: 503 });
        if (kind === "json") return new Response("{invalid");
        if (kind === "schema") return new Response(JSON.stringify({ signed_url: "https://untrusted.example/conv" }));
        if (kind === "conflicting-id") return new Response(JSON.stringify({
          signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?conversation_id=conv_one", conversation_id: "conv_other",
        }));
        return new Response(JSON.stringify({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation" }));
      });
      const response = await start(request(input));
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ code: "voice_provider_error" });
      expect(db.client.rpc).toHaveBeenLastCalledWith("voice_session_control", expect.objectContaining({
        p_action: "fail_preparation", p_session_id: sessionId,
      }));
    },
  );
  it("does not disclose a grant when the issuance write fails", async () => {
    db.errors.issue = { message: "database unavailable" };
    const response = await start(request(input));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("signedUrl");
    expect(db.client.rpc).toHaveBeenLastCalledWith("voice_session_control", expect.objectContaining({ p_action: "fail_preparation" }));
  });
  it("surfaces failed compensation instead of claiming a clean close", async () => {
    db.errors.fail_preparation = { message: "database unavailable" };
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect((await start(request(input))).status).toBe(503);
  });
  it.each(["scenarios", "training_type_versions", "learning_profiles", "coaching_sessions", "profiles", "evaluation_criteria"])(
    "distinguishes a %s read failure from missing business data", async (table) => {
      db.errors[table] = { message: "database unavailable" };
      expect((await start(request(input))).status).toBe(503);
      expect(fetch).not.toHaveBeenCalled();
      expect(db.client.rpc).not.toHaveBeenCalledWith("reserve_voice_session", expect.anything());
    },
  );
  it.each([["session_already_open", 409], ["session_rate_limited", 429]] as const)(
    "honors the atomic %s result before contacting the provider", async (code, status) => {
      db.client.rpc.mockImplementation(async (name) => ({
        data: name === "reserve_voice_session" ? { code } : null, error: null,
      }));
      expect((await start(request(input))).status).toBe(status);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects unauthenticated starts before database or provider use", async () => {
    mocks.auth.mockRejectedValue(new ApiError(401, "Anmeldung erforderlich"));
    expect((await start(request(input))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("binding, abort and delete API decisions", () => {
  it.each([["bound", 200], ["session_conflict", 409], ["not_found", 404]] as const)(
    "maps the authoritative bind result %s", async (code, status) => {
      db.client.rpc.mockResolvedValue({ data: { code, duplicate: true }, error: null } as never);
      const response = await bind(request({ conversationId: "conv_reserved" }), params);
      expect(response.status).toBe(status);
      expect(db.client.rpc).toHaveBeenCalledWith("voice_session_control", {
        p_action: "bind", p_user_id: userId, p_session_id: sessionId, p_conversation_id: "conv_reserved",
      });
      if (status === 200) expect(await response.json()).toEqual({ bound: true, duplicate: true });
    },
  );
  it("never reports bound when the database has failed", async () => {
    db.errors.bind = { message: "write failed" };
    expect((await bind(request({ conversationId: "conv_reserved" }), params)).status).toBe(503);
  });
  it("aborts only the authenticated user's session and permits blocked users to end a call", async () => {
    const response = await abort(request({}), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ aborted: true, released: true });
    expect(mocks.auth).toHaveBeenCalledWith({ active: false });
    expect(db.client.rpc).toHaveBeenCalledWith("voice_session_control", expect.objectContaining({ p_action: "abort", p_user_id: userId }));
  });
  it.each(["created", "active", "processing"])("refuses deletion of a %s session", async (status) => {
    db.session.status = status;
    expect((await remove(request({}), params)).status).toBe(409);
    expect(mocks.recompute).not.toHaveBeenCalled();
  });
  it("checks the delete write result if the state changed after reading", async () => {
    db.setDeleteRows([]);
    expect((await remove(request({}), params)).status).toBe(409);
    expect(mocks.recompute).not.toHaveBeenCalled();
  });
  it("returns a technical failure for delete lookup errors", async () => {
    db.errors.delete_session_consistently = { message: "transaction failed" };
    expect((await remove(request({}), params)).status).toBe(503);
  });
  it("deletes closed session content and recomputes the owner profile", async () => {
    expect((await remove(request({}), params)).status).toBe(200);
    expect(db.client.rpc).toHaveBeenCalledWith("delete_session_consistently", { p_session_id: sessionId, p_actor_id: userId });
  });
});

describe("server-confirmed end of outstanding grants", () => {
  function pending(bound = false, age = 0) {
    db.client.rpc.mockImplementation(async (_name, args) => ({
      data: args.p_action === "pending" ? {
        session_id: sessionId, conversation_id: "conv_reserved", agent_id: "agent_test",
        issued_at: new Date(Date.now() - age).toISOString(), bound_at: bound ? new Date().toISOString() : null,
      } : { code: "settled" }, error: null,
    }) as never);
  }
  it.each(["initiated", "in-progress", "processing"])("keeps the lease while provider is %s", async (status) => {
    pending();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ conversation_id: "conv_reserved", agent_id: "agent_test", status })));
    expect(await reconcilePendingVoiceSession(db.client as never, userId)).toBe(false);
    expect(db.client.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["done", "failed"])("releases only a confirmed terminal %s conversation", async (status) => {
    pending();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ conversation_id: "conv_reserved", agent_id: "agent_test", status })));
    expect(await reconcilePendingVoiceSession(db.client as never, userId)).toBe(true);
    expect(db.client.rpc).toHaveBeenLastCalledWith("voice_session_control", expect.objectContaining({ p_action: "settle", p_conversation_id: "conv_reserved" }));
  });
  it.each([[false, 0, false], [false, 17 * 60_000, true], [true, 17 * 60_000, false]] as const)(
    "handles 404 with bound=%s and age=%s conservatively", async (bound, age, released) => {
      pending(bound, age);
      vi.mocked(fetch).mockResolvedValue(new Response("", { status: 404 }));
      expect(await reconcilePendingVoiceSession(db.client as never, userId)).toBe(released);
    },
  );
  it("does not turn a provider status outage into a free lease", async () => {
    pending();
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await expect(reconcilePendingVoiceSession(db.client as never, userId)).rejects.toMatchObject({ status: 503 });
    expect(db.client.rpc).toHaveBeenCalledTimes(1);
  });
});
