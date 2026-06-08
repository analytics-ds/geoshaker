import type { Check, FetchOutcome } from "../types";
import { fetchText, rootOrigin } from "../fetcher";
import { extractTags, extractBlocks, getAttr, hasAttrEquals } from "../html-parser";
import { extractJsonLd, extractSchemaTypes } from "./jsonld";

function extractSocialMeta(html: string): { og: number; twitter: boolean } {
  const metaTags = extractTags(html, "meta");
  let og = 0;
  let twitter = false;
  for (const t of metaTags) {
    const key = (getAttr(t, "property") ?? getAttr(t, "name") ?? "").toLowerCase();
    if (key === "og:title" || key === "og:description" || key === "og:image" || key === "og:type" || key === "og:url") og++;
    if (key === "twitter:card") twitter = true;
  }
  return { og, twitter };
}

function hasFaqBlock(html: string): boolean {
  const types = extractSchemaTypes(extractJsonLd(html));
  if (types.includes("FAQPage") || types.includes("QAPage")) return true;
  if (/<details[\s>]/i.test(html)) return true;
  return false;
}

function hasClickableToc(html: string): boolean {
  // Sommaire = plusieurs liens d ancrage internes, generalement en haut de page.
  const top = html.slice(0, Math.max(2000, Math.floor(html.length * 0.5)));
  const anchors = extractTags(top, "a");
  const targets = new Set<string>();
  for (const a of anchors) {
    const href = getAttr(a, "href");
    if (href && /^#[\w-]{2,}$/.test(href) && !/^#(top|content|main|menu|nav)$/i.test(href)) {
      targets.add(href.toLowerCase());
    }
  }
  return targets.size >= 3;
}

export function textContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findInternalLinks(html: string, origin: string): string[] {
  const tags = extractTags(html, "a");
  const urls = new Set<string>();
  for (const t of tags) {
    const href = getAttr(t, "href");
    if (!href || href.startsWith("#")) continue;
    try {
      const abs = new URL(href, origin + "/").toString().split("#")[0];
      if (abs.startsWith(origin)) urls.add(abs);
    } catch {
      // ignore
    }
  }
  return Array.from(urls);
}

function countMixedContent(html: string): number {
  const srcOrHref = /<[^>]+\s(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = srcOrHref.exec(html)) !== null) {
    const v = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (/^http:\/\//i.test(v)) count++;
  }
  return count;
}

interface PageProbe {
  label: string; // "accueil", "blog", "à propos"…
  url: string;
  html: string;
}

function probeH1(p: PageProbe): { count: number; firstText: string } {
  const h1s = extractBlocks(p.html, "h1").map(textContent);
  return { count: h1s.length, firstText: h1s[0] ?? "" };
}

function probeMetaDesc(p: PageProbe): string | undefined {
  const metaTags = extractTags(p.html, "meta");
  const tag = metaTags.find((t) => hasAttrEquals(t, "name", "description"));
  return tag ? getAttr(tag, "content") : undefined;
}

function probeCanonical(p: PageProbe, origin: string): { ok: boolean; target?: string } {
  const linkTags = extractTags(p.html, "link");
  const tag = linkTags.find((t) => hasAttrEquals(t, "rel", "canonical"));
  const raw = tag ? getAttr(tag, "href") : undefined;
  if (!raw) return { ok: false };
  try {
    const abs = new URL(raw, origin + "/").toString();
    const norm = (u: string) => u.replace(/\/$/, "");
    return { ok: norm(abs) === norm(p.url), target: abs };
  } catch {
    return { ok: false, target: raw };
  }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/$/, "");
    return p || "/";
  } catch {
    return url;
  }
}

export async function checkOnPage(params: {
  siteUrl: string;
  homeOutcome: FetchOutcome | null;
  extraOutcomes: Array<{ label: "blog" | "about" | "product"; outcome: FetchOutcome | null }>;
  robotsBody?: string;
  sitemapUrlsFromRobots: string[];
}): Promise<Check[]> {
  const { siteUrl, homeOutcome, extraOutcomes, robotsBody, sitemapUrlsFromRobots } = params;
  const origin = rootOrigin(siteUrl);
  const checks: Check[] = [];

  // 6f HTTPS + mixed content
  const homeHttps = homeOutcome?.url?.startsWith("https://") ?? false;
  const mixedCount = homeOutcome?.body ? countMixedContent(homeOutcome.body) : 0;
  checks.push({
    id: "6f",
    step: 6,
    label: "Site intégralement en HTTPS (pas de contenu mixte)",
    priority: "HAUTE",
    status: homeHttps && mixedCount === 0 ? "pass" : homeHttps ? "warn" : "fail",
    detail: homeHttps
      ? mixedCount === 0
        ? "Page servie en HTTPS sans référence http:// détectée."
        : `${mixedCount} référence(s) http:// détectée(s) dans le HTML (contenu mixte).`
      : "La page finale n’est pas en HTTPS.",
    advice:
      homeHttps && mixedCount === 0
        ? undefined
        : "Forcez HTTPS sur l’ensemble du site et remplacez toutes les URLs absolues en http:// par du https:// ou des chemins relatifs.",
  });

  // 6a Sitemap
  let sitemapUrl = sitemapUrlsFromRobots[0];
  if (!sitemapUrl) sitemapUrl = `${origin}/sitemap.xml`;
  const sitemapOutcome = await fetchText(sitemapUrl);
  const looksLikeXml = sitemapOutcome.body
    ? /<\?xml|<urlset[\s>]|<sitemapindex[\s>]/i.test(sitemapOutcome.body)
    : false;
  const sitemapExists = sitemapOutcome.ok && looksLikeXml;
  const referenced = /sitemap\s*:/i.test(robotsBody ?? "");
  checks.push({
    id: "6a",
    step: 6,
    label: "Sitemap.xml présent et référencé dans robots.txt",
    priority: "HAUTE",
    status: sitemapExists && referenced ? "pass" : sitemapExists ? "warn" : "fail",
    detail: sitemapExists
      ? referenced
        ? `Sitemap accessible sur ${sitemapUrl} et référencé dans votre robots.txt.`
        : `Sitemap accessible sur ${sitemapUrl} mais non référencé dans votre robots.txt.`
      : `Aucun sitemap détecté à ${sitemapUrl}.`,
    advice:
      sitemapExists && referenced
        ? undefined
        : "Ajoutez la ligne « Sitemap: https://votre-site/sitemap.xml » dans votre robots.txt.",
  });

  // 6b Sample sitemap URLs
  if (sitemapExists && sitemapOutcome.body) {
    let locs: string[] = [];
    const isIndex = /<sitemapindex[\s>]/i.test(sitemapOutcome.body);
    if (isIndex) {
      const subRe = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi;
      const subSitemaps: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = subRe.exec(sitemapOutcome.body)) !== null) {
        const loc = m[1].match(/<loc>([^<]+)<\/loc>/i)?.[1];
        if (loc) subSitemaps.push(loc.trim());
      }
      if (subSitemaps.length > 0) {
        const subOut = await fetchText(subSitemaps[0], { timeoutMs: 6000 });
        if (subOut.ok && subOut.body) {
          const locRe = /<loc>([^<]+)<\/loc>/gi;
          while ((m = locRe.exec(subOut.body)) !== null) locs.push(m[1].trim());
        }
      }
    } else {
      const locRe = /<loc>([^<]+)<\/loc>/gi;
      let m: RegExpExecArray | null;
      while ((m = locRe.exec(sitemapOutcome.body)) !== null) locs.push(m[1].trim());
    }
    const sample = locs.slice(0, 5);
    if (sample.length === 0) {
      checks.push({
        id: "6b",
        step: 6,
        label: "Sitemap avec pages stratégiques sans erreurs",
        priority: "HAUTE",
        status: "warn",
        detail: "Sitemap accessible mais aucune balise <loc> détectée.",
      });
    } else {
      const results = await Promise.all(
        sample.map((u) => fetchText(u, { timeoutMs: 6000, method: "HEAD" }))
      );
      const errors = results.filter((r) => !r.ok || (r.status ?? 0) >= 400);
      checks.push({
        id: "6b",
        step: 6,
        label: "Sitemap avec pages stratégiques sans erreurs",
        priority: "HAUTE",
        status: errors.length === 0 ? "pass" : errors.length <= 1 ? "warn" : "fail",
        detail:
          errors.length === 0
            ? `${sample.length} URL(s) du sitemap testée(s), toutes renvoient 2xx/3xx.`
            : `${errors.length} URL(s) en erreur sur ${sample.length} testées.`,
        advice:
          errors.length === 0
            ? undefined
            : "Nettoyez votre sitemap en retirant les URLs qui renvoient 404 ou 5xx.",
      });
    }
  } else {
    checks.push({
      id: "6b",
      step: 6,
      label: "Sitemap avec pages stratégiques sans erreurs",
      priority: "HAUTE",
      status: "skip",
      detail: "Non testable sans sitemap accessible.",
    });
  }

  // Construit la liste des pages sondees : home + extras accessibles
  const probes: PageProbe[] = [];
  if (homeOutcome?.ok && homeOutcome.body) {
    probes.push({ label: "accueil", url: homeOutcome.url, html: homeOutcome.body });
  }
  for (const e of extraOutcomes) {
    if (e.outcome?.ok && e.outcome.body) {
      const label = e.label === "blog" ? "blog" : e.label === "about" ? "à propos" : "produit";
      probes.push({ label, url: e.outcome.url, html: e.outcome.body });
    }
  }

  if (probes.length === 0) {
    for (const [id, priority, label] of [
      ["6c", "HAUTE", "H1 unique et descriptif sur chaque page"],
      ["6d", "MOYENNE", "Meta description présente et différenciée"],
      ["6e", "MOYENNE", "Canonical auto-référencée"],
      ["6g", "MOYENNE", "Hiérarchie H1 > H2 > H3 logique"],
      ["6h", "MOYENNE", "Minimum 300 mots de contenu éditorial"],
    ] as const) {
      checks.push({
        id: id as Check["id"],
        step: 6,
        label,
        priority,
        status: "skip",
        detail: "Page d’accueil non accessible.",
      });
    }
    return checks;
  }

  // 6c : H1 unique et descriptif sur chaque page testée
  const h1Results = probes.map((p) => ({ label: p.label, path: shortPath(p.url), ...probeH1(p) }));
  const h1Failures = h1Results.filter((r) => r.count !== 1 || r.firstText.length < 10);
  const h1Detail = h1Results
    .map((r) => `${r.label} (${r.path}) : ${r.count === 0 ? "aucun H1" : r.count === 1 ? `H1 = « ${r.firstText.slice(0, 50)} »` : `${r.count} H1`}`)
    .join(" · ");
  checks.push({
    id: "6c",
    step: 6,
    label: `H1 unique et descriptif sur chaque page testée (${probes.length} pages)`,
    priority: "HAUTE",
    status: h1Failures.length === 0 ? "pass" : h1Failures.length === probes.length ? "fail" : "warn",
    detail: h1Detail,
    advice:
      h1Failures.length === 0
        ? undefined
        : "Gardez une seule balise H1 par page, descriptive (10 caractères minimum), qui reflète le sujet principal.",
  });

  // 6d : Meta description presente sur chaque page
  const metaResults = probes.map((p) => ({ label: p.label, path: shortPath(p.url), value: probeMetaDesc(p) }));
  const metaMissing = metaResults.filter((r) => !r.value);
  const metaTooShort = metaResults.filter((r) => r.value && (r.value.length < 70 || r.value.length > 170));
  const metaDuplicates = new Set<string>();
  const seen = new Set<string>();
  for (const r of metaResults) {
    if (!r.value) continue;
    if (seen.has(r.value)) metaDuplicates.add(r.value);
    seen.add(r.value);
  }
  const metaDetail = metaResults
    .map((r) => `${r.label} : ${r.value ? `${r.value.length} car` : "absente"}`)
    .join(" · ") + (metaDuplicates.size > 0 ? ", doublon détecté" : "");
  const metaStatus: Check["status"] = metaMissing.length === probes.length
    ? "fail"
    : (metaMissing.length > 0 || metaDuplicates.size > 0 || metaTooShort.length > 0)
    ? "warn"
    : "pass";
  checks.push({
    id: "6d",
    step: 6,
    label: "Meta description présente et différenciée",
    priority: "MOYENNE",
    status: metaStatus,
    detail: metaDetail,
    advice:
      metaStatus === "pass"
        ? undefined
        : "Rédigez une meta description unique entre 70 et 170 caractères sur chaque page stratégique.",
  });

  // 6e : Canonical auto-reference sur chaque page
  const canonResults = probes.map((p) => ({ label: p.label, path: shortPath(p.url), ...probeCanonical(p, origin) }));
  const canonMissing = canonResults.filter((r) => !r.target);
  const canonMismatch = canonResults.filter((r) => r.target && !r.ok);
  const canonDetail = canonResults
    .map((r) => `${r.label} : ${r.target ? (r.ok ? "auto-référencée ✓" : "pointe ailleurs") : "absente"}`)
    .join(" · ");
  const canonStatus: Check["status"] = canonMissing.length === probes.length
    ? "fail"
    : canonMissing.length > 0 || canonMismatch.length > 0
    ? "warn"
    : "pass";
  checks.push({
    id: "6e",
    step: 6,
    label: "Canonical auto-référencée sur chaque page testée",
    priority: "MOYENNE",
    status: canonStatus,
    detail: canonDetail,
    advice:
      canonStatus === "pass"
        ? undefined
        : "Ajoutez <link rel=\"canonical\" href=\"URL de la page\"> qui pointe vers la page elle-même. Best practice Google : chaque page (y compris la home) déclare sa propre URL canonique.",
  });

  // 6g Hierarchie Hn (sur la home uniquement, c est representatif)
  const firstProbe = probes[0];
  const h2s = extractBlocks(firstProbe.html, "h2").length;
  const h3s = extractBlocks(firstProbe.html, "h3").length;
  const h1Count = extractBlocks(firstProbe.html, "h1").length;
  const hasH1 = h1Count >= 1;
  const hierarchyOk = hasH1 && h2s >= 1 && !(h3s > 0 && h2s === 0);
  checks.push({
    id: "6g",
    step: 6,
    label: "Hiérarchie H1 > H2 > H3 logique",
    priority: "MOYENNE",
    status: hierarchyOk ? "pass" : "warn",
    detail: `Sur la page d’accueil : ${h1Count} H1, ${h2s} H2, ${h3s} H3.`,
    advice: hierarchyOk
      ? undefined
      : "Structurez votre contenu avec 1 H1, plusieurs H2 pour les sections, des H3 pour les sous-sections. Ne sautez pas de niveaux.",
  });

  // 6h 300 mots (home)
  const text = textContent(firstProbe.html);
  const words = text.split(/\s+/).filter((w) => w.length > 1).length;
  const ratio = text.length / Math.max(firstProbe.html.length, 1);
  const ratioPct = Math.round(ratio * 100);
  const enoughWords = words >= 300;
  const status6h: Check["status"] = enoughWords
    ? "pass"
    : words >= 150
    ? "warn"
    : "fail";
  checks.push({
    id: "6h",
    step: 6,
    label: "Minimum 300 mots de contenu éditorial",
    priority: "MOYENNE",
    status: status6h,
    detail: `${words} mots lisibles dans le HTML de la page d’accueil (texte lu sans exécuter JavaScript, soit la vue d’un crawler IA), ratio texte/code ${ratioPct} %.`,
    advice:
      status6h === "pass"
        ? undefined
        : "Visez un minimum de 300 mots de contenu éditorial par page. Les IA ont besoin de matière textuelle pour comprendre et citer votre site.",
  });

  // 6i OpenGraph + Twitter Card (sur la home)
  const social = extractSocialMeta(firstProbe.html);
  const ogOk = social.og >= 2;
  const socialStatus: Check["status"] = ogOk && social.twitter ? "pass" : ogOk || social.twitter ? "warn" : "fail";
  checks.push({
    id: "6i",
    step: 6,
    label: "Balises OpenGraph et Twitter Card",
    priority: "HAUTE",
    status: socialStatus,
    detail:
      socialStatus === "pass"
        ? "OpenGraph et Twitter Card présents : votre contenu est correctement décrit quand il est partagé ou cité."
        : ogOk
        ? "OpenGraph présent mais pas de Twitter Card (twitter:card). Le partage sur X et la lecture par certaines IA est dégradé."
        : social.twitter
        ? "Twitter Card présente mais OpenGraph incomplet (og:title, og:description, og:image manquants)."
        : "Aucune balise OpenGraph ni Twitter Card détectée. Quand votre page est partagée ou citée, aucun titre, description ou image n’est exposé.",
    advice:
      socialStatus === "pass"
        ? undefined
        : "Ajoutez les balises OpenGraph (og:title, og:description, og:image, og:type, og:url) et une twitter:card dans le <head> de chaque page stratégique.",
  });

  // 6j FAQ en accordéon (FAQPage JSON-LD ou <details>)
  const faq = hasFaqBlock(firstProbe.html);
  checks.push({
    id: "6j",
    step: 6,
    label: "Section FAQ structurée (accordéon ou FAQPage)",
    priority: "MOYENNE",
    status: faq ? "pass" : "fail",
    detail: faq
      ? "Bloc FAQ détecté (schéma FAQPage ou éléments <details>). Format idéal pour être repris en réponse directe par les IA."
      : "Aucune FAQ structurée détectée. Les questions/réponses sont le format le plus cité par ChatGPT, Perplexity et les AI Overviews.",
    advice: faq
      ? undefined
      : "Ajoutez une FAQ en accordéon HTML5 (<details>/<summary>) avec un schéma FAQPage en JSON-LD sur vos pages stratégiques.",
  });

  // 6k Sommaire cliquable sous le H1
  const toc = hasClickableToc(firstProbe.html);
  checks.push({
    id: "6k",
    step: 6,
    label: "Sommaire cliquable (table des matières)",
    priority: "MOYENNE",
    status: toc ? "pass" : "fail",
    detail: toc
      ? "Sommaire d’ancrages internes détecté. Il aide les IA à cartographier la structure de la page et à citer la bonne section."
      : "Aucun sommaire cliquable détecté. Sur les pages longues, une table des matières avec ancres aide les IA à extraire la bonne section.",
    advice: toc
      ? undefined
      : "Ajoutez sous le H1 un sommaire avec des liens d’ancrage (<a href=\"#section\">) pointant vers vos H2, sur vos pages de contenu longues.",
  });

  // 6l Codes HTTP des pages stratégiques
  const httpProbed: Array<{ label: string; outcome: FetchOutcome }> = [];
  if (homeOutcome) httpProbed.push({ label: "accueil", outcome: homeOutcome });
  for (const e of extraOutcomes) {
    if (e.outcome) {
      const label = e.label === "blog" ? "blog" : e.label === "about" ? "à propos" : "produit";
      httpProbed.push({ label, outcome: e.outcome });
    }
  }
  const httpErrors = httpProbed.filter((p) => !p.outcome.ok || (p.outcome.status ?? 0) >= 400);
  const httpDetail = httpProbed
    .map((p) => `${p.label} : ${p.outcome.status ?? "erreur"}`)
    .join(" · ");
  checks.push({
    id: "6l",
    step: 6,
    label: "Codes HTTP corrects sur les pages stratégiques",
    priority: "HAUTE",
    status: httpProbed.length === 0 ? "skip" : httpErrors.length === 0 ? "pass" : httpErrors.length === 1 ? "warn" : "fail",
    detail:
      httpProbed.length === 0
        ? "Aucune page stratégique testable."
        : httpErrors.length === 0
        ? `Toutes les pages testées répondent correctement (${httpDetail}).`
        : `${httpErrors.length} page(s) en erreur. ${httpDetail}.`,
    advice:
      httpErrors.length === 0
        ? undefined
        : "Corrigez les pages qui ne renvoient pas un 200 : une page stratégique en 404/410/5xx ne sera ni indexée ni citée par les IA.",
  });

  return checks;
}
