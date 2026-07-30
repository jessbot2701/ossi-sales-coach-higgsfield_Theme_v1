import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260719210605_init_coaching_platform.sql"), "utf8");
const activeAccessMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260720082724_enforce_active_user_access.sql"), "utf8");
const improvementsMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260727144417_add_category_improvements.sql"), "utf8");
const sessionGoalMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260727151317_add_session_learning_goal.sql"), "utf8");
const expansionMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260729141014_expand_session_improvements_and_training_occasions.sql"), "utf8");
const storagePrecheckMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260729151500_add_storage_ownership_precheck.sql"), "utf8");

describe("database security contract", () => {
  it("enables RLS on every exposed application table", () => {
    const tables = ["profiles", "app_roles", "training_types", "training_type_versions", "scenarios", "competencies", "evaluation_criteria", "coaching_sessions", "session_evaluations", "user_competency_progress", "learning_profiles"];
    for (const table of tables) expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it("keeps role and training writes away from authenticated users", () => {
    expect(migration).toContain("revoke all on all tables in schema public from anon, authenticated");
    expect(migration).not.toMatch(/grant (insert|delete).*app_roles.*authenticated/i);
    expect(migration).not.toMatch(/grant (insert|update|delete).*training_types.*authenticated/i);
  });

  it("contains score, cascade, version and retention guarantees", () => {
    expect(migration).toContain("score between 1 and 5");
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("unique (training_type_id, version_number)");
    expect(migration).toContain("private.purge_expired_transcripts");
    expect(migration).toContain("transcript_deleted_at = now()");
  });

  it("uses a private, payload-free webhook receipt table", () => {
    expect(migration).toContain("create table private.webhook_receipts");
    expect(migration).not.toMatch(/create table private\.webhook_receipts[\s\S]*?payload jsonb[\s\S]*?;/i);
  });

  it("enforces complete, ranked category improvements and session strengths", () => {
    for (const column of ["alternative_formulation", "improvement_evidence", "improvement_priority"]) {
      expect(improvementsMigration).toContain(`add column ${column}`);
    }
    expect(improvementsMigration).toContain("session_evaluations_improvement_complete");
    expect(improvementsMigration).toContain("session_evaluations_improvement_priority_idx");
    expect(improvementsMigration).toContain("set recommendation = null");
    expect(improvementsMigration).toContain("add column strengths jsonb");
    expect(improvementsMigration).toContain("jsonb_array_length(strengths) <= 3");
    expect(sessionGoalMigration).toContain("add column next_learning_goal text");
    expect(expansionMigration).toContain("session_evaluations_low_score_improvement_required");
    expect(expansionMigration).toContain("score not between 1 and 3");
    expect(expansionMigration).toMatch(/improvement_priority is null[\s\S]*improvement_priority between 1 and 3/);
  });

  it("seeds only explicitly selectable conversation occasions", () => {
    expect(expansionMigration).toContain("add column is_user_selectable boolean");
    expect(expansionMigration).toContain("'customer_event_invitation'");
    expect(expansionMigration).toContain("'Einladung zu einer Kundenveranstaltung'");
    expect(expansionMigration).toContain("scenarios_user_selectable_idx");
  });

  it("exposes the storage ownership precheck only to the service role", () => {
    expect(storagePrecheckMigration).toContain("security definer");
    expect(storagePrecheckMigration).toContain("set search_path = ''");
    expect(storagePrecheckMigration).toContain("from storage.objects");
    expect(storagePrecheckMigration).toContain("revoke all on function public.user_has_storage_objects(uuid) from public, anon, authenticated");
    expect(storagePrecheckMigration).toContain("grant execute on function public.user_has_storage_objects(uuid) to service_role");
  });

  it("seeds an agent-selected surprise scenario", () => {
    expect(migration).toContain("'coach_surprise', 'Ossi überrascht dich'");
    expect(migration).toContain('"selection_mode":"agent_choice"');
    expect(migration).toContain('"reveal_before_call":false');
    expect(migration).not.toContain("scenarios_difficulty");
  });

  it("removes all Data API access from inactive users and admins", () => {
    expect(activeAccessMigration).toMatch(/create or replace function private\.is_admin\(\)[\s\S]*join public\.profiles profile[\s\S]*profile\.is_active/);
    const policies = [
      "profiles_read_self_or_admin",
      "app_roles_read_self_or_admin",
      "training_types_read_active_or_admin",
      "training_versions_read_active_or_admin",
      "scenarios_read_active_or_admin",
      "competencies_read_all",
      "criteria_read_active_or_admin",
      "sessions_read_own_or_admin",
      "evaluations_read_own_or_admin",
      "progress_read_own_or_admin",
      "learning_profiles_read_own_or_admin",
    ];
    for (const policy of policies) {
      expect(activeAccessMigration).toMatch(new RegExp(`create policy ${policy}[\\s\\S]*?private\\.is_active_user\\(\\)[\\s\\S]*?;`));
    }
  });
});
