import type { Check } from "../types";
import { fetchText, rootOrigin } from "../fetcher";

export async function checkLlmsTxt(siteUrl: string): Promise<Check[]> {
  const origin = rootOrigin(siteUrl);
  const url = `${origin}/llms.txt`;
  const out = await fetchText(url);

  const looksLikeHtml = out.body
    ? /^\s*<(!doctype|html|head|body|p|div)[\s>]/i.test(out.body.trimStart())
    : false;
  const contentTypeOk = !out.contentType || /text\/(plain|markdown)|application\/text/i.test(out.contentType);
  const redirectedAway = out.ok && !out.url.endsWith("/llms.txt");
  const notReallyLlms = !out.ok || !out.body || looksLikeHtml || !contentTypeOk || redirectedAway;

  if (notReallyLlms) {
    const reason = !out.ok
      ? `statut ${out.status ?? "erreur réseau"}`
      : redirectedAway
      ? `redirige vers ${out.url}`
      : looksLikeHtml
      ? "contenu HTML retourné (votre serveur ne gère pas /llms.txt)"
      : !contentTypeOk
      ? `content-type invalide (${out.contentType})`
      : "vide";
    return [
      {
        id: "5.1",
        step: 5,
        label: "Fichier /llms.txt à la racine du site",
        priority: "HAUTE",
        status: "fail",
        detail: `Aucun vrai /llms.txt détecté (${reason}).`,
        advice:
          "Créez un fichier /llms.txt en text/plain qui liste vos URLs stratégiques. Standard poussé par Anthropic pour guider les LLM vers les bonnes pages.",
      },
      {
        id: "5.2",
        step: 5,
        label: "llms.txt structuré et exploitable",
        priority: "MOYENNE",
        status: "skip",
        detail: "Non applicable sans fichier llms.txt.",
      },
      {
        id: "5.3",
        step: 5,
        label: "URLs stratégiques listées dans le llms.txt",
        priority: "MOYENNE",
        status: "skip",
        detail: "Non applicable sans fichier llms.txt.",
      },
    ];
  }

  const body = out.body ?? "";
  const urls = Array.from(body.matchAll(/https?:\/\/[^\s\)\]]+/g)).map((m) => m[0]);
  const size = body.trim().length;
  const headings = (body.match(/^#{1,3}\s.+$/gm) ?? []).length;
  const hasIntro = /^\s*>/m.test(body);
  const wellStructured = headings >= 2 && urls.length >= 3 && size >= 300;
  const status52: Check["status"] = wellStructured
    ? "pass"
    : size > 20
    ? "warn"
    : "fail";

  return [
    {
      id: "5.1",
      step: 5,
      label: "Fichier /llms.txt à la racine du site",
      priority: "HAUTE",
      status: "pass",
      detail: `Fichier détecté (${size} caractères).`,
    },
    {
      id: "5.2",
      step: 5,
      label: "llms.txt structuré et exploitable",
      priority: "MOYENNE",
      status: status52,
      detail: wellStructured
        ? `Fichier bien structuré : ${headings} titres markdown, ${urls.length} URLs, ${size} caractères${hasIntro ? ", avec intro blockquote" : ""}.`
        : size > 20
        ? `Fichier présent mais structure incomplète : ${headings} titre(s) markdown, ${urls.length} URL(s), ${size} caractères.`
        : "Fichier trop court pour être utile.",
      advice: wellStructured
        ? undefined
        : "Structurez votre llms.txt en markdown : titre H1 avec le nom du site, intro en blockquote, sections H2 (À propos, Contenu principal, Contact), URLs absolues en listes à puces.",
    },
    {
      id: "5.3",
      step: 5,
      label: "URLs stratégiques listées dans le llms.txt",
      priority: "MOYENNE",
      status: urls.length >= 3 ? "pass" : urls.length >= 1 ? "warn" : "fail",
      detail: `${urls.length} URL(s) détectée(s) dans le fichier.`,
      advice:
        urls.length >= 3
          ? undefined
          : "Listez au minimum 3 URLs stratégiques (page d’accueil, pages piliers, articles de référence).",
    },
  ];
}
