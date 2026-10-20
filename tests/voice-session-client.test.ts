import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startManagedVoiceSession } from "@/lib/coaching/voice-session-client";
import type { DynamicVariables } from "@/types/domain";

type Options = Parameters<typeof startManagedVoiceSession>[0];
let callbacks: Parameters<Options["startSession"]>[0];
let options: Options;
beforeEach(() => {
  vi.useFakeTimers();
  options = {
    sessionId: "local-session", signedUrl: "wss://example.test", dynamicVariables: {} as DynamicVariables,
    startSession: vi.fn((value) => { callbacks = value; }), endSession: vi.fn(),
    onReady: vi.fn(), onEnded: vi.fn(), onFailure: vi.fn(),
  };
  vi.stubGlobal("fetch", vi.fn(async (path: string) =>
    new Response(JSON.stringify(path.endsWith("/bind") ? { bound: true } : { aborted: true, released: true }))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("managed voice callbacks with fake SDK and local HTTP boundaries", () => {
  it("retries the identical bind after a lost successful response", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Lost response"));
    startManagedVoiceSession(options);
    expect(callbacks.onConnect({ conversationId: "conv_test" })).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(JSON.parse(String(init?.body))).toEqual({ conversationId: "conv_test" });
    }
    expect(options.onReady).toHaveBeenCalledTimes(1);
    expect(options.endSession).not.toHaveBeenCalled();
  });
  it("ends the SDK and compensates after exactly three failed bind attempts", async () => {
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (String(path).endsWith("/bind")) throw new TypeError("offline");
      return new Response(JSON.stringify({ released: true }));
    });
    startManagedVoiceSession(options);
    callbacks.onConnect({ conversationId: "conv_test" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/bind"))).toHaveLength(3);
    expect(options.endSession).toHaveBeenCalledTimes(1);
    expect(options.onFailure).toHaveBeenCalledWith(expect.stringContaining("erneut starten"));
    expect(options.onReady).not.toHaveBeenCalled();
  });
  it("does not retry a binding conflict", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: "session_conflict" }), { status: 409 }));
    startManagedVoiceSession(options);
    callbacks.onConnect({ conversationId: "conv_foreign" });
    await flush();
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/bind"))).toHaveLength(1);
    expect(options.endSession).toHaveBeenCalledOnce();
    expect(options.onReady).not.toHaveBeenCalled();
  });
  it.each(["throw", "onError", "disconnect", "timeout"])("compensates an SDK %s failure", async (kind) => {
    if (kind === "throw") options.startSession = () => { throw new Error("SDK failed"); };
    startManagedVoiceSession(options);
    if (kind === "onError") callbacks.onError("provider details");
    if (kind === "disconnect") callbacks.onDisconnect();
    await vi.advanceTimersByTimeAsync(kind === "timeout" ? 30_000 : 0);
    expect(options.endSession).toHaveBeenCalledOnce();
    expect(options.onFailure).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/sessions/local-session/abort", expect.anything());
  });
  it("consumes abort and SDK-close failures and reports the outstanding confirmation", async () => {
    options.endSession = vi.fn(async () => { throw new Error("close failed"); });
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    startManagedVoiceSession(options);
    callbacks.onError("provider");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(options.onFailure).toHaveBeenCalledWith(expect.stringContaining("noch geprüft"));
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not revive a session when a bind response arrives after abort", async () => {
    let finishBind!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (path) => String(path).endsWith("/bind")
      ? new Promise<Response>((resolve) => { finishBind = resolve; })
      : new Response(JSON.stringify({ released: false }), { status: 202 }));
    const lifecycle = startManagedVoiceSession(options);
    callbacks.onConnect({ conversationId: "conv_test" });
    await lifecycle.abort();
    finishBind(new Response(JSON.stringify({ bound: true })));
    await flush();
    callbacks.onDisconnect();
    callbacks.onError("late");
    expect(options.onReady).not.toHaveBeenCalled();
    expect(options.onEnded).not.toHaveBeenCalled();
    expect(options.onFailure).toHaveBeenCalledOnce();
  });
  it("closes a late SDK connection after the watchdog has cancelled the start", async () => {
    startManagedVoiceSession(options);
    await vi.advanceTimersByTimeAsync(30_000);
    callbacks.onConnect({ conversationId: "conv_late" });
    await flush();
    expect(options.endSession).toHaveBeenCalledTimes(2);
    expect(options.onReady).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/bind"))).toBe(false);
  });
  it("leaves a normally ended bound conversation available for evaluation", async () => {
    startManagedVoiceSession(options);
    callbacks.onConnect({ conversationId: "conv_test" });
    await flush();
    callbacks.onDisconnect();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(options.onEnded).toHaveBeenCalledOnce();
    expect(options.onFailure).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/abort"))).toBe(false);
  });
  it("compensates an unmounted preparation and closes late SDK callbacks", async () => {
    const lifecycle = startManagedVoiceSession(options);
    await lifecycle.dispose();
    callbacks.onConnect({ conversationId: "conv_late" });
    await flush();
    expect(options.onReady).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/sessions/local-session/abort", expect.anything());
  });
  it("ends a bound connection on unmount without cancelling its evaluation", async () => {
    const lifecycle = startManagedVoiceSession(options);
    callbacks.onConnect({ conversationId: "conv_test" });
    await flush();
    await lifecycle.dispose();
    expect(options.endSession).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/abort"))).toBe(false);
  });
});
