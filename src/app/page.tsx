import { Logo } from "@/components/logo";
import { AuditApp } from "@/components/audit-app";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <header className="w-full border-b border-[color:var(--border-default)] bg-[color:var(--bg)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 py-10 sm:py-14">
        <AuditApp />
      </main>
    </div>
  );
}
