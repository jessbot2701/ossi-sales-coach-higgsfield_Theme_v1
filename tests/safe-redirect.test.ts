import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-redirect";

describe("safeInternalPath", () => {
  it("keeps local paths including query strings and fragments", () => {
    expect(safeInternalPath("/app/sessions/123?tab=score#details")).toBe("/app/sessions/123?tab=score#details");
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "/%2f%2fevil.example/path",
    "/%5cevil.example/path",
    "/app%0d%0aLocation:%20https://evil.example",
    "%2f%2fevil.example/path",
  ])("rejects unsafe redirect target %s", (target) => {
    expect(safeInternalPath(target)).toBe("/app");
  });

  it("uses the requested fallback for missing targets", () => {
    expect(safeInternalPath(null, "/login")).toBe("/login");
  });
});
