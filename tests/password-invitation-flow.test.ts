import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readImplicitSession } from "@/lib/supabase/implicit-session";

describe("password invitation flow", () => {
  it("sends admin invitations directly to the client-side password page", () => {
    const route = readFileSync("app/api/admin/invitations/route.ts", "utf8");

    expect(route).toContain('redirectTo: `${getAppUrl(request)}/set-password`');
    expect(route).not.toContain("/auth/callback?next=/set-password");
  });

  it("reads the implicit Supabase session without accepting incomplete fragments", () => {
    expect(readImplicitSession("#access_token=access-123&refresh_token=refresh-456&type=invite")).toEqual({
      accessToken: "access-123",
      refreshToken: "refresh-456",
    });
    expect(readImplicitSession("#access_token=access-123&type=invite")).toBeNull();
    expect(readImplicitSession("")).toBeNull();
  });

  it("restores the invitation session before allowing a password update", () => {
    const form = readFileSync("components/set-password-form.tsx", "utf8");

    expect(form).toContain("readImplicitSession(window.location.hash)");
    expect(form).toContain("auth.setSession");
    expect(form).toContain("disabled={loading || preparingLink}");
    expect(form).toContain("window.history.replaceState");
  });

  it("keeps password recovery on the PKCE callback flow", () => {
    const login = readFileSync("components/login-form.tsx", "utf8");

    expect(login).toContain("/auth/callback?next=/set-password");
  });
});
