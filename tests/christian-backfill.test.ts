import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(join(process.cwd(), "scripts/backfill-christian-20260729.mts"), "utf8");

describe("Christian sessions backfill", () => {
  it("targets exactly three approved sessions and sixteen category improvements", () => {
    expect(script.match(/"[\da-f]{8}-[\da-f-]{27}": \{\r?\n    summary:/g)).toHaveLength(3);
    expect(script.match(/criterionId:/g)).toHaveLength(17);
    expect(script).toContain("if (improvementCount !== 16)");
  });

  it("updates only summaries and improvement fields and verifies scores and transcripts", () => {
    expect(script).toContain(".update({ summary: backfill.summary })");
    expect(script).toContain("recommendation: improvement.recommendation");
    expect(script).toContain("alternative_formulation: improvement.alternative");
    expect(script).toContain("improvement_evidence: improvement.evidence");
    expect(script).not.toMatch(/\.update\(\{[\s\S]{0,160}\bscore:/);
    expect(script).not.toMatch(/\.update\(\{[\s\S]{0,160}\btranscript:/);
    expect(script).toContain("Transcript changed");
    expect(script).toContain("Scores changed");
  });
});
