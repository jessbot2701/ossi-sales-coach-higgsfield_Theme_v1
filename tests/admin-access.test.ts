import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/route.ts"), "utf8");

describe("admin user access changes", () => {
  it("synchronizes profile activation with the Supabase Auth ban", () => {
    expect(route).toContain('ban_duration: "876000h"');
    expect(route).toContain('ban_duration: "none"');
    expect(route).toContain('update({ is_active: false })');
    expect(route).toContain('update({ is_active: true })');
  });
});
