import type { FetchOutcome } from "./types";

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

function shouldRetry(status?: number): boolean {
  return status === 403 || status === 401 || status === 429 || status === 503;
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
 * Recupere la home en tolerant les domaines apex sans HTTPS.
 * Beaucoup de sites ne servent le certificat que sur www. et ne redirigent
 * l apex qu en HTTP. Si https://apex echoue au niveau reseau/TLS (aucun
 * status HTTP en retour), on retente la variante www. puis http:// avant
 * d abandonner. Un 4xx/5xx est en revanche conserve (l hote est joignable).
 */
export async function fetchHome(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<FetchOutcome> {
  const first = await fetchText(url, opts);
  if (first.status) return first;

  const variant = hostVariant(url);
  if (variant) {
    const second = await fetchText(variant, opts);
    if (second.status) return second;
  }

  try {
    const httpUrl = new URL(url);
    if (httpUrl.protocol === "https:") {
      httpUrl.protocol = "http:";
      const third = await fetchText(httpUrl.toString(), opts);
      if (third.status) return third;
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

  if (opts?.ua) {
    return singleFetch(url, opts.ua, method, timeout);
  }

  const cascade = [GEOSHAKER_UA, CHROME_UA, GPTBOT_UA];
  let last: FetchOutcome | null = null;
  for (const ua of cascade) {
    const res = await singleFetch(url, ua, method, timeout);
    if (res.ok || !shouldRetry(res.status)) {
      return res;
    }
    last = res;
  }
  return last ?? { ok: false, url };
}
