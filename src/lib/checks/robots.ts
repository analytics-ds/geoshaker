import type { Check, FetchOutcome } from "../types";
import { fetchText, rootOrigin } from "../fetcher";

interface RobotsGroup {
  agents: string[];
  allows: string[];
  disallows: string[];
}

function parseRobots(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allows: [], disallows: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current) {
      lastWasAgent = false;
      if (field === "allow") current.allows.push(value);
      else if (field === "disallow") current.disallows.push(value);
    }
  }
  return groups;
}

function isBotAllowed(groups: RobotsGroup[], bot: string): "allowed" | "blocked" | "no-rule" {
  const lc = bot.toLowerCase();
  const specific = groups.find((g) => g.agents.includes(lc));
  if (specific) {
    const blocks = specific.disallows.some((d) => d === "/" || d === "/*");
    return blocks ? "blocked" : "allowed";
  }
  const wildcard = groups.find((g) => g.agents.includes("*"));
  if (wildcard) {
    const blocks = wildcard.disallows.some((d) => d === "/" || d === "/*");
    return blocks ? "blocked" : "no-rule";
  }
  return "no-rule";
}

type BotSpec = {
  id: Check["id"];
  bot: string;
  aiName: string;
  ua: string;
  // Si true : on teste vraiment l acces avec cet UA. Google-Extended est une directive, pas un bot reel.
  testAccess: boolean;
};

const BOTS: BotSpec[] = [
  {
    id: "1.1",
    bot: "GPTBot",
    aiName: "ChatGPT",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    testAccess: true,
  },
  {
    id: "1.2",
    bot: "ClaudeBot",
    aiName: "Claude",
    ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    testAccess: true,
  },
  {
    id: "1.3",
    bot: "PerplexityBot",
    aiName: "Perplexity",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://www.perplexity.ai/perplexitybot)",
    testAccess: true,
  },
  {
    id: "1.4",
    bot: "Google-Extended",
    aiName: "Gemini et AI Overviews",
    // Google-Extended est une directive robots.txt, pas un UA distinct. Google crawle avec Googlebot.
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    testAccess: false,
  },
];

async function testBotAccess(
  siteUrl: string,
  ua: string
): Promise<{ ok: boolean; status?: number }> {
  const out = await fetchText(siteUrl, { timeoutMs: 7000, method: "GET", ua });
  return { ok: out.ok, status: out.status };
}

export async function checkRobots(siteUrl: string): Promise<{
  checks: Check[];
  body?: string;
  sitemapUrls: string[];
  homeOutcomeByBot: Record<string, FetchOutcome>;
}> {
  const origin = rootOrigin(siteUrl);
  const robotsUrl = `${origin}/robots.txt`;
  const out = await fetchText(robotsUrl);

  const sitemapUrls: string[] = [];
  let groups: RobotsGroup[] = [];
  let present = false;
  if (out.ok && out.body) {
    present = true;
    groups = parseRobots(out.body);
    for (const line of out.body.split(/\r?\n/)) {
      const m = line.match(/^\s*sitemap\s*:\s*(.+?)\s*$/i);
      if (m) sitemapUrls.push(m[1]);
    }
  }

  // Parallel UA access tests pour les bots reels (GPTBot, ClaudeBot, PerplexityBot)
  const uaTests = await Promise.all(
    BOTS.map(async (b) => {
      if (!b.testAccess) return { bot: b.bot, ok: true, status: undefined as number | undefined };
      const r = await testBotAccess(siteUrl, b.ua);
      return { bot: b.bot, ok: r.ok, status: r.status };
    })
  );
  const uaByBot: Record<string, { ok: boolean; status?: number }> = {};
  for (const t of uaTests) uaByBot[t.bot] = { ok: t.ok, status: t.status };

  const homeOutcomeByBot: Record<string, FetchOutcome> = {};

  const checks: Check[] = [];
  for (const spec of BOTS) {
    const { id, bot, aiName, testAccess } = spec;
    const robotsVerdict = present ? isBotAllowed(groups, bot) : "no-rule";
    const uaRes = uaByBot[bot];

    // Cas Google-Extended : pas de test UA, uniquement robots.txt
    if (!testAccess) {
      let status: Check["status"];
      let detail: string;
      let advice: string | undefined;
      if (!present) {
        status = "warn";
        detail = `Aucun fichier robots.txt détecté. En l’absence de règle explicite, ${aiName} est techniquement autorisé mais une déclaration est recommandée.`;
        advice = `Créez un robots.txt avec : User-agent: ${bot}\\nAllow: /`;
      } else if (robotsVerdict === "blocked") {
        status = "fail";
        detail = `${bot} est bloqué par un Disallow: / dans votre robots.txt. ${aiName} ne pourra pas utiliser votre contenu.`;
        advice = `Retirez le Disallow: / pour ${bot} ou ajoutez explicitement : User-agent: ${bot}\\nAllow: /`;
      } else if (robotsVerdict === "allowed") {
        status = "pass";
        detail = `${bot} est autorisé par une règle explicite dans votre robots.txt.`;
      } else {
        status = "pass";
        detail = `Aucune règle spécifique pour ${bot}. En l’absence de Disallow: / global, l’accès est autorisé par défaut.`;
      }
      checks.push({
        id,
        step: 1,
        label: `${aiName} peut utiliser votre site (${bot})`,
        priority: "BLOQUANT",
        status,
        detail,
        advice,
      });
      continue;
    }

    // Bots avec test d acces reel
    const uaBlocked = !uaRes.ok && (uaRes.status === 403 || uaRes.status === 401 || uaRes.status === 429);
    const uaOtherFail = !uaRes.ok && !uaBlocked;

    let status: Check["status"];
    let detail: string;
    let advice: string | undefined;

    if (robotsVerdict === "blocked") {
      // robots.txt bloque : ca prime
      status = "fail";
      detail = `${bot} est bloqué par un Disallow: / dans votre robots.txt. ${aiName} ne peut pas crawler le site.`;
      advice = `Retirez le Disallow: / pour ${bot} ou ajoutez explicitement : User-agent: ${bot}\\nAllow: /`;
    } else if (uaBlocked) {
      // robots.txt autorise mais le pare-feu bloque : le piege classique Cloudflare/WAF
      status = "fail";
      detail = `${bot} est autorisé dans votre robots.txt, mais votre pare-feu (Cloudflare, Akamai, DataDome…) renvoie ${uaRes.status} quand ${aiName} se présente. Résultat : ${aiName} ne peut pas lire votre site.`;
      advice = `Dans votre WAF ou CDN, autorisez explicitement l’IP range et l’User-Agent « ${bot} ». Pour Cloudflare, vérifiez les règles Bot Fight Mode et Managed Rules.`;
    } else if (uaOtherFail) {
      status = "warn";
      detail = `Test d’accès inconclu pour ${bot} (statut ${uaRes.status ?? "erreur réseau"}). robots.txt autorise mais la connexion a échoué.`;
      advice = "Vérifiez la disponibilité du site et l’absence de règles WAF bloquant cet User-Agent.";
    } else {
      // UA OK + robots.txt pas bloquant
      if (robotsVerdict === "allowed") {
        status = "pass";
        detail = `${aiName} peut accéder à votre site (${bot}) : robots.txt autorise explicitement ET la requête passe les pare-feux.`;
      } else {
        status = "pass";
        detail = `${aiName} peut accéder à votre site (${bot}) : aucun Disallow: / global, et la requête avec l’User-Agent officiel de ${bot} passe sans problème.`;
      }
    }

    const outcome: FetchOutcome = {
      ok: uaRes.ok,
      status: uaRes.status,
      url: siteUrl,
    };
    homeOutcomeByBot[bot] = outcome;

    checks.push({
      id,
      step: 1,
      label: `${aiName} peut lire votre site (${bot})`,
      priority: "BLOQUANT",
      status,
      detail,
      advice,
    });
  }

  if (!present) {
    checks.push({
      id: "1.5",
      step: 1,
      label: "Pas de Disallow: / global",
      priority: "BLOQUANT",
      status: "warn",
      detail: `Aucun fichier robots.txt détecté sur ${origin}.`,
      advice: "Ajoutez un fichier /robots.txt explicite pour contrôler l’accès des IA.",
    });
  } else {
    const wildcard = groups.find((g) => g.agents.includes("*"));
    const blocksAll = wildcard?.disallows.some((d) => d === "/" || d === "/*") ?? false;
    checks.push({
      id: "1.5",
      step: 1,
      label: "Pas de Disallow: / global",
      priority: "BLOQUANT",
      status: blocksAll ? "fail" : "pass",
      detail: blocksAll
        ? "Un Disallow: / global (User-agent: *) bloque tous les bots non explicitement autorisés."
        : "Aucun Disallow: / global détecté : les IA non listées peuvent accéder au site.",
      advice: blocksAll
        ? "Retirez le Disallow: / du bloc User-agent: * ou ajoutez des règles explicites pour chaque IA."
        : undefined,
    });
  }

  return { checks, body: out.body, sitemapUrls, homeOutcomeByBot };
}
