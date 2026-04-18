import type { SiteType } from "./types";
import { extractJsonLd, extractSchemaTypes } from "./checks/jsonld";

export type { SiteType };

const PRODUCT_URL_HINTS = [/\/product/i, /\/produit/i, /\/shop\//i, /\/boutique\//i, /\/collection/i, /\/category\//i, /\/panier/i, /\/cart/i, /\/checkout/i];
const BLOG_URL_HINTS = [/\/blog\//i, /\/article/i, /\/actualite/i, /\/news\//i, /\/magazine/i, /\/le-mag/i, /\/journal/i];
const LEADGEN_URL_HINTS = [
  /\/devis/i,
  /\/simulation/i,
  /\/souscri(p|re)/i,
  /\/comparer/i,
  /\/comparateur/i,
  /\/estim(er|ation|ez)/i,
  /\/demander/i,
  /\/demande-de-devis/i,
  /\/mon-devis/i,
  /\/obtenir/i,
  /\/tarifs?\//i,
  /\/quote/i,
];
const SERVICE_URL_HINTS = [
  /\/services?\//i,
  /\/prestations?\//i,
  /\/expertises?\//i,
  /\/nos-services/i,
  /\/nos-prestations/i,
];

const LEADGEN_KEYWORDS = [
  /devis gratuit/i,
  /devis en ligne/i,
  /obtenir (?:un|mon|votre) devis/i,
  /simulation gratuite/i,
  /comparez les/i,
  /demander un devis/i,
  /estimez? (?:votre|en ligne)/i,
  /recevez? (?:votre|un) devis/i,
];

const SERVICE_KEYWORDS = [
  /nos services/i,
  /nos prestations/i,
  /notre agence/i,
  /notre cabinet/i,
  /consulting/i,
];

const ECOM_TYPES = new Set(["Product", "Offer", "AggregateOffer", "OnlineStore", "Store"]);
const BLOG_TYPES = new Set(["Article", "BlogPosting", "Blog", "NewsArticle"]);
const LEADGEN_TYPES = new Set(["FinancialService", "InsuranceAgency", "LoanOrCredit"]);
const SERVICE_TYPES = new Set(["ProfessionalService", "Service", "LocalBusiness"]);

function countMatches(html: string, patterns: RegExp[]): number {
  let total = 0;
  for (const p of patterns) {
    const gp = new RegExp(p.source, "gi");
    const m = html.match(gp);
    if (m) total += m.length;
  }
  return total;
}

function countFormPhoneInputs(html: string): number {
  const tels = (html.match(/<input[^>]*type\s*=\s*["']?tel["']?/gi) ?? []).length;
  return tels;
}

export function detectSiteType(params: {
  homeBody: string;
  sitemapLocs: string[];
  discoveredProduct?: string;
  discoveredBlog?: string;
}): SiteType {
  const { homeBody, sitemapLocs, discoveredProduct, discoveredBlog } = params;

  const blocks = extractJsonLd(homeBody);
  const types = extractSchemaTypes(blocks);
  const hasEcomType = types.some((t) => ECOM_TYPES.has(t));
  const hasBlogType = types.some((t) => BLOG_TYPES.has(t));
  const hasLeadgenType = types.some((t) => LEADGEN_TYPES.has(t));
  const hasServiceType = types.some((t) => SERVICE_TYPES.has(t));

  const productMatches = countMatches(homeBody, PRODUCT_URL_HINTS);
  const blogMatches = countMatches(homeBody, BLOG_URL_HINTS);
  const leadgenUrlMatches = countMatches(homeBody, LEADGEN_URL_HINTS);
  const serviceUrlMatches = countMatches(homeBody, SERVICE_URL_HINTS);
  const leadgenKwMatches = countMatches(homeBody, LEADGEN_KEYWORDS);
  const serviceKwMatches = countMatches(homeBody, SERVICE_KEYWORDS);
  const phoneInputs = countFormPhoneInputs(homeBody);

  const productLocs = sitemapLocs.filter((u) => PRODUCT_URL_HINTS.some((p) => p.test(u))).length;
  const blogLocs = sitemapLocs.filter((u) => BLOG_URL_HINTS.some((p) => p.test(u))).length;
  const leadgenLocs = sitemapLocs.filter((u) => LEADGEN_URL_HINTS.some((p) => p.test(u))).length;

  const scoreEcom =
    (hasEcomType ? 3 : 0) +
    (productMatches >= 10 ? 3 : productMatches >= 3 ? 2 : productMatches >= 1 ? 1 : 0) +
    (productLocs >= 20 ? 3 : productLocs >= 5 ? 2 : productLocs >= 1 ? 1 : 0) +
    (discoveredProduct ? 1 : 0);

  const scoreLeadgen =
    (hasLeadgenType ? 3 : 0) +
    (leadgenUrlMatches >= 5 ? 3 : leadgenUrlMatches >= 2 ? 2 : leadgenUrlMatches >= 1 ? 1 : 0) +
    (leadgenKwMatches >= 2 ? 2 : leadgenKwMatches >= 1 ? 1 : 0) +
    (phoneInputs >= 1 && leadgenUrlMatches >= 1 ? 2 : 0) +
    (leadgenLocs >= 3 ? 2 : leadgenLocs >= 1 ? 1 : 0);

  const scoreBlog =
    (hasBlogType ? 2 : 0) +
    (blogMatches >= 10 ? 3 : blogMatches >= 3 ? 2 : blogMatches >= 1 ? 1 : 0) +
    (blogLocs >= 20 ? 3 : blogLocs >= 5 ? 2 : blogLocs >= 1 ? 1 : 0) +
    (discoveredBlog ? 1 : 0);

  const scoreService =
    (hasServiceType ? 2 : 0) +
    (serviceUrlMatches >= 3 ? 2 : serviceUrlMatches >= 1 ? 1 : 0) +
    (serviceKwMatches >= 1 ? 1 : 0);

  // Ordre de priorite : ecommerce > leadgen > blog > service > vitrine
  // Exige un score minimum pour classer clairement. Si tout est faible : vitrine.
  const scores: Array<[SiteType, number]> = [
    ["ecommerce", scoreEcom],
    ["leadgen", scoreLeadgen],
    ["blog", scoreBlog],
    ["service", scoreService],
  ];
  scores.sort((a, b) => b[1] - a[1]);

  const [topType, topScore] = scores[0];
  if (topScore >= 3) return topType;
  if (topScore >= 1) {
    // Signaux faibles : on privilegie le domaine qui a un signal un peu consistent
    return topType;
  }
  return "vitrine";
}

export function labelSiteType(t: SiteType): string {
  switch (t) {
    case "ecommerce":
      return "e-commerce";
    case "leadgen":
      return "lead generation";
    case "blog":
      return "blog ou média";
    case "service":
      return "site de services";
    case "vitrine":
      return "site vitrine";
  }
}

export async function extractSitemapLocs(siteUrl: string): Promise<string[]> {
  try {
    const { fetchText, rootOrigin } = await import("./fetcher");
    const origin = rootOrigin(siteUrl);
    const out = await fetchText(`${origin}/sitemap.xml`, { timeoutMs: 5000 });
    if (!out.ok || !out.body) return [];
    const locs: string[] = [];
    const isIndex = /<sitemapindex[\s>]/i.test(out.body);
    const locRe = /<loc>([^<]+)<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = locRe.exec(out.body)) !== null) locs.push(m[1].trim());
    if (isIndex && locs[0]) {
      const sub = await fetchText(locs[0], { timeoutMs: 5000 });
      if (sub.ok && sub.body) {
        locs.length = 0;
        const subRe = /<loc>([^<]+)<\/loc>/gi;
        while ((m = subRe.exec(sub.body)) !== null) locs.push(m[1].trim());
      }
    }
    return locs;
  } catch {
    return [];
  }
}
