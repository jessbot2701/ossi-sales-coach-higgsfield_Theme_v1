import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf-8");

describe("Ossi theme", () => {
  it("centralizes the selected portrait and portal heading", () => {
    const portrait = source("components/ossi-portrait.tsx");
    const heading = source("components/portal-heading.tsx");

    expect(portrait).toContain("/assets/hero-final.webp");
    expect(portrait).toContain("data-testid={`ossi-portrait-${variant}`}");
    expect(portrait).toContain('alt={decorative ? "" : "Ossi, der AI Sales Coach"}');
    expect(heading).toContain("<OssiPortrait variant={portraitVariant} decorative");
    expect(heading).toContain("portal-heading-copy");
    expect(heading).toContain("<div");
    expect(heading).not.toContain("<header");
    expect(heading).toContain('<p className="eyebrow"><span /> {eyebrow}</p>');
  });

  it("defines the approved cinematic Ossi public tokens", () => {
    const globalStyles = source("styles.css");

    expect(globalStyles).toContain("--bg: oklch(0.14 0.025 255)");
    expect(globalStyles).toContain("--bg-deep: oklch(0.095 0.018 255)");
    expect(globalStyles).toContain("--accent: oklch(0.73 0.14 225)");
    expect(globalStyles).toContain(".button-primary");
    expect(globalStyles).toContain(".hero-image-scroll .ossi-portrait");
  });

  it("defines dark portal surfaces and never hides mobile Ossi", () => {
    const appStyles = source("app/app.css");

    expect(appStyles).toContain("var(--midnight-page)");
    expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.ossi-portrait-heading/);
    expect(appStyles).not.toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.ossi-portrait[^}]*display:\s*none/,
    );
  });

  it("keeps mobile heading actions clear of the Ossi portrait", () => {
    const appStyles = source("app/app.css");
    const compactMobileStyles = appStyles.slice(
      appStyles.indexOf("@media (max-width: 480px)"),
    );
    const genericPortraitRule = compactMobileStyles.indexOf(
      ".portal-heading .ossi-portrait-heading,",
    );
    const actionPortraitRule = compactMobileStyles.indexOf(
      ".portal-heading-actions .ossi-portrait-heading,",
    );

    expect(genericPortraitRule).toBeGreaterThanOrEqual(0);
    expect(actionPortraitRule).toBeGreaterThan(genericPortraitRule);
    expect(compactMobileStyles.slice(actionPortraitRule)).toContain(
      ".portal-heading-actions .ossi-portrait-session { top: 18px; bottom: auto; height: 104px; }",
    );
    expect(appStyles).toMatch(
      /@media \(max-width: 480px\)[\s\S]*\.portal-heading-actions \{ padding-bottom: 78px; \}[\s\S]*\.page-actions \{ flex-direction: row; flex-wrap: wrap; gap: 8px; \}/,
    );
  });
});
