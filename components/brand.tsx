import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Ossi Startseite">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand-copy"><strong>OSSI</strong><small>AI SALES COACH</small></span>
    </Link>
  );
}
