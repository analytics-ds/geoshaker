import type { Check, FetchOutcome } from "../types";
import type { SiteType } from "./rendering";

export interface JsonLdBlock {
  raw: string;
  parsed: unknown;
  valid: boolean;
  error?: string;
}

export function extractJsonLd(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  const regex = /<script[^>]*type\s*=\s*(?:["']application\/ld\+json["']|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      blocks.push({ raw, parsed, valid: true });
    } catch (err) {
      blocks.push({
        raw,
        parsed: null,
        valid: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return blocks;
}

export function extractSchemaTypes(blocks: JsonLdBlock[]): string[] {
  const types = new Set<string>();
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const t = obj["@type"];
      if (typeof t === "string") types.add(t);
      else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
      if (obj["@graph"]) walk(obj["@graph"]);
    }
  };
  blocks.forEach((b) => walk(b.parsed));
  return Array.from(types);
}

export function hasMalformedTypeKey(blocks: JsonLdBlock[]): boolean {
  let malformed = false;
  const walk = (node: unknown) => {
    if (!node || malformed) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (!("@type" in obj) && "type" in obj && typeof obj.type === "string") {
        malformed = true;
        return;
      }
      Object.values(obj).forEach(walk);
    }
  };
  blocks.forEach((b) => walk(b.parsed));
  return malformed;
}

function shortLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 1 ? u.pathname.replace(/^\//, "").replace(/\/$/, "") : "accueil";
  } catch {
    return url;
  }
}

export function checkJsonLd(
  homeOutcome: FetchOutcome | null,
  productOutcome: FetchOutcome | null,
  extraOutcome: FetchOutcome | null,
  siteType: SiteType,
  extraPageKind?: "blog" | "about"
): Check[] {
  const checks: Check[] = [];
  let homeBlocks: JsonLdBlock[] = [];

  // 3.1 JSON-LD homepage
  if (homeOutcome?.ok && homeOutcome.body) {
    homeBlocks = extractJsonLd(homeOutcome.body);
    if (homeBlocks.length === 0) {
      checks.push({
        id: "3.1",
        step: 3,
        label: "JSON-LD présent dans le HTML source de la page d’accueil",
        priority: "BLOQUANT",
        status: "fail",
        detail: "Aucun bloc <script type=\"application/ld+json\"> détecté dans le HTML source de la page d’accueil.",
        advice:
          "Ajoutez du JSON-LD directement dans le HTML rendu côté serveur. Types recommandés : Organization, WebSite, Article, Product, BreadcrumbList, FAQPage.",
      });
    } else {
      const types = extractSchemaTypes(homeBlocks);
      checks.push({
        id: "3.1",
        step: 3,
        label: "JSON-LD présent dans le HTML source de la page d’accueil",
        priority: "BLOQUANT",
        status: "pass",
        detail: `${homeBlocks.length} bloc(s) JSON-LD détecté(s) en accueil. Types : ${types.join(", ") || "aucun @type explicite"}.`,
      });
    }
  } else {
    checks.push({
      id: "3.1",
      step: 3,
      label: "JSON-LD présent dans le HTML source de la page d’accueil",
      priority: "BLOQUANT",
      status: "fail",
      detail: "Page d’accueil inaccessible, contrôle impossible.",
    });
  }

  // 3.2 JSON-LD page produit
  if (!productOutcome) {
    checks.push({
      id: "3.2",
      step: 3,
      label: "JSON-LD présent sur une page produit",
      priority: "BLOQUANT",
      status: "skip",
      detail:
        siteType === "blog"
          ? "Ce site semble être un blog : pas de page produit à tester. Contrôle non applicable."
          : siteType === "vitrine"
          ? "Ce site est une vitrine : pas de page produit à tester. Contrôle non applicable."
          : "Aucune page produit détectée automatiquement dans votre navigation.",
    });
  } else if (!productOutcome.ok || !productOutcome.body) {
    checks.push({
      id: "3.2",
      step: 3,
      label: "JSON-LD présent sur une page produit",
      priority: "BLOQUANT",
      status: "fail",
      detail: `Page produit inaccessible (statut ${productOutcome.status ?? "erreur"}).`,
    });
  } else {
    const pBlocks = extractJsonLd(productOutcome.body);
    if (pBlocks.length === 0) {
      checks.push({
        id: "3.2",
        step: 3,
        label: "JSON-LD présent sur une page produit",
        priority: "BLOQUANT",
        status: "fail",
        detail: `Aucun JSON-LD détecté sur ${productOutcome.url}.`,
        advice:
          "Ajoutez un schéma Product (+ Offer) sur chaque fiche produit. C’est la seule façon pour Claude et ChatGPT de comprendre vos prix, disponibilités et caractéristiques.",
      });
    } else {
      const pTypes = extractSchemaTypes(pBlocks);
      const hasProduct = pTypes.includes("Product");
      checks.push({
        id: "3.2",
        step: 3,
        label: "JSON-LD présent sur une page produit",
        priority: "BLOQUANT",
        status: hasProduct ? "pass" : "warn",
        detail: hasProduct
          ? `Schéma Product détecté (${shortLabel(productOutcome.url)}). Autres types : ${pTypes.filter((t) => t !== "Product").join(", ") || "aucun"}.`
          : `JSON-LD présent sur ${shortLabel(productOutcome.url)} mais sans schéma Product. Types trouvés : ${pTypes.join(", ")}.`,
        advice: hasProduct
          ? undefined
          : "Ajoutez un @type: Product avec name, offers.price, offers.priceCurrency, image, et aggregateRating si possible.",
      });
    }
  }

  // 3.3 Pas d’injection GTM
  const htmlHasJsonLd = homeBlocks.length > 0;
  checks.push({
    id: "3.3",
    step: 3,
    label: "JSON-LD dans le HTML source, pas seulement via Tag Manager",
    priority: "BLOQUANT",
    status: htmlHasJsonLd ? "pass" : "fail",
    detail: htmlHasJsonLd
      ? "Le JSON-LD est présent directement dans le HTML servi par le serveur, donc lisible par les IA sans exécution JavaScript."
      : "Aucun JSON-LD dans le HTML source. S’il apparaît dans l’inspecteur, il est probablement injecté via Google Tag Manager, et les IA ne l’exécuteront pas.",
    advice: htmlHasJsonLd
      ? undefined
      : "Sortez le JSON-LD de GTM et injectez-le côté serveur (template, layout, balise <head> directe).",
  });

  // 3.4 Types pertinents
  const allTypes = extractSchemaTypes(homeBlocks);
  const malformed = hasMalformedTypeKey(homeBlocks);
  const relevant = ["Organization", "WebSite", "Article", "Product", "BreadcrumbList", "FAQPage", "LocalBusiness", "Person", "Blog"];
  const matched = allTypes.filter((t) => relevant.includes(t));
  checks.push({
    id: "3.4",
    step: 3,
    label: "Types de schéma pertinents pour votre secteur",
    priority: "HAUTE",
    status: matched.length >= 2 ? "pass" : matched.length === 1 ? "warn" : "fail",
    detail: malformed
      ? "JSON-LD mal formé : vous utilisez la clé « type » au lieu de « @type ». Les IA et Google ne peuvent pas l’interpréter."
      : allTypes.length === 0
      ? "Aucun @type détecté dans le JSON-LD de la page d’accueil."
      : `Types trouvés : ${allTypes.join(", ")}. Types pertinents GEO : ${matched.join(", ") || "aucun"}.`,
    advice: malformed
      ? "Corrigez la structure du JSON-LD : les clés doivent être préfixées par @ (ex: @context, @type, @id)."
      : matched.length >= 2
      ? undefined
      : "Visez au minimum 2 types pertinents en homepage : Organization et WebSite. Ajoutez Article sur les pages blog, Product sur les fiches produit.",
  });

  // 3.5 Validité
  const invalid = homeBlocks.filter((b) => !b.valid);
  checks.push({
    id: "3.5",
    step: 3,
    label: "JSON-LD syntaxiquement valide",
    priority: "HAUTE",
    status: homeBlocks.length === 0 ? "fail" : invalid.length === 0 ? "pass" : "fail",
    detail:
      homeBlocks.length === 0
        ? "Aucun JSON-LD à valider en page d’accueil."
        : invalid.length === 0
        ? `Les ${homeBlocks.length} bloc(s) JSON-LD sont syntaxiquement valides.`
        : `${invalid.length} bloc(s) invalide(s). Exemple : ${invalid[0].error ?? "parsing impossible"}.`,
    advice:
      invalid.length === 0
        ? undefined
        : "Validez votre JSON-LD sur validator.schema.org pour détecter les erreurs de structure et les propriétés manquantes.",
  });

  // 3.6 JSON-LD sur une autre page du site (blog ou à propos)
  const extraLabel = extraPageKind === "blog" ? "page blog" : extraPageKind === "about" ? "page à propos" : "une autre page du site";
  if (!extraOutcome) {
    checks.push({
      id: "3.6",
      step: 3,
      label: `JSON-LD présent sur ${extraLabel}`,
      priority: "HAUTE",
      status: "skip",
      detail: "Aucune page blog ou à propos détectée automatiquement.",
    });
  } else if (!extraOutcome.ok || !extraOutcome.body) {
    checks.push({
      id: "3.6",
      step: 3,
      label: `JSON-LD présent sur ${extraLabel}`,
      priority: "HAUTE",
      status: "fail",
      detail: `Page inaccessible (statut ${extraOutcome.status ?? "erreur"}).`,
    });
  } else {
    const blocks = extractJsonLd(extraOutcome.body);
    const types = extractSchemaTypes(blocks);
    checks.push({
      id: "3.6",
      step: 3,
      label: `JSON-LD présent sur ${extraLabel}`,
      priority: "HAUTE",
      status: blocks.length > 0 ? "pass" : "fail",
      detail: blocks.length > 0
        ? `${blocks.length} bloc(s) JSON-LD détecté(s) sur ${shortLabel(extraOutcome.url)}. Types : ${types.join(", ") || "aucun @type explicite"}.`
        : `Aucun JSON-LD sur ${shortLabel(extraOutcome.url)}. Les IA vont lire vos articles ou votre page à propos sans contexte structuré.`,
      advice: blocks.length > 0
        ? undefined
        : extraPageKind === "blog"
        ? "Ajoutez un @type: Article (ou BlogPosting) sur chaque article, avec author, datePublished, image et headline."
        : "Ajoutez au minimum un @type: Organization (ou AboutPage) avec les informations légales et la description de l’activité.",
    });
  }

  return checks;
}
