import type { Check, FetchOutcome } from "../types";

/**
 * Checks d infrastructure serveur lisibles dans les en-tetes HTTP de la home.
 * 4.4 compression (gzip/brotli/deflate) et 4.5 cache de revalidation (ETag ou
 * Last-Modified). Les crawlers IA reviennent souvent : sans compression ils
 * telechargent plus lourd, sans en-tete de cache ils re-telechargent tout.
 */
export function checkServerHeaders(homeOutcome: FetchOutcome | null): Check[] {
  const checks: Check[] = [];

  const enc = (homeOutcome?.contentEncoding ?? "").toLowerCase();
  const compressed = /\b(gzip|br|deflate|zstd)\b/.test(enc);
  checks.push({
    id: "4.4",
    step: 4,
    label: "Compression gzip ou Brotli activée",
    priority: "HAUTE",
    status: compressed ? "pass" : "fail",
    detail: compressed
      ? `Réponse compressée (Content-Encoding : ${enc}). Les pages partent plus légères, le crawl des IA est plus rapide.`
      : "Aucune compression détectée sur la page d’accueil (pas de Content-Encoding). Le HTML est servi en clair, plus lourd à télécharger pour les crawlers IA.",
    advice: compressed
      ? undefined
      : "Activez la compression Brotli (ou gzip) sur votre serveur ou CDN. C’est un réglage standard qui réduit le poids des pages de 60 à 80 %.",
  });

  const hasEtag = !!homeOutcome?.etag;
  const hasLastMod = !!homeOutcome?.lastModified;
  const revalidatable = hasEtag || hasLastMod;
  checks.push({
    id: "4.5",
    step: 4,
    label: "En-tête de cache (ETag ou Last-Modified)",
    priority: "MOYENNE",
    status: revalidatable ? "pass" : "warn",
    detail: revalidatable
      ? `En-tête de revalidation présent (${hasEtag ? "ETag" : ""}${hasEtag && hasLastMod ? " + " : ""}${hasLastMod ? "Last-Modified" : ""}). Les crawlers IA évitent de re-télécharger une page inchangée.`
      : "Ni ETag ni Last-Modified sur la page d’accueil. À chaque passage, les crawlers IA re-téléchargent toute la page même si rien n’a changé.",
    advice: revalidatable
      ? undefined
      : "Exposez un ETag ou un Last-Modified sur vos pages. Cela permet aux crawlers (Google, GPTBot…) de revalider sans tout re-télécharger, et économise votre budget de crawl.",
  });

  return checks;
}
