import Image from "next/image";

export type OssiPortraitVariant = "hero" | "heading" | "auth" | "session";

const sizes: Record<OssiPortraitVariant, string> = {
  hero: "100vw",
  heading: "(max-width: 760px) 112px, 260px",
  auth: "(max-width: 760px) 128px, 360px",
  session: "(max-width: 760px) 104px, 220px",
};

type OssiPortraitProps = {
  variant: OssiPortraitVariant;
  decorative?: boolean;
};

export function OssiPortrait({
  variant,
  decorative = false,
}: OssiPortraitProps) {
  return (
    <div
      className={`ossi-portrait ossi-portrait-${variant}`}
      data-testid={`ossi-portrait-${variant}`}
    >
      <span className="ossi-portrait-halo" aria-hidden="true" />
      <Image
        className="ossi-portrait-image"
        src="/assets/hero-final.webp"
        width={1344}
        height={768}
        sizes={sizes[variant]}
        loading="eager"
        alt={decorative ? "" : "Ossi, der AI Sales Coach"}
      />
    </div>
  );
}
