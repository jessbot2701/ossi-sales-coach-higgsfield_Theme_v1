import type { ReactNode } from "react";

import { OssiPortrait, type OssiPortraitVariant } from "./ossi-portrait";

type PortalHeadingProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  portraitVariant?: Extract<OssiPortraitVariant, "heading" | "session">;
};

export function PortalHeading({
  eyebrow,
  title,
  description,
  actions,
  portraitVariant = "heading",
}: PortalHeadingProps) {
  return (
    <div
      className={`portal-heading portal-heading-with-ossi${
        actions ? " portal-heading-actions" : ""
      }`}
    >
      <div className="portal-heading-copy">
        <p className="eyebrow"><span /> {eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
      <OssiPortrait variant={portraitVariant} decorative />
    </div>
  );
}
