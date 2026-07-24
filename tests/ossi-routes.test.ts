import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf-8");

describe("Ossi route adoption", () => {
  it("uses the shared Ossi heading on protected content pages", () => {
    for (const path of [
      "app/app/training/page.tsx",
      "app/app/sessions/[id]/page.tsx",
      "app/admin/users/page.tsx",
      "app/admin/sessions/page.tsx",
    ]) {
      expect(source(path)).toContain("<PortalHeading");
    }
  });

  it("uses the dedicated Ossi dashboard hero", () => {
    const dashboard = source("app/app/page.tsx");

    expect(dashboard).toContain('className="dashboard-hero"');
    expect(dashboard).toContain('<OssiPortrait variant="heading"');
  });

  it("shows Ossi on both authentication pages", () => {
    expect(source("app/login/page.tsx")).toContain(
      '<OssiPortrait variant="auth"',
    );
    expect(source("app/set-password/page.tsx")).toContain(
      '<OssiPortrait variant="auth"',
    );
  });

  it("shows the hero portrait on the public landing page", () => {
    expect(source("app/page.tsx")).toContain('<OssiPortrait variant="hero"');
  });
});
