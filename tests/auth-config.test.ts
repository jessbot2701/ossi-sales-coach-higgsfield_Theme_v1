import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");

function section(name: string) {
  const marker = `[${name}]`;
  const start = config.indexOf(marker);
  if (start < 0) throw new Error(`Missing TOML section ${marker}`);
  const remainder = config.slice(start + marker.length);
  const nextSection = remainder.search(/^\[/m);
  return nextSection < 0 ? remainder : remainder.slice(0, nextSection);
}

describe("invite-only Supabase auth configuration", () => {
  it("disables general and email self-registration", () => {
    expect(section("auth")).toMatch(/^enable_signup = false$/m);
    expect(section("auth.email")).toMatch(/^enable_signup = false$/m);
  });

  it("keeps anonymous sign-ins disabled", () => {
    expect(section("auth")).toMatch(/^enable_anonymous_sign_ins = false$/m);
  });
});
