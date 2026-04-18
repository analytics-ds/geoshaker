export type Priority = "BLOQUANT" | "HAUTE" | "MOYENNE";
export type Status = "pass" | "fail" | "warn" | "skip";

export type CheckId =
  | "1.1" | "1.2" | "1.3" | "1.4" | "1.5"
  | "2.1" | "2.2" | "2.3" | "2.4"
  | "3.1" | "3.2" | "3.3" | "3.4" | "3.5" | "3.6"
  | "4.1" | "4.2" | "4.3"
  | "5.1" | "5.2" | "5.3"
  | "6a" | "6b" | "6c" | "6d" | "6e" | "6f" | "6g" | "6h"
  | "7.1";

export type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Check {
  id: CheckId;
  step: StepId;
  label: string;
  priority: Priority;
  status: Status;
  detail: string;
  advice?: string;
}

export interface StepSummary {
  step: StepId;
  title: string;
  checks: Check[];
  passCount: number;
  totalCount: number;
}

export type SiteType = "ecommerce" | "leadgen" | "blog" | "service" | "vitrine";

export interface AuditResult {
  url: string;
  normalizedUrl: string;
  score: number;
  siteType?: SiteType;
  siteTypeLabel?: string;
  checks: Check[];
  steps: StepSummary[];
  durationMs: number;
  timestamp: string;
  error?: string;
}

export interface FetchOutcome {
  ok: boolean;
  status?: number;
  url: string;
  body?: string;
  ttfbMs?: number;
  contentType?: string;
  error?: string;
}
