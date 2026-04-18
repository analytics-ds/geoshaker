import type { FetchOutcome } from "./types";
import { fetchText, rootOrigin } from "./fetcher";
import { findInternalLinks } from "./checks/onpage";

export interface DiscoveredUrls {
  home: string;
  blog?: string;
  about?: string;
  product?: string;
}

const BLOG_PATTERNS = [
  /\/blog(\/|$)/i,
  /\/actualites?(\/|$)/i,
  /\/news(\/|$)/i,
  /\/magazine(\/|$)/i,
  /\/journal(\/|$)/i,
  /\/le-mag(\/|$)/i,
  /\/articles?\//i,
];

const ABOUT_PATTERNS = [
  /\/a-propos(\/|$)/i,
  /\/about(\/|$|-us)/i,
  /\/qui-sommes-nous/i,
  /\/notre-histoire/i,
  /\/notre-marque/i,
  /\/la-marque/i,
  /\/lentreprise/i,
  /\/l-entreprise/i,
  /\/histoire(\/|$)/i,
  /\/equipe(\/|$)/i,
];

const PRODUCT_PATTERNS = [
  /\/produits?\//i,
  /\/product(\/|s\/)/i,
  /\/shop\//i,
  /\/boutique\//i,
  /\/services?\//i,
  /\/prestations?\//i,
  /\/offres?\//i,
  /\/catalogue\//i,
  /\/p\//i, // Shopify product pages often live under /products/ mais aussi /p/
];

function findByPatterns(urls: string[], patterns: RegExp[]): string | undefined {
  return urls.find((u) => patterns.some((p) => p.test(u)));
}

async function discoverFromSitemap(
  origin: string
): Promise<{ blog?: string; product?: string }> {
  const out = await fetchText(`${origin}/sitemap.xml`, { timeoutMs: 6000 });
  if (!out.ok || !out.body) return {};
  const locRe = /<loc>([^<]+)<\/loc>/gi;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = locRe.exec(out.body)) !== null) urls.push(m[1].trim());
  // Si c est un sitemap-index, prendre le premier sous-sitemap
  if (/<sitemapindex[\s>]/i.test(out.body) && urls[0]) {
    const subOut = await fetchText(urls[0], { timeoutMs: 6000 });
    if (subOut.ok && subOut.body) {
      const inner: string[] = [];
      const re2 = /<loc>([^<]+)<\/loc>/gi;
      while ((m = re2.exec(subOut.body)) !== null) inner.push(m[1].trim());
      urls.push(...inner);
    }
  }
  const sameOrigin = urls
    .filter((u) => u.startsWith(origin))
    .filter((u) => u !== origin && u !== `${origin}/`);
  return {
    blog: findByPatterns(sameOrigin, BLOG_PATTERNS),
    product: findByPatterns(sameOrigin, PRODUCT_PATTERNS),
  };
}

export async function discoverTypedUrls(
  home: string,
  homeOutcome: FetchOutcome
): Promise<DiscoveredUrls> {
  const origin = rootOrigin(home);
  const links = homeOutcome.body ? findInternalLinks(homeOutcome.body, origin) : [];

  let blog = findByPatterns(links, BLOG_PATTERNS);
  let about = findByPatterns(links, ABOUT_PATTERNS);
  let product = findByPatterns(links, PRODUCT_PATTERNS);

  // Fallback : si le blog ou le produit manquent, on cherche dans le sitemap
  if (!blog || !product) {
    const fromSitemap = await discoverFromSitemap(origin);
    if (!blog) blog = fromSitemap.blog;
    if (!product) product = fromSitemap.product;
  }

  return { home, blog, about, product };
}

export async function fetchMany(urls: (string | undefined)[]): Promise<Array<FetchOutcome | null>> {
  return Promise.all(
    urls.map((u) => (u ? fetchText(u, { timeoutMs: 8000 }) : Promise.resolve<null>(null)))
  );
}
