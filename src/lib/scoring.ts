import type { Check, Priority, StepId, StepSummary, AuditResult, SiteType, CheckId } from "./types";
import { labelSiteType } from "./site-type";

const PRIORITY_WEIGHT: Record<Priority, number> = {
  BLOQUANT: 3,
  HAUTE: 2,
  MOYENNE: 1,
};

const STATUS_CREDIT: Record<Check["status"], number> = {
  pass: 1,
  warn: 0.3,
  fail: 0,
  skip: 0,
};

// Checks dont l echec rend l audit quasiment nul : l acces des IA.
// Si une IA est bloquée, le site ne peut pas être cité, quel que soit le reste.
const FATAL_CHECK_IDS: CheckId[] = ["1.1", "1.2", "1.3", "1.4", "1.5"];

// Checks specifiquement GEO (au-dela du SEO classique) : ponderes plus lourd.
// Ce sont eux qui font la difference pour etre lu et cite par les moteurs IA,
// et c est precisement la couche que les sites "bien faits en SEO" negligent.
const GEO_CORE_IDS = new Set<CheckId>([
  "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", // donnees structurees
  "5.1", "5.2", "5.3",                       // llms.txt
  "6i", "6j",                                // OpenGraph/Twitter, FAQ
  "7.1",                                     // version EN
]);
const GEO_WEIGHT_BOOST = 1.6;

// Fondations GEO : sans elles, un site n est pas "GEO-ready" meme avec un SEO
// classique impeccable. Si 3+ fondations manquent, le score est plafonne.
const GEO_FOUNDATIONS: Array<{ label: string; achieved: (by: Map<CheckId, Check>) => boolean }> = [
  { label: "llms.txt", achieved: (m) => m.get("5.1")?.status === "pass" },
  { label: "JSON-LD complet", achieved: (m) => m.get("3.1")?.status === "pass" && m.get("3.4")?.status === "pass" },
  { label: "FAQ structurée", achieved: (m) => m.get("6j")?.status === "pass" },
  { label: "OpenGraph/Twitter", achieved: (m) => m.get("6i")?.status === "pass" },
  { label: "version EN", achieved: (m) => m.get("7.1")?.status === "pass" },
];
const GEO_CAP = 49;

export const STEP_TITLES: Record<StepId, string> = {
  1: "Robots.txt et accès des IA",
  2: "Rendu sans JavaScript",
  3: "Données structurées (JSON-LD)",
  4: "Temps de réponse et cache serveur",
  5: "Fichier llms.txt",
  6: "Structure on-page et crawl",
  7: "Version internationale",
};

export function computeScore(checks: Check[]): number {
  let earned = 0;
  let max = 0;
  for (const c of checks) {
    if (c.status === "skip") continue;
    let w = PRIORITY_WEIGHT[c.priority];
    if (GEO_CORE_IDS.has(c.id)) w *= GEO_WEIGHT_BOOST;
    max += w;
    earned += w * STATUS_CREDIT[c.status];
  }
  if (max === 0) return 0;
  let score = Math.round((earned / max) * 100);

  // Penalite fatale : si une ou plusieurs IA sont bloquées, le site ne peut pas être cité.
  const fatalFails = checks.filter(
    (c) => (FATAL_CHECK_IDS as readonly string[]).includes(c.id) && c.status === "fail"
  ).length;
  if (fatalFails > 0) {
    // 1 IA bloquée → cap 30, 2 → 15, 3+ → 5
    const cap = fatalFails >= 3 ? 5 : fatalFails === 2 ? 15 : 30;
    score = Math.min(score, cap);
  }

  // Plafond GEO-readiness : un bon SEO classique ne suffit pas. Si la couche
  // GEO-specifique est trop faible (3+ fondations manquantes), on plafonne.
  const byId = new Map<CheckId, Check>();
  for (const c of checks) byId.set(c.id, c);
  const missingFoundations = GEO_FOUNDATIONS.filter((f) => !f.achieved(byId)).length;
  if (missingFoundations >= 3) {
    score = Math.min(score, GEO_CAP);
  }

  return score;
}

export function groupByStep(checks: Check[]): StepSummary[] {
  const bySteps = new Map<StepId, Check[]>();
  for (const c of checks) {
    if (!bySteps.has(c.step)) bySteps.set(c.step, []);
    bySteps.get(c.step)!.push(c);
  }
  const steps: StepSummary[] = [];
  for (const step of [1, 2, 3, 4, 5, 6, 7] as StepId[]) {
    const list = bySteps.get(step) ?? [];
    steps.push({
      step,
      title: STEP_TITLES[step],
      checks: list,
      passCount: list.filter((c) => c.status === "pass").length,
      totalCount: list.filter((c) => c.status !== "skip").length,
    });
  }
  return steps;
}

export function buildResult(
  url: string,
  normalizedUrl: string,
  checks: Check[],
  durationMs: number,
  error?: string,
  siteType?: SiteType
): AuditResult {
  return {
    url,
    normalizedUrl,
    score: computeScore(checks),
    siteType,
    siteTypeLabel: siteType ? labelSiteType(siteType) : undefined,
    checks,
    steps: groupByStep(checks),
    durationMs,
    timestamp: new Date().toISOString(),
    error,
  };
}
