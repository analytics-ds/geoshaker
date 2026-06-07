import type { FetchOutcome } from "./types";
import { brightDataFetch, looksLikeChallengePage } from "./brightdata";

const GEOSHAKER_UA = "GEOshaker/1.0 (+https://geoshaker.fr; audit GEO)";
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const GPTBOT_UA =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";

const DEFAULT_TIMEOUT = 10_000;

export function normalizeUrl(raw: string): string {
  let v = raw.trim();
  if (!v) throw new Error("URL vide");
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  const u = new URL(v);
  u.hash = "";
  return u.toString();
}

export function rootOrigin(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

// Codes ou un autre User-Agent peut passer : on poursuit la cascade d'UA.
function shouldRetryUa(status?: number): boolean {
  return status === 403 || status === 401 || status === 429 || status === 503;
}

// Codes qui justifient le fallback Bright Data : blocages WAF (401/403/429) et
// erreurs edge Cloudflare (52x, dont le 525 same-account). Une IP residentielle
// externe contourne ces deux familles. On exclut 404 / autres 4xx / 5xx serveur
// classiques (5xx hors 52x) ou aucun proxy n'aiderait.
function shouldFallback(status?: number): boolean {
  if (status === undefined) return false;
  if (status === 401 || status === 403 || status === 429) return true;
  return status >= 520 && status <= 530; // 520-526, 530 : erreurs edge Cloudflare
}

async function singleFetch(
  url: string,
  ua: string,
  method: string,
  timeoutMs: number
): Promise<FetchOutcome> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": ua,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain,*/*;q=0.8",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br",
      },
      cache: "no-store",
    });
    const ttfb = Math.round(performance.now() - start);
    const contentType = res.headers.get("content-type") ?? "";
    const body = method === "HEAD" ? "" : await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      body,
      ttfbMs: ttfb,
      contentType,
      contentEncoding: res.headers.get("content-encoding") ?? undefined,
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, url, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch une URL. Si un UA specifique est fourni, on respecte strictement ce choix
 * (utilise pour les tests d acces bot IA). Sinon, on applique une cascade :
 * 1. GEOshaker UA (honnete)
 * 2. Chrome UA (bypass WAF basiques)
 * 3. GPTBot UA (bypass WAF qui whitelistent les bots connus)
 */
function hostVariant(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.startsWith("www.")) u.hostname = u.hostname.slice(4);
    else u.hostname = "www." + u.hostname;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Recupere la home en tolerant les variantes d'hote.
 * Beaucoup de sites ne vivent que sur www (ou que sur l'apex), ou ne servent le
 * certificat que sur l'une des deux formes (l'autre renvoie 525/TLS/redirect).
 * Si l'URL saisie echoue (reseau, TLS, 5xx/52x, WAF non debloque), on tente
 * automatiquement la variante d'hote (www <-> apex), puis http://, avant
 * d'abandonner. On ne renvoie l'echec d'origine que si aucune variante ne marche.
 */
export async function fetchHome(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<FetchOutcome> {
  const first = await fetchText(url, opts);
  if (first.ok) return first;

  const variant = hostVariant(url);
  if (variant) {
    const second = await fetchText(variant, opts);
    if (second.ok) return second;
  }

  try {
    const httpUrl = new URL(url);
    if (httpUrl.protocol === "https:") {
      httpUrl.protocol = "http:";
      const third = await fetchText(httpUrl.toString(), opts);
      if (third.ok) return third;
    }
  } catch {
    // ignore
  }

  return first;
}

export async function fetchText(
  url: string,
  opts?: { timeoutMs?: number; method?: string; ua?: string }
): Promise<FetchOutcome> {
  const method = opts?.method ?? "GET";
  const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT;

  // Test d'acces bot a UA impose (ex : GPTBot) : on respecte strictement le
  // choix et on NE bascule PAS sur Bright Data. Ce test doit mesurer l'acces
  // reel depuis une IP datacenter, pas le tricher via un proxy residentiel.
  if (opts?.ua) {
    return singleFetch(url, opts.ua, method, timeout);
  }

  const cascade = [GEOSHAKER_UA, CHROME_UA, GPTBOT_UA];
  let last: FetchOutcome | null = null;
  for (const ua of cascade) {
    const res = await singleFetch(url, ua, method, timeout);
    const challenge = method === "GET" && !!res.body && looksLikeChallengePage(res.body);
    // Succes franc (et pas un challenge anti-bot deguise en 200) : on rend.
    if (res.ok && !challenge) {
      return res;
    }
    last = res;
    // Challenge servi en 200, ou code non recuperable par un autre UA
    // (404, 5xx, 52x, reseau) : inutile d'essayer les UA suivants.
    if (challenge || !shouldRetryUa(res.status)) {
      break;
    }
  }

  // Fallback Bright Data Web Unlocker (IP residentielle FR), reserve au GET.
  // Declenche sur blocage WAF / erreur edge CF, ou sur un challenge anti-bot.
  if (method === "GET" && last) {
    const challengeLast = !!last.body && looksLikeChallengePage(last.body);
    if (challengeLast || shouldFallback(last.status)) {
      const body = await brightDataFetch(url, { timeoutMs: timeout * 2 });
      if (body) {
        return {
          ok: true,
          status: 200,
          url,
          body,
          contentType: "text/html",
          via: "brightdata",
        };
      }
    }
  }

  return last ?? { ok: false, url };
}
