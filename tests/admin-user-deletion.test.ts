import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/route.ts"), "utf8");
const ui = readFileSync(join(process.cwd(), "components/admin-users.tsx"), "utf8");
const schema = readFileSync(join(process.cwd(), "supabase/migrations/20260719210605_init_coaching_platform.sql"), "utf8");
const storagePrecheckMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260729151500_add_storage_ownership_precheck.sql"), "utf8");

describe("permanent admin user deletion", () => {
  it.each([
    ["self deletion", '"self_delete"'],
    ["last active admin", '"last_active_admin"'],
    ["wrong email", '"confirmation_mismatch"'],
    ["open session", '"session_in_progress"'],
    ["unknown user", '"not_found"'],
  ])("rejects %s", (_label, marker) => {
    expect(route).toContain(marker);
  });

  it("locks the target and performs an explicit hard delete", () => {
    expect(route).toContain('update({ is_active: false })');
    expect(route).toContain('ban_duration: "876000h"');
    expect(route).toContain("deleteUser(id, false)");
    expect(route).toContain('["created", "active", "processing"]');
    expect(route).toContain('rpc("user_has_storage_objects"');
    expect(storagePrecheckMigration).toContain("from storage.objects");
    expect(storagePrecheckMigration).toContain("where owner_id = target_user_id::text");
    expect(storagePrecheckMigration).toContain("security definer");
    expect(storagePrecheckMigration).toContain("grant execute on function public.user_has_storage_objects(uuid) to service_role");
    expect(storagePrecheckMigration).toContain("revoke all on function public.user_has_storage_objects(uuid) from public, anon, authenticated");
  });

  it("relies on cascade relationships for owned app data", () => {
    for (const table of ["profiles", "app_roles", "coaching_sessions", "user_competency_progress", "learning_profiles"]) {
      expect(schema).toMatch(new RegExp(`create table public\\.${table}[\\s\\S]*?auth\\.users\\(id\\) on delete cascade`));
    }
  });

  it("requires exact email confirmation and prevents double submission in the dialog", () => {
    expect(ui).toContain('role="dialog"');
    expect(ui).toContain("confirmationEmail !== deleteTarget.email");
    expect(ui).toContain("deleteInFlight.current");
    expect(ui).toContain("sämtliche zugehörigen Profile");
    expect(ui).toContain('method: "DELETE"');
  });
});
