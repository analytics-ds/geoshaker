import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="ds-logo" aria-label="GEOshaker, retour à l’accueil">
      <span className="ds-logo-mark" aria-hidden="true">
        <span className="sq sq1" />
        <span className="sq sq2" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="ds-logo-name">GEOshaker</span>
        <span className="ds-logo-suffix">par datashake</span>
      </span>
    </Link>
  );
}
