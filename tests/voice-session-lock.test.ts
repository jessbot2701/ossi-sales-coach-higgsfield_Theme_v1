import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("app-wide voice session guard", () => {
  it("provides one conversation context to app and admin layouts", () => {
    const provider = source("components/app-conversation-provider.tsx");
    expect(source("app/app/layout.tsx")).toContain("<AppConversationProvider>");
    expect(source("app/admin/layout.tsx")).toContain("<AppConversationProvider>");
    expect(provider).toContain('status === "connecting" || status === "connected"');
  });

  it("blocks app actions and warns on browser navigation", () => {
    const provider = source("components/app-conversation-provider.tsx");
    expect(provider).toContain("onClickCapture={blockClick}");
    expect(provider).toContain("onKeyDownCapture={blockKeyboard}");
    expect(provider).toContain('window.addEventListener("beforeunload"');
    expect(provider).toContain('window.addEventListener("popstate"');
    expect(provider).toContain("window.confirm(NAVIGATION_WARNING)");
  });

  it("keeps hangup and logout available and logout ends the call first", () => {
    const launcher = source("components/training-launcher.tsx");
    const logout = source("components/logout-button.tsx");
    expect(launcher).toContain('data-voice-session-allowed="true"');
    expect(launcher).toContain("disabled={isLocked}");
    expect(logout).toContain('data-voice-session-allowed="true"');
    expect(logout.indexOf("endSession()")).toBeLessThan(logout.indexOf("auth.signOut()"));
  });
});
