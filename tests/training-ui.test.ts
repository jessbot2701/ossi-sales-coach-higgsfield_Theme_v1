import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const launcher = readFileSync(join(process.cwd(), "components/training-launcher.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "app/app.css"), "utf8");

describe("training launcher UI", () => {
  it("renders accessible training type cards instead of a dropdown", () => {
    expect(launcher).toContain('<fieldset className="training-type-field"><legend>Trainingsart</legend>');
    expect(launcher).toContain('type="radio" name="trainingType"');
    expect(launcher).toContain("type.description");
    expect(launcher).not.toContain('<select id="trainingType"');
    expect(styles).toContain(".training-type-option.selected");
  });

  it("keeps session start disabled until linked consent is checked", () => {
    expect(launcher).toContain("const [consent, setConsent] = useState(false)");
    expect(launcher).toContain('aria-describedby="transcript-consent-description transcript-consent-status"');
    expect(launcher).toContain("Ohne Einwilligung kann keine Voice-Session gestartet werden.");
    expect(launcher).toContain("Auswertung, Lernfortschritt und historische Personalisierung");
    expect(launcher).toContain("disabled={!consent || preparing");
    expect(styles).toContain(".consent-field.confirmed");
  });

  it("shows Ossi with the shared portrait and distinct ready, live, and connecting states", () => {
    expect(launcher).toContain('<OssiPortrait variant="session" decorative />');
    expect(launcher).not.toContain("ozzy-surreal");
    expect(launcher).toContain('status === "connecting" ? "connecting" : status === "connected" ? "connected" : "ready"');
    expect(styles).toMatch(/\.voice-status\.ready i,\s*\.voice-status\.connected i \{[^}]*var\(--success\)/);
    expect(styles).toMatch(/\.voice-status\.connecting i \{[^}]*#f1bd58/);
  });

  it("stacks the training layout and preserves the portrait on narrow screens", () => {
    expect(styles).toMatch(/@media \(max-width: 960px\)[\s\S]*\.training-config,\s*\.voice-session \{ grid-column: 1 \/ -1; \}/);
    expect(styles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.voice-portrait \{ width: 90%; height: 76%; \}/);
  });
});
