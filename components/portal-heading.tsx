import type { ReactNode } from "react";

import { OssiPortrait, type OssiPortraitVariant } from "./ossi-portrait";

type PortalHeadingProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  visual?: ReactNode;
  portraitVariant?: Extract<OssiPortraitVariant, "heading" | "session">;
};

export function PortalHeading({
  eyebrow,
  title,
  description,
  actions,
  visual,
  portraitVariant = "heading",
}: PortalHeadingProps) {
  const hasCustomVisual = visual !== undefined;

  return (
    <div
      className={`portal-heading portal-heading-with-ossi${
        actions ? " portal-heading-actions" : ""
      }${
        hasCustomVisual ? " portal-heading-custom-visual" : ""
      }`}
    >
      <div className="portal-heading-copy">
        <p className="eyebrow"><span /> {eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
      {hasCustomVisual ? (
        <div className="portal-heading-visual">{visual}</div>
      ) : (
        <OssiPortrait variant={portraitVariant} decorative />
      )}
    </div>
  );
}
