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
      ? "contenu HTML retourné"
      : !contentTypeOk
      ? `content-type invalide (${out.contentType})`
      : "vide";
    return [
      {
        id: "5.1",
        step: 5,
        label: "Fichier /llms.txt présent à la racine du site",
        priority: "BLOQUANT",
        status: "fail",
        detail: `Aucun fichier /llms.txt détecté (${reason}). Le llms.txt est le manifeste GEO à adopter, il oriente les LLM vers vos pages stratégiques.`,
        advice:
          "Créez un fichier /llms.txt en text/plain à la racine de votre domaine.",
      },
    ];
  }

  const size = (out.body ?? "").trim().length;
  return [
    {
      id: "5.1",
      step: 5,
      label: "Fichier /llms.txt présent à la racine du site",
      priority: "BLOQUANT",
      status: "pass",
      detail: `Fichier détecté (${size} caractères).`,
    },
  ];
}
