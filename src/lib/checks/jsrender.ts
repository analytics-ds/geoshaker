import type { Check, FetchOutcome } from "../types";
import { textContent } from "./onpage";

// Compte les mots "utiles" (>1 caractere) d'un HTML, meme methode que le
// check 6h, pour que les deux chiffres soient comparables.
function countWords(html: string): number {
  return textContent(html)
    .split(/\s+/)
    .filter((w) => w.length > 1).length;
}

/**
 * Check 2.5 : part du contenu visible uniquement apres execution JavaScript.
 *
 * On compare le texte du HTML brut (ce que lit un crawler IA, qui n'execute
 * quasiment jamais JS) au texte de la page reellement rendue (recuperee via un
 * navigateur reel cote Bright Data). L'ecart = le contenu injecte par JS, donc
 * invisible pour ChatGPT, Claude, Perplexity & co.
 *
 * - rendered indisponible (non configure / echec) -> skip honnete.
 * - ecart faible -> pass : le contenu est bien dans le HTML.
 * - ecart important -> warn/fail chiffre.
 */
export function checkJsContentGap(
  homeOutcome: FetchOutcome | null,
  renderedBody: string | null
): Check {
  const base: Pick<Check, "id" | "step" | "label" | "priority"> = {
    id: "2.5",
    step: 2,
    label: "Contenu principal présent dans le HTML (pas injecté par JavaScript)",
    priority: "HAUTE",
  };

  if (!homeOutcome?.ok || !homeOutcome.body) {
    return { ...base, status: "skip", detail: "Page d’accueil non récupérée : comparaison impossible." };
  }
  if (!renderedBody) {
    return {
      ...base,
      status: "skip",
      detail:
        "Comparaison avec la page rendue (JavaScript exécuté) indisponible pour ce site. Le comptage de mots reste fondé sur le HTML brut, soit la vue d’un crawler IA.",
    };
  }

  const htmlWords = countWords(homeOutcome.body);
  const renderedWords = countWords(renderedBody);
  const gap = renderedWords - htmlWords;
  const ratio = renderedWords / Math.max(htmlWords, 1);
  const jsSharePct = renderedWords > 0 ? Math.round((gap / renderedWords) * 100) : 0;

  // Le rendu peut renvoyer un peu moins (consentement, contenu lazy non
  // declenche) : pas d'alerte si le HTML brut est au niveau ou au-dessus.
  if (gap <= 100 || ratio < 1.25) {
    return {
      ...base,
      status: "pass",
      detail: `Contenu servi dans le HTML : ${htmlWords} mots lisibles sans JavaScript, ${renderedWords} après rendu JS. L’écart est négligeable, les IA voient l’essentiel de la page.`,
    };
  }

  const heavy = ratio >= 1.5 && gap > 200;
  return {
    ...base,
    status: heavy ? "fail" : "warn",
    detail: `${htmlWords} mots dans le HTML brut contre ${renderedWords} sur la page rendue : environ ${gap} mots (${jsSharePct} %) ne s’affichent qu’après exécution JavaScript et restent invisibles pour les crawlers IA (GPTBot, ClaudeBot, PerplexityBot).`,
    advice:
      "Rendez ce contenu dans le HTML initial (rendu côté serveur / SSG, ou pré-rendu pour les bots). La plupart des IA n’exécutent pas JavaScript : tout ce qui n’est pas dans le HTML brut leur échappe.",
  };
}
