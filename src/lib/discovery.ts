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
  /\/qui-est/i,
  /\/notre-histoire/i,
  /\/notre-marque/i,
  /\/la-marque/i,
  /\/lentreprise/i,
  /\/l-entreprise/i,
  /\/histoire(\/|$)/i,
  /\/equipe(\/|$)/i,
  /\/decouvrir/i,
  /\/notre-societe/i,
  /\/nos-engagements/i,
  /\/presentation/i,
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
  /\/p\//i,
];

// Paths communs a tester en direct (HEAD) si rien n est trouve dans la home
const ABOUT_FALLBACK_PATHS = [
  "/qui-sommes-nous/",
  "/qui-sommes-nous",
  "/a-propos/",
  "/a-propos",
  "/about/",
  "/about",
  "/about-us/",
  "/about-us",
  "/notre-histoire/",
  "/la-marque/",
  "/nos-engagements/",
  "/decouvrir/",
];
const BLOG_FALLBACK_PATHS = ["/blog/", "/blog", "/actualites/", "/actualites", "/news/", "/news", "/magazine/"];

function findByPatterns(urls: string[], patterns: RegExp[]): string | undefined {
  return urls.find((u) => patterns.some((p) => p.test(u)));
}

async function probeFallbackPath(origin: string, paths: string[]): Promise<string | undefined> {
  // On teste en parallele mais on retourne le premier 2xx
  const results = await Promise.all(
    paths.map(async (p) => {
      const url = origin + p;
      const out = await fetchText(url, { timeoutMs: 5000, method: "HEAD" });
      return { url, ok: out.ok && (out.status ?? 0) < 400 };
    })
  );
  const hit = results.find((r) => r.ok);
  return hit?.url;
}

async function discoverFromSitemap(
  origin: string
): Promise<{ blog?: string; product?: string; about?: string }> {
  const out = await fetchText(`${origin}/sitemap.xml`, { timeoutMs: 6000 });
  if (!out.ok || !out.body) return {};
  const locRe = /<loc>([^<]+)<\/loc>/gi;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = locRe.exec(out.body)) !== null) urls.push(m[1].trim());
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
    about: findByPatterns(sameOrigin, ABOUT_PATTERNS),
  };
}

export async function discoverTypedUrls(
  home: string,
  homeOutcome: FetchOutcome
): Promise<DiscoveredUrls> {
  // On utilise l origine FINALE (apres redirect) pour construire les URLs absolues.
  // Exemple : amv.fr → www.amv.fr. Les sous-pages sans www peuvent renvoyer 404.
  const origin = rootOrigin(homeOutcome.url || home);
  const links = homeOutcome.body ? findInternalLinks(homeOutcome.body, origin) : [];

  let blog = findByPatterns(links, BLOG_PATTERNS);
  let about = findByPatterns(links, ABOUT_PATTERNS);
  let product = findByPatterns(links, PRODUCT_PATTERNS);

  // Fallback 1 : sitemap
  if (!blog || !product || !about) {
    const fromSitemap = await discoverFromSitemap(origin);
    if (!blog) blog = fromSitemap.blog;
    if (!product) product = fromSitemap.product;
    if (!about) about = fromSitemap.about;
  }

  // Fallback 2 : paths communs en HEAD (pour sites type AMV qui n ont pas le lien dans la home)
  if (!about) {
    about = await probeFallbackPath(origin, ABOUT_FALLBACK_PATHS);
  }
  if (!blog) {
    blog = await probeFallbackPath(origin, BLOG_FALLBACK_PATHS);
  }

  return { home, blog, about, product };
}

export async function fetchMany(urls: (string | undefined)[]): Promise<Array<FetchOutcome | null>> {
  return Promise.all(
    urls.map((u) => (u ? fetchText(u, { timeoutMs: 8000 }) : Promise.resolve<null>(null)))
  );
}
