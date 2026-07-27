import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HowItWorksPhone } from "../components/how-it-works-phone";
import { PortalHeading } from "../components/portal-heading";

const baseProps = {
  eyebrow: "Test",
  title: "Überschrift",
  description: "Beschreibung",
};

describe("PortalHeading", () => {
  it("renders the standard Ossi portrait by default", () => {
    const markup = renderToStaticMarkup(createElement(PortalHeading, baseProps));

    expect(markup).toContain('data-testid="ossi-portrait-heading"');
    expect(markup).not.toContain("portal-heading-custom-visual");
  });

  it("renders an optional visual instead of the standard portrait", () => {
    const markup = renderToStaticMarkup(
      createElement(PortalHeading, {
        ...baseProps,
        visual: createElement("div", { "data-testid": "custom-visual" }, "Phone"),
      }),
    );

    expect(markup).toContain('data-testid="custom-visual"');
    expect(markup).toContain("portal-heading-custom-visual");
    expect(markup).not.toContain('data-testid="ossi-portrait-heading"');
  });

  it("reuses the training phone visual for the help-page preview", () => {
    const markup = renderToStaticMarkup(createElement(HowItWorksPhone));

    expect(markup).toContain("voice-phone ready help-phone-preview");
    expect(markup).toContain("voice-phone-statusbar");
    expect(markup).toContain("Ossi ist bereit.");
    expect(markup).toContain("Du übernimmst den Vertrieb. Ossi spielt dein Gegenüber.");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("<button");
  });
});
