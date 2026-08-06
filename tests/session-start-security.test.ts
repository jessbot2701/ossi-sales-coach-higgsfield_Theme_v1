import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(join(process.cwd(), "app/api/sessions/start/route.ts"), "utf8");
const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260720082736_protect_session_start.sql"), "utf8");

describe("session start protection", () => {
  it("requires explicit transcript consent for every session start", () => {
    expect(route).toContain("consent: z.literal(true)");
  });

  it("accepts deterministic database GUIDs for training configuration references", () => {
    expect(route).toContain("trainingTypeId: z.guid()");
    expect(route).toContain("scenarioId: z.guid()");
    expect(route).toContain("focusCriterionId: z.guid().optional()");
  });

  it("rate-limits starts in a central database-backed hourly window", () => {
    expect(route).toContain("SESSION_START_LIMIT_PER_HOUR = 10");
    expect(route).toContain('.gte("created_at", hourlyWindowStart)');
    expect(route).toContain('new ApiError(429');
  });

  it("rejects parallel open sessions even when requests race", () => {
    expect(migration).toMatch(/create unique index coaching_sessions_one_open_per_user_idx[\s\S]*where status in \('created', 'active'\)/);
    expect(route).toContain('insertError?.code === "23505"');
    expect(route).toContain('"session_already_open"');
  });

  it("expires abandoned prepared and implausibly long active sessions", () => {
    expect(route).toContain("CREATED_SESSION_TIMEOUT_MS = 15 * 60 * 1000");
    expect(route).toContain("ACTIVE_SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000");
  });

  it("loads all training versions once and scopes history in the database", () => {
    expect(route).toContain("const [{ data: scenario }, { data: versions }] = await Promise.all");
    expect(route).toContain('.in("training_type_version_id", typeVersionIds)');
    expect(route.match(/from\("training_type_versions"\)/g)).toHaveLength(1);
  });

  it("accepts only the selected visible scenario for the selected training type", () => {
    expect(route).toContain('.eq("id", input.scenarioId)');
    expect(route).toContain('.eq("training_type_id", input.trainingTypeId)');
    expect(route).toContain('.eq("is_user_selectable", true)');
    expect(route).not.toContain('.eq("slug", "coach_surprise")');
  });

  it("resolves the selected occasion server-side and stores the effective value", () => {
    expect(route).toContain("conversationOccasion: z.string().optional()");
    expect(route).toContain("resolveConversationOccasion({");
    expect(route).toContain('"conversation_occasion_required"');
    expect(route).toContain('"conversation_occasion_too_long"');
    expect(route).toContain("conversation_occasion: conversationOccasion");
    expect(route).toMatch(/scenario_snapshot:[\s\S]*conversationOccasion/);
  });
});
