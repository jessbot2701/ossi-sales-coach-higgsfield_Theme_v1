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
});
