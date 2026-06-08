import type { Check, FetchOutcome } from "../types";
import type { SiteType } from "./rendering";

interface TtfbSpec {
  id: Check["id"];
  label: string;
  pageKind: "homepage" | "product" | "blog";
  outcome: FetchOutcome | null;
}

const THRESHOLD_MS = 500;

function skipDetail(pageKind: TtfbSpec["pageKind"], siteType: SiteType): string {
  if (pageKind === "product") {
    if (siteType === "blog") return "Ce site semble être un blog : pas de page produit à tester.";
    if (siteType === "vitrine") return "Ce site est une vitrine : pas de page produit à tester.";
    if (siteType === "leadgen") return "Ce site génère des contacts (comparateur, devis…) : pas de fiche produit à tester.";
    return "Aucune page produit détectée automatiquement dans votre navigation.";
  }
  if (pageKind === "blog") {
    if (siteType === "vitrine") return "Ce site ne semble pas avoir de blog. Contrôle non applicable.";
    return "Aucune page blog détectée automatiquement dans votre navigation.";
  }
  return "Non testable automatiquement.";
}

export function checkTtfb(specs: TtfbSpec[], siteType: SiteType): Check[] {
  return specs.map((s) => {
    if (!s.outcome) {
      return {
        id: s.id,
        step: 4,
        label: s.label,
        priority: "HAUTE",
        status: "skip",
        detail: skipDetail(s.pageKind, siteType),
      };
    }
    const o = s.outcome;
    // Contenu recupere via Bright Data (WAF contourne) : pas de TTFB serveur reel.
    // On ne peut pas le mesurer, donc skip plutot que d'inventer un echec.
    if (o.via === "brightdata") {
      return {
        id: s.id,
        step: 4,
        label: s.label,
        priority: "HAUTE",
        status: "skip",
        detail:
          "Page récupérée via un déblocage anti-bot : le temps de réponse réel du serveur n’a pas pu être mesuré.",
      };
    }
    if (!o.ok || typeof o.ttfbMs !== "number") {
      return {
        id: s.id,
        step: 4,
        label: s.label,
        priority: "HAUTE",
        status: "fail",
        detail: `Impossible de mesurer le TTFB sur ${o.url} (${o.status ?? "erreur"}).`,
      };
    }
    if (o.ttfbMs < THRESHOLD_MS) {
      return {
        id: s.id,
        step: 4,
        label: s.label,
        priority: "HAUTE",
        status: "pass",
        detail: `TTFB médian : ${o.ttfbMs} ms (médiane de 3 mesures côté serveur, seuil ${THRESHOLD_MS} ms). Les IA abandonnent les sites lents.`,
      };
    }
    return {
      id: s.id,
      step: 4,
      label: s.label,
      priority: "HAUTE",
      status: o.ttfbMs < 1000 ? "warn" : "fail",
      detail: `TTFB médian : ${o.ttfbMs} ms (médiane de 3 mesures côté serveur). Au-delà de ${THRESHOLD_MS} ms, les IA peuvent abandonner avant la fin du chargement.`,
      advice:
        "Activez un cache CDN en bord, évitez les redirections inutiles et réduisez le temps de génération serveur. Un TTFB bas facilite le crawl par les IA.",
    };
  });
}
