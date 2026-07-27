import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { selectSessionImprovements } from "@/lib/coaching/evaluation-integrity";

const complete = (priority: number) => ({
  recommendation: `Verbesserung ${priority}`,
  alternative_formulation: `Alternative ${priority}`,
  improvement_evidence: `Beleg ${priority} mit ausreichend langem Text`,
  improvement_priority: priority,
});

describe("session improvement presentation", () => {
  it("shows zero improvements for no data and legacy recommendations", () => {
    expect(selectSessionImprovements([])).toEqual([]);
    expect(selectSessionImprovements([{
      recommendation: "Alte globale Empfehlung",
      alternative_formulation: null,
      improvement_evidence: null,
      improvement_priority: null,
    }])).toEqual([]);
  });

  it("shows one complete improvement", () => {
    expect(selectSessionImprovements([complete(1)])).toEqual([complete(1)]);
  });

  it("orders and limits the overview to three improvements", () => {
    const result = selectSessionImprovements([
      complete(3),
      complete(1),
      complete(2),
      { ...complete(3), recommendation: "Vierter Vorschlag" },
    ]);
    expect(result.map((item) => item.improvement_priority)).toEqual([1, 2, 3]);
    expect(result).toHaveLength(3);
  });

  it("renders the four conclusion areas, category links and improvement details", () => {
    const page = readFileSync(join(process.cwd(), "app/app/sessions/[id]/page.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "app/app.css"), "utf8");

    for (const label of [
      "Kurzfazit",
      "Beobachtete Stärken",
      "Die wichtigsten Verbesserungshebel",
      "Nächstes Lernziel",
      "Dieses Ziel trainieren",
      "Alternative",
    ]) {
      expect(page).toContain(label);
    }
    expect(page).toContain("#evaluation-category-");
    expect(page).toContain("improvementCriterionIds.has");
    expect(page).toContain("session.next_learning_goal");
    expect(styles).toContain(".coaching-conclusion-grid");
    expect(styles).toContain(".category-improvement");
    expect(styles).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.coaching-conclusion-grid\s*\{\s*grid-template-columns:\s*1fr;/);
  });
});
