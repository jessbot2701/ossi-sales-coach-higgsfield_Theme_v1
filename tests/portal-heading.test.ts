import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
});
