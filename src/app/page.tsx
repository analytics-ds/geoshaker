import { Logo } from "@/components/logo";
import { AuditApp } from "@/components/audit-app";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full border-b border-[color:var(--border-default)] bg-[color:var(--bg)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="ds-pixels" aria-hidden="true" />
            <Logo />
          </div>
          <a
            href="https://datashake.fr"
            target="_blank"
            rel="noopener"
            className="ds-eyebrow hidden sm:inline"
            style={{ color: "var(--text-muted)" }}
          >
            datashake.fr
          </a>
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 py-10 sm:py-14">
        <AuditApp />
      </main>

      <footer className="w-full border-t border-[color:var(--border-default)] bg-[color:var(--bg)] mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="text-sm text-[color:var(--text-muted)]">
            GEOshaker · outil gratuit par datashake · conférence GEO, 5 mai 2026
          </span>
          <a
            href="https://datashake.fr"
            target="_blank"
            rel="noopener"
            className="ds-eyebrow"
            style={{ color: "var(--text-muted)" }}
          >
            Agence SEO · datashake
          </a>
        </div>
      </footer>
    </div>
  );
}
