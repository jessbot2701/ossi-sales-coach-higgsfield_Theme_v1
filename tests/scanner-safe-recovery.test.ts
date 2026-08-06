import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRecoveryToken } from "@/lib/supabase/recovery-link";

describe("scanner-safe password recovery", () => {
  const page = readFileSync("app/auth/recovery/page.tsx", "utf8");
  const continuation = readFileSync("app/auth/recovery/continue/route.ts", "utf8");

  it("does not consume a recovery token during the initial GET", () => {
    expect(page).toContain('action="/auth/recovery/continue"');
    expect(page).toContain('method="post"');
    expect(page).toContain("Passwort-Link öffnen");
    expect(page).not.toContain("/auth/v1/verify");
  });

  it("uses the recovery token only after an explicit POST", () => {
    expect(continuation).toContain("export async function POST");
    expect(continuation).toContain('verifyUrl.searchParams.set("type", "recovery")');
    expect(continuation).toContain('`${getAppUrl(request)}/set-password`');
    expect(continuation).toContain("NextResponse.redirect(verifyUrl, 303)");
  });

  it("accepts only bounded hexadecimal Supabase token hashes", () => {
    expect(isRecoveryToken("a".repeat(56))).toBe(true);
    expect(isRecoveryToken("A".repeat(56))).toBe(false);
    expect(isRecoveryToken("a".repeat(39))).toBe(false);
    expect(isRecoveryToken("a".repeat(129))).toBe(false);
    expect(isRecoveryToken("not-a-token")).toBe(false);
  });
});
