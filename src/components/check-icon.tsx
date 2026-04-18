import type { Check } from "@/lib/types";

export function CheckIcon({ status }: { status: Check["status"] }) {
  if (status === "pass") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white flex-shrink-0"
        style={{ background: "var(--green)" }}
        aria-label="Réussi"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 7L5.5 9.5L11 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (status === "fail") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white flex-shrink-0"
        style={{ background: "var(--red)" }}
        aria-label="Échec"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (status === "warn") {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white flex-shrink-0"
        style={{ background: "var(--orange)" }}
        aria-label="À vérifier"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 3V8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="7" cy="10.5" r="1" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0"
      style={{ background: "var(--bg-warm)", color: "var(--text-muted)" }}
      aria-label="Non testable"
    >
      <span className="text-xs font-semibold">·</span>
    </span>
  );
}

export function PriorityTag({ priority }: { priority: Check["priority"] }) {
  const map = {
    BLOQUANT: { bg: "var(--red-bg)", color: "var(--red)" },
    HAUTE: { bg: "var(--orange-bg)", color: "var(--orange)" },
    MOYENNE: { bg: "var(--accent-soft)", color: "var(--accent)" },
  } as const;
  const c = map[priority];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] font-[family-name:var(--font-mono)]"
      style={{ background: c.bg, color: c.color }}
    >
      {priority}
    </span>
  );
}
