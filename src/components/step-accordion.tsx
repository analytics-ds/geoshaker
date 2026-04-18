"use client";
import { useState } from "react";
import type { StepSummary } from "@/lib/types";
import { CheckIcon, PriorityTag } from "./check-icon";

export function StepAccordion({ step, defaultOpen = false }: { step: StepSummary; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const total = step.totalCount;
  const hasFail = step.checks.some((c) => c.status === "fail");
  const hasWarn = step.checks.some((c) => c.status === "warn");
  const dotColor = total === 0
    ? "var(--text-muted)"
    : hasFail
    ? "var(--red)"
    : hasWarn
    ? "var(--orange)"
    : "var(--green)";

  return (
    <div
      className="rounded-[14px] bg-[color:var(--bg-card)] border border-[color:var(--border-default)] overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left min-h-[64px] active:bg-[color:var(--bg-warm)] hover:bg-[color:var(--bg-card-tint)] transition-colors"
        aria-expanded={open}
      >
        <span
          className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-[8px] text-[color:var(--accent)] font-[family-name:var(--font-mono)] font-semibold text-sm tracking-wider"
          style={{ background: "var(--accent-soft)" }}
        >
          {String(step.step).padStart(2, "0")}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] sm:text-base font-bold text-[color:var(--text)]">
            {step.title}
          </span>
          <span className="flex items-center gap-2 mt-1">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dotColor }}
              aria-hidden="true"
            />
            <span className="text-xs text-[color:var(--text-muted)]">
              {step.passCount} sur {total} réussis
            </span>
          </span>
        </span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          className="flex-shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: "var(--text-muted)" }}
          aria-hidden="true"
        >
          <path d="M5 7L10 12L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[color:var(--border-default)] divide-y divide-[color:var(--border-default)]">
          {step.checks.map((c) => (
            <div key={c.id} className="px-4 sm:px-5 py-4 flex gap-3">
              <CheckIcon status={c.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold text-[color:var(--text)]">
                    {c.label}
                  </span>
                  <PriorityTag priority={c.priority} />
                </div>
                <p className="text-sm text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                  {c.detail}
                </p>
                {c.advice && (
                  <p className="text-sm mt-2 p-3 rounded-[8px] bg-[color:var(--bg-warm)] text-[color:var(--text-secondary)] leading-relaxed">
                    <span className="ds-eyebrow block mb-1">À faire</span>
                    {c.advice}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
