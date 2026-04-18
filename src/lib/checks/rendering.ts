import type { Check, FetchOutcome, SiteType } from "../types";

export type { SiteType };

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.length > 1).length;
}

const MIN_WORDS = 120;

type PageSpec = {
  id: Check["id"];
  label: string;
  pageKind: "homepage" | "product" | "about" | "blog";
  outcome: FetchOutcome | null;
};

function skipDetail(pageKind: PageSpec["pageKind"], siteType: SiteType): string {
  if (pageKind === "product") {
    if (siteType === "blog") return "Ce site semble être un blog : pas de page produit à tester. Contrôle non applicable.";
    if (siteType === "vitrine") return "Ce site est une vitrine : pas de page produit à tester. Contrôle non applicable.";
    return "Aucune page produit détectée automatiquement. Ajoutez un lien vers une page produit depuis votre navigation pour activer ce contrôle.";
  }
  if (pageKind === "about") {
    return "Aucune page « à propos » détectée automatiquement. Ajoutez un lien /a-propos ou /about depuis votre navigation principale.";
  }
  if (pageKind === "blog") {
    if (siteType === "vitrine") return "Ce site ne semble pas avoir de blog. Contrôle non applicable.";
    return "Aucune page blog détectée automatiquement. Ajoutez un lien /blog ou /actualites depuis votre navigation.";
  }
  return "Non testable automatiquement.";
}

export function checkRendering(pages: PageSpec[], siteType: SiteType): Check[] {
  const checks: Check[] = [];
  for (const p of pages) {
    if (!p.outcome) {
      checks.push({
        id: p.id,
        step: 2,
        label: p.label,
        priority: "BLOQUANT",
        status: "skip",
        detail: skipDetail(p.pageKind, siteType),
      });
      continue;
    }
    const out = p.outcome;
    if (!out.ok || !out.body) {
      checks.push({
        id: p.id,
        step: 2,
        label: p.label,
        priority: "BLOQUANT",
        status: "fail",
        detail: `Impossible de récupérer la page ${out.url} (statut ${out.status ?? "erreur réseau"}).`,
        advice: "Vérifiez que la page est accessible sans authentification et renvoie un statut 200.",
      });
      continue;
    }
    const words = countWords(out.body);
    if (words >= MIN_WORDS) {
      checks.push({
        id: p.id,
        step: 2,
        label: p.label,
        priority: "BLOQUANT",
        status: "pass",
        detail: `Contenu visible dans le HTML source : ${words} mots détectés. Les IA n’ont pas besoin d’exécuter du JavaScript pour le lire.`,
      });
    } else {
      checks.push({
        id: p.id,
        step: 2,
        label: p.label,
        priority: "BLOQUANT",
        status: "fail",
        detail: `Seulement ${words} mots visibles dans le HTML source. Le contenu est probablement injecté via JavaScript côté client, donc invisible pour les IA.`,
        advice:
          "Activez le rendu côté serveur (SSR) ou le rendu statique (SSG) pour que les IA puissent lire votre contenu sans exécuter le JavaScript.",
      });
    }
  }
  return checks;
}
