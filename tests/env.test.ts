import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public environment configuration", () => {
  it("uses statically analyzable Next.js public environment references", () => {
    const source = readFileSync("lib/env.ts", "utf8");

    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(source).not.toContain('read("NEXT_PUBLIC_SUPABASE_URL")');
    expect(source).not.toContain('read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")');
  });
});
