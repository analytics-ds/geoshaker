import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="ds-logo" aria-label="GEOshaker par datashake, retour à l’accueil">
      <span className="flex flex-col leading-tight">
        <span className="ds-logo-name">GEOshaker</span>
        <span className="ds-logo-suffix">
          <span>par</span>
          <span className="ds-logo-ds" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
