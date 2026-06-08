import type { AuditResult, Check, SiteType, FetchOutcome } from "./types";
import { fetchHome, measureTtfbMs, normalizeUrl } from "./fetcher";
import { buildResult } from "./scoring";
import { checkRobots } from "./checks/robots";
import { checkRendering } from "./checks/rendering";
import { checkJsonLd } from "./checks/jsonld";
import { checkTtfb } from "./checks/ttfb";
import { checkLlmsTxt } from "./checks/llmstxt";
import { checkOnPage } from "./checks/onpage";
import { checkInternational } from "./checks/international";
import { checkServerHeaders } from "./checks/server";
import { extractJsonLd, extractSchemaTypes } from "./checks/jsonld";

// Une page candidate "produit" en est-elle vraiment une ? On se fie aux signaux
// portes par la page elle-meme : og:type=product (OpenGraph) ou un schema
// JSON-LD Product/Offer. Plus robuste que le seul type de site (un e-commerce
// riche en articles peut etre classe "blog", cf. whiskydegustation).
function looksLikeProductPage(body?: string): boolean {
  if (!body) return false;
  if (/<meta[^>]+property=["']og:type["'][^>]+content=["']product["']/i.test(body)) return true;
  const types = extractSchemaTypes(extractJsonLd(body));
  return types.some((t) => t === "Product" || t === "Offer" || t === "AggregateOffer");
}
import { discoverTypedUrls, fetchMany } from "./discovery";
import { detectSiteType, extractSitemapLocs } from "./site-type";

// Resultat synthetique quand un WAF bloque tout (403/401). Les bots IA reels
// sont bloques de la meme facon, donc on emet les checks d acces en echec :
// score plafonne par la penalite fatale (3+ IA bloquees -> cap 5).
function buildWafBlockedChecks(): Check[] {
  const bots: Array<[Check["id"], string, string]> = [
    ["1.1", "ChatGPT", "GPTBot"],
    ["1.2", "Claude", "ClaudeBot"],
    ["1.3", "Perplexity", "PerplexityBot"],
  ];
  const checks: Check[] = bots.map(([id, aiName, bot]) => ({
    id,
    step: 1,
    label: `${aiName} peut lire votre site (${bot})`,
    priority: "BLOQUANT",
    status: "fail",
    detail: `Votre pare-feu (WAF/CDN type Cloudflare, DataDome, Akamai…) renvoie un 403 à toute requête automatisée, y compris avec l’User-Agent officiel de ${bot}. ${aiName} est donc bloqué et ne peut ni crawler ni citer votre site.`,
    advice: `Dans votre WAF, autorisez explicitement ${bot} (User-Agent + plages d’IP officielles). Sur Cloudflare, activez « Verified Bots » et whitelistez GPTBot, ClaudeBot et PerplexityBot.`,
  }));
  checks.push({
    id: "1.4",
    step: 1,
    label: "Gemini et AI Overviews peuvent utiliser votre site (Google-Extended)",
    priority: "BLOQUANT",
    status: "fail",
    detail:
      "Le pare-feu bloquant l’ensemble des accès automatisés, l’accès de Google pour Gemini et les AI Overviews est lui aussi compromis.",
    advice: "Autorisez les crawlers vérifiés dans votre WAF et déclarez Google-Extended dans robots.txt.",
  });
  checks.push({
    id: "2.1",
    step: 2,
    label: "Page d’accueil : contenu visible sans JavaScript",
    priority: "BLOQUANT",
    status: "fail",
    detail:
      "Impossible de lire le HTML : le pare-feu refuse la requête (403). Aucun moteur IA ne peut accéder au contenu de la page d’accueil.",
    advice:
      "Le blocage par le WAF est la priorité absolue à corriger : tant qu’il est en place, aucun travail GEO n’aura d’effet.",
  });
  return checks;
}

export async function runAudit(rawUrl: string): Promise<AuditResult> {
  const start = performance.now();
  let normalized: string;
  try {
    normalized = normalizeUrl(rawUrl);
  } catch {
    return buildResult(rawUrl, rawUrl, [], 0, "URL invalide. Exemple attendu : exemple.fr ou https://exemple.fr");
  }

  const homeOutcome = await fetchHome(normalized, { timeoutMs: 10_000 });

  if (!homeOutcome.ok || !homeOutcome.body) {
    const durationMs = Math.round(performance.now() - start);
    const status = homeOutcome.status;

    // WAF qui bloque tout (403/401) : ce n est pas une erreur de l outil, c est
    // un probleme GEO majeur. On renvoie un vrai resultat a score critique au
    // lieu d un message d erreur, pour que ca devienne un argument de vente.
    if (status === 403 || status === 401) {
      return buildResult(rawUrl, normalized, buildWafBlockedChecks(), durationMs, undefined);
    }

    let msg: string;
    if (status === 404) {
      msg = `URL introuvable (404) sur ${normalized}. Vérifiez l’URL saisie.`;
    } else if (status === 429) {
      msg = `Trop de requêtes (429). Attendez une minute et réessayez.`;
    } else if (typeof status === "number" && status >= 500) {
      msg = `Le serveur du site renvoie une erreur (${status}). Réessayez dans quelques minutes.`;
    } else if (!status) {
      msg = `Impossible de se connecter à ${normalized} (erreur réseau ou timeout). Vérifiez que le domaine existe et que le site est en ligne.`;
    } else {
      msg = `Impossible de récupérer ${normalized} (statut ${status}).`;
    }
    return buildResult(rawUrl, normalized, [], durationMs, msg);
  }

  // URL reellement joignable (apex sans HTTPS -> www, redirections suivies).
  // Tous les checks suivants doivent partir de cette origine, pas de l URL saisie.
  const resolved = homeOutcome.url || normalized;

  const [robots, sitemapLocs] = await Promise.all([
    checkRobots(resolved),
    extractSitemapLocs(resolved),
  ]);

  // Decouverte des pages typees (blog, about, produit)
  const discovered = await discoverTypedUrls(resolved, homeOutcome);

  // Detection du type de site
  let siteType: SiteType = detectSiteType({
    homeBody: homeOutcome.body,
    sitemapLocs,
    discoveredProduct: discovered.product,
    discoveredBlog: discovered.blog,
  });

  const [blogOut, aboutOut, productOutRaw] = await fetchMany([
    discovered.blog,
    discovered.about,
    discovered.product,
  ]);

  // Garde-fou contre les fausses pages produit : un motif d'URL (/services/,
  // /offres/, /catalogue/, /p/...) ne suffit pas. On ne retient la page que si
  // le site est e-commerce/service OU si la page porte de vrais signaux produit
  // (og:type=product ou schema Product/Offer). Sinon on l'ecarte et les checks
  // produit sont skippes (cas meilleur-transport : comparateur sans fiche
  // produit ou /services/ etc. renvoient 404, aucun signal produit).
  const trustProduct =
    siteType === "ecommerce" ||
    siteType === "service" ||
    looksLikeProductPage(productOutRaw?.body);
  const productOut: FetchOutcome | null = trustProduct ? productOutRaw : null;

  // Correction du type de site : une vraie fiche produit (signaux Product/Offer
  // ou og:type=product) prime sur une classification "blog"/"vitrine" induite
  // par un gros volume editorial. Cas e-commerce riche en articles classe a tort
  // "blog" (ex. whiskydegustation : 80 produits mais 123 articles).
  if (
    productOut &&
    (siteType === "blog" || siteType === "vitrine") &&
    looksLikeProductPage(productOut.body)
  ) {
    siteType = "ecommerce";
  }

  // Page "extra" pour JSON-LD (priorite : blog > about)
  const extraOutcome: FetchOutcome | null = blogOut ?? aboutOut;
  const extraPageKind: "blog" | "about" | undefined = blogOut
    ? "blog"
    : aboutOut
    ? "about"
    : undefined;

  const extraOutcomes: Array<{ label: "blog" | "about" | "product"; outcome: FetchOutcome | null }> = [];
  if (blogOut) extraOutcomes.push({ label: "blog", outcome: blogOut });
  if (aboutOut) extraOutcomes.push({ label: "about", outcome: aboutOut });
  if (productOut && extraOutcomes.length < 2) extraOutcomes.push({ label: "product", outcome: productOut });

  const [llmsChecks, onpageChecks, intlChecks] = await Promise.all([
    checkLlmsTxt(resolved),
    checkOnPage({
      siteUrl: resolved,
      homeOutcome,
      extraOutcomes,
      robotsBody: robots.body,
      sitemapUrlsFromRobots: robots.sitemapUrls,
    }),
    checkInternational(resolved, homeOutcome),
  ]);

  const renderingChecks = checkRendering(
    [
      { id: "2.1", label: "Page d’accueil : contenu visible sans JavaScript", pageKind: "homepage", outcome: homeOutcome },
      { id: "2.2", label: "Page produit : contenu visible sans JavaScript", pageKind: "product", outcome: productOut },
      { id: "2.3", label: "Page à propos : contenu visible sans JavaScript", pageKind: "about", outcome: aboutOut },
      { id: "2.4", label: "Page blog : contenu visible sans JavaScript", pageKind: "blog", outcome: blogOut },
    ],
    siteType
  );

  const jsonLdChecks = checkJsonLd(homeOutcome, productOut, extraOutcome, siteType, extraPageKind);

  // TTFB fiable : sonde dediee (mediane multi-echantillons) qui remplace la
  // mesure incidente du fetch de contenu (un seul tir, trop bruite). On ne
  // remesure que les pages joignables en direct : via Bright Data, le TTFB
  // serveur reel n'est pas mesurable et ttfb.ts skippe deja le check.
  async function applyRobustTtfb(outcome: FetchOutcome | null): Promise<void> {
    if (!outcome || !outcome.ok || outcome.via === "brightdata") return;
    const ms = await measureTtfbMs(outcome.url || resolved, {
      samples: 3,
      timeoutMs: 10_000,
    });
    if (ms !== null) outcome.ttfbMs = ms;
  }
  await Promise.all([
    applyRobustTtfb(homeOutcome),
    applyRobustTtfb(productOut),
    applyRobustTtfb(blogOut),
  ]);

  const ttfbChecks = checkTtfb(
    [
      { id: "4.1", label: "TTFB page d’accueil sous 500 ms", pageKind: "homepage", outcome: homeOutcome },
      { id: "4.2", label: "TTFB page produit sous 500 ms", pageKind: "product", outcome: productOut },
      { id: "4.3", label: "TTFB page blog sous 500 ms", pageKind: "blog", outcome: blogOut },
    ],
    siteType
  );

  const serverChecks = checkServerHeaders(homeOutcome);

  const allChecks: Check[] = [
    ...robots.checks,
    ...renderingChecks,
    ...jsonLdChecks,
    ...ttfbChecks,
    ...serverChecks,
    ...llmsChecks,
    ...onpageChecks,
    ...intlChecks,
  ];

  const durationMs = Math.round(performance.now() - start);
  return buildResult(rawUrl, resolved, allChecks, durationMs, undefined, siteType);
}
