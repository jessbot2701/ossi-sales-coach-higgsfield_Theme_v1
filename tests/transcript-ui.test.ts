import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  join(process.cwd(), "app/app/sessions/[id]/page.tsx"),
  "utf8",
);
const styles = readFileSync(join(process.cwd(), "app/app.css"), "utf8");

describe("phased transcript UI", () => {
  it("renders all phase dividers and phase-derived agent labels", () => {
    for (const label of ["Coach-Start", "Rollenspiel", "Coach-Auswertung"]) {
      expect(page).toContain(label);
    }
    expect(page).toContain('"Ossi / Kundenrolle"');
    expect(page).toContain('"Ossi / Coach"');
    expect(page).toContain("analyzeTranscriptPhases");
  });

  it("styles dividers and keeps transcript bubbles responsive", () => {
    expect(styles).toContain(".transcript-phase-divider");
    expect(styles).toContain(".transcript-phase-divider.roleplay");
    expect(styles).toMatch(/@media\s*\(max-width:\s*480px\)[\s\S]*?\.transcript-turn\s*\{\s*max-width:\s*96%;/);
  });
});
