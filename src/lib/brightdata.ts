// Fallback Bright Data Web Unlocker, repris du pattern Datafer (crawl cascade).
// Sert uniquement de filet quand le fetch direct depuis l'IP du Worker Cloudflare
// se fait bloquer par un WAF / anti-bot (Cloudflare, DataDome, PerimeterX...).
// Web Unlocker sort sur une IP residentielle FR et resout la plupart des blocages.
//
// Endpoint : POST https://api.brightdata.com/request
// Tarif (mai 2026) : ~$1.50/CPM (+$1/CPM domaines premium). Comme on ne l'appelle
// qu'en fallback, le cout reste limite aux sites reellement proteges.

import { getCloudflareContext } from "@opennextjs/cloudflare";

type BrightDataEnv = {
  BRIGHTDATA_TOKEN?: string;
  BRIGHTDATA_ZONE?: string;
};

function readEnv(): BrightDataEnv {
  try {
    const { env } = getCloudflareContext();
    return env as unknown as BrightDataEnv;
  } catch {
    return {};
  }
}

export function brightDataConfigured(): boolean {
  const env = readEnv();
  return Boolean(env.BRIGHTDATA_TOKEN && env.BRIGHTDATA_ZONE);
}

// Recupere le HTML/XML d'une URL via Bright Data Web Unlocker.
// Retourne null si non configure, si la requete echoue, ou si on recoit
// encore une page de challenge.
export async function brightDataFetch(
  url: string,
  opts: { timeoutMs?: number; country?: string } = {}
): Promise<string | null> {
  const env = readEnv();
  const token = env.BRIGHTDATA_TOKEN;
  const zone = env.BRIGHTDATA_ZONE;
  if (!token || !zone) return null;

  try {
    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        zone,
        url,
        format: "raw",
        country: opts.country ?? "fr",
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
    if (!r.ok) return null;
    const body = await r.text();
    if (!body || looksLikeChallengePage(body)) return null;
    return body;
  } catch {
    return null;
  }
}

// Detection grossiere d'un challenge anti-bot servi a la place du contenu.
// Utilise pour decider d'un fallback (HTML direct suspect) et pour rejeter
// une reponse Bright Data qui serait elle-meme un challenge.
export function looksLikeChallengePage(body: string): boolean {
  if (!body) return false;
  const lower = body.slice(0, 2000).toLowerCase();
  return (
    lower.includes("datadome") ||
    lower.includes("captcha-delivery") ||
    lower.includes("please enable js") ||
    lower.includes("perimeterx") ||
    lower.includes("__cf_chl") ||
    lower.includes("just a moment...") ||
    lower.includes("checking your browser") ||
    lower.includes("incapsula")
  );
}
