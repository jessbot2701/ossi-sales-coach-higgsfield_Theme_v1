import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const landing = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");

describe("landing-page orientation content", () => {
  it("names the configured scenario examples", () => {
    for (const scenario of [
      "Offener Entscheider",
      "Skeptischer SAP-Leiter",
      "Zentrale unter Zeitdruck",
    ]) {
      expect(landing).toContain(`"${scenario}"`);
    }

    expect(landing).toContain("<p>Beispiele:</p>");
    expect(landing).toContain('aria-label="Beispielszenarien"');
  });

  it("names all six evaluation criteria", () => {
    for (const criterion of [
      "Gesprächseröffnung",
      "Fragetechnik und Bedarfsermittlung",
      "Nutzenargumentation",
      "Einwandbehandlung",
      "Abschluss und Terminsteuerung",
      "Sprachwirkung und Lösungsorientierung",
    ]) {
      expect(landing).toContain(`"${criterion}"`);
    }

    expect(landing).toContain("1–5 Punkte · nur wenn beobachtbar");
  });
});
