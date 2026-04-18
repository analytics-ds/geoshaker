import type { Check, FetchOutcome } from "../types";
import { fetchText, rootOrigin } from "../fetcher";
import { extractTags, getAttr, hasAttrEquals } from "../html-parser";

export async function checkInternational(
  siteUrl: string,
  homeOutcome: FetchOutcome | null
): Promise<Check[]> {
  const origin = rootOrigin(siteUrl);
  const checks: Check[] = [];

  let hasHreflangEn = false;
  let enUrlFromHreflang: string | undefined;

  if (homeOutcome?.body) {
    const linkTags = extractTags(homeOutcome.body, "link");
    for (const tag of linkTags) {
      if (!hasAttrEquals(tag, "rel", "alternate")) continue;
      const hreflang = getAttr(tag, "hreflang");
      if (!hreflang) continue;
      if (/^en(-|$)/i.test(hreflang)) {
        hasHreflangEn = true;
        enUrlFromHreflang = getAttr(tag, "href");
        break;
      }
    }
  }

  let enAccessible = false;
  let enTestedUrl: string | undefined;
  if (hasHreflangEn && enUrlFromHreflang) {
    try {
      const abs = new URL(enUrlFromHreflang, origin + "/").toString();
      enTestedUrl = abs;
      const out = await fetchText(abs, { timeoutMs: 6000, method: "HEAD" });
      enAccessible = out.ok;
    } catch {
      enAccessible = false;
    }
  }
  if (!enAccessible) {
    enTestedUrl = `${origin}/en/`;
    const out = await fetchText(enTestedUrl, { timeoutMs: 6000, method: "HEAD" });
    enAccessible = out.ok;
  }

  const status: Check["status"] = hasHreflangEn && enAccessible
    ? "pass"
    : enAccessible
    ? "warn"
    : "fail";

  checks.push({
    id: "7.1",
    step: 7,
    label: "Version anglaise accessible et déclarée",
    priority: "MOYENNE",
    status,
    detail:
      status === "pass"
        ? `Version EN détectée via hreflang et accessible : ${enTestedUrl}.`
        : status === "warn"
        ? `URL EN accessible sur ${enTestedUrl} mais aucune balise hreflang=« en » détectée sur votre page d’accueil.`
        : "Aucune version anglaise détectée (ni via hreflang, ni via /en/).",
    advice:
      status === "pass"
        ? undefined
        : "Créez une version anglaise du contenu à /en/ ou sur un sous-domaine, puis déclarez-la via <link rel=\"alternate\" hreflang=\"en\" href=\"...\">. Cela ouvre votre site aux IA anglophones.",
  });

  return checks;
}
