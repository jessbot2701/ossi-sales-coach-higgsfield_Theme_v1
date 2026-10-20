import type { DynamicVariables } from "@/types/domain";

type StartOptions = {
  signedUrl: string; connectionType: "websocket"; dynamicVariables: DynamicVariables;
  onConnect: (event: { conversationId: string }) => void;
  onDisconnect: () => void;
  onError: (message: string) => void;
};
type Controls = {
  sessionId: string; signedUrl: string; dynamicVariables: DynamicVariables;
  startSession: (options: StartOptions) => void;
  endSession: () => void | Promise<void>;
  onReady: () => void; onEnded: () => void; onFailure: (message: string) => void;
};

async function postWithRetry(path: string, body?: object) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(path, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(4_000),
      });
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) return response;
    } catch {
      // A lost response may follow a successful bind; retry the identical ID.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error("Session request failed");
}

export async function abortPreparedVoiceSession(sessionId: string) {
  try {
    const response = await postWithRetry(`/api/sessions/${sessionId}/abort`);
    const result = await response.json();
    return response.ok && (result.released === true || result.finished === true);
  } catch { return false; }
}

/** Own every async callback: the React SDK does not await onConnect/onError. */
export function startManagedVoiceSession(options: Controls) {
  let stopped = false;
  let bound = false;
  let binding = false;
  let closing: Promise<void> | null = null;
  const stopSdk = async () => { try { await options.endSession(); } catch { /* server lease stays closed to new starts */ } };
  const timer = setTimeout(() => { void fail("Die Voice-Verbindung konnte nicht rechtzeitig gestartet werden."); }, 30_000);

  function fail(message: string): Promise<void> {
    if (stopped) return closing ?? Promise.resolve();
    stopped = true;
    clearTimeout(timer);
    closing = (async () => {
      await stopSdk();
      const released = await abortPreparedVoiceSession(options.sessionId);
      options.onFailure(`${message}${released ? " Du kannst erneut starten." : " Der Verbindungsabschluss wird noch geprüft. Bitte versuche es später erneut."}`);
    })();
    return closing;
  }

  async function connect(conversationId: string) {
    if (stopped) { await stopSdk(); return; }
    if (binding || bound) return;
    binding = true;
    try {
      const response = await postWithRetry(`/api/sessions/${options.sessionId}/bind`, { conversationId });
      const result = await response.json();
      if (stopped) return; // A late successful response cannot revive an aborted start.
      if (!response.ok || result.bound !== true) throw new Error("Binding failed");
      bound = true;
      clearTimeout(timer);
      options.onReady();
    } catch {
      await fail("Die Voice-Verbindung konnte nicht sicher zugeordnet werden.");
    } finally { binding = false; }
  }

  try {
    options.startSession({
      signedUrl: options.signedUrl, connectionType: "websocket", dynamicVariables: options.dynamicVariables,
      onConnect: ({ conversationId }) => { void connect(conversationId); },
      onError: () => { void fail("Die Voice-Verbindung wurde unterbrochen."); },
      onDisconnect: () => {
        if (stopped) return;
        if (!bound) { void fail("Der Voice-Start wurde abgebrochen."); return; }
        stopped = true;
        clearTimeout(timer);
        options.onEnded();
      },
    });
  } catch {
    void fail("Die Voice-Verbindung konnte nicht gestartet werden.");
  }
  return {
    abort: () => fail("Die Voice-Verbindung wurde beendet."),
    dispose: () => {
      if (bound || stopped) {
        stopped = true;
        clearTimeout(timer);
        return stopSdk();
      }
      return fail("Der Voice-Start wurde abgebrochen.");
    },
  };
}
