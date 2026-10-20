import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(join(process.cwd(), "app/api/sessions/start/route.ts"), "utf8");

describe("session start protection", () => {
  it("requires explicit transcript consent for every session start", () => {
    expect(route).toContain("consent: z.literal(true)");
  });

  it("accepts deterministic database GUIDs for training configuration references", () => {
    expect(route).toContain("trainingTypeId: z.guid()");
    expect(route).toContain("scenarioId: z.guid()");
    expect(route).toContain("focusCriterionId: z.guid().optional()");
  });

  it("loads all training versions once and scopes history in the database", () => {
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
    expect(route).toMatch(/p_snapshot:[\s\S]*conversationOccasion/);
  });
});
