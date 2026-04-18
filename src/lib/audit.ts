import type { AuditResult, Check, SiteType, FetchOutcome } from "./types";
import { fetchText, normalizeUrl } from "./fetcher";
import { buildResult } from "./scoring";
import { checkRobots } from "./checks/robots";
import { checkRendering } from "./checks/rendering";
import { checkJsonLd } from "./checks/jsonld";
import { checkTtfb } from "./checks/ttfb";
import { checkLlmsTxt } from "./checks/llmstxt";
import { checkOnPage } from "./checks/onpage";
import { checkInternational } from "./checks/international";
import { discoverTypedUrls, fetchMany } from "./discovery";
import { detectSiteType, extractSitemapLocs } from "./site-type";

export async function runAudit(rawUrl: string): Promise<AuditResult> {
  const start = performance.now();
  let normalized: string;
  try {
    normalized = normalizeUrl(rawUrl);
  } catch {
    return buildResult(rawUrl, rawUrl, [], 0, "URL invalide. Exemple attendu : exemple.fr ou https://exemple.fr");
  }

  const [homeOutcome, robots, sitemapLocs] = await Promise.all([
    fetchText(normalized, { timeoutMs: 10_000 }),
    checkRobots(normalized),
    extractSitemapLocs(normalized),
  ]);

  if (!homeOutcome.ok || !homeOutcome.body) {
    const durationMs = Math.round(performance.now() - start);
    const status = homeOutcome.status;
    let msg: string;
    if (status === 403) {
      msg = `Ce site refuse toutes les requêtes automatisées (403). Un WAF type DataDome, Akamai ou Cloudflare utilise une empreinte TLS pour bloquer les outils comme GEOshaker. Si un WAF bloque GEOshaker, il est très probable qu’il bloque aussi GPTBot, ClaudeBot et PerplexityBot.`;
    } else if (status === 404) {
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

  // Decouverte des pages typees (blog, about, produit)
  const discovered = await discoverTypedUrls(normalized, homeOutcome);

  // Detection du type de site
  const siteType: SiteType = detectSiteType({
    homeBody: homeOutcome.body,
    sitemapLocs,
    discoveredProduct: discovered.product,
    discoveredBlog: discovered.blog,
  });

  const [blogOut, aboutOut, productOut] = await fetchMany([
    discovered.blog,
    discovered.about,
    discovered.product,
  ]);

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
    checkLlmsTxt(normalized),
    checkOnPage({
      siteUrl: normalized,
      homeOutcome,
      extraOutcomes,
      robotsBody: robots.body,
      sitemapUrlsFromRobots: robots.sitemapUrls,
    }),
    checkInternational(normalized, homeOutcome),
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

  const ttfbChecks = checkTtfb(
    [
      { id: "4.1", label: "TTFB page d’accueil sous 500 ms", pageKind: "homepage", outcome: homeOutcome },
      { id: "4.2", label: "TTFB page produit sous 500 ms", pageKind: "product", outcome: productOut },
      { id: "4.3", label: "TTFB page blog sous 500 ms", pageKind: "blog", outcome: blogOut },
    ],
    siteType
  );

  const allChecks: Check[] = [
    ...robots.checks,
    ...renderingChecks,
    ...jsonLdChecks,
    ...ttfbChecks,
    ...llmsChecks,
    ...onpageChecks,
    ...intlChecks,
  ];

  const durationMs = Math.round(performance.now() - start);
  return buildResult(rawUrl, normalized, allChecks, durationMs, undefined, siteType);
}
