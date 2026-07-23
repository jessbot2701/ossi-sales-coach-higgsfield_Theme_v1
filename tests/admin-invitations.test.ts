import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapInviteAuthError } from "@/lib/admin-invitations";

describe("admin invitations", () => {
  it("maps Supabase email limits to a clear 429 API error", () => {
    const error = mapInviteAuthError({ status: 429, code: "over_email_send_rate_limit" });

    expect(error).toMatchObject({
      status: 429,
      code: "invite_rate_limited",
      message: "Das stündliche E-Mail-Limit ist erreicht. Bitte versuche es später erneut.",
    });
  });

  it("maps existing users to a conflict without exposing provider errors", () => {
    const error = mapInviteAuthError({ status: 422, code: "user_already_exists" });

    expect(error).toMatchObject({ status: 409, code: "invite_user_exists" });
  });

  it("prevents repeated submits and exposes accessible progress feedback", () => {
    const source = readFileSync("components/admin-users.tsx", "utf8");

    expect(source).toContain("if (inviteInFlight.current) return");
    expect(source).toContain("disabled={inviting}");
    expect(source).toContain("Einladung wird versendet …");
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
  });
});
