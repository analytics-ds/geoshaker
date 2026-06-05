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
      {
        id: "5.2",
        step: 5,
        label: "URLs stratégiques listées dans le llms.txt",
        priority: "MOYENNE",
        status: "skip",
        detail: "Non testable : aucun llms.txt à analyser.",
      },
      {
        id: "5.3",
        step: 5,
        label: "Contenu du llms.txt pertinent et structuré",
        priority: "MOYENNE",
        status: "skip",
        detail: "Non testable : aucun llms.txt à analyser.",
      },
    ];
  }

  const body = out.body ?? "";
  const size = body.trim().length;

  // 5.2 : le fichier doit pointer vers des URLs (liens markdown ou URLs brutes)
  const mdLinks = (body.match(/\]\(\s*https?:\/\/[^\s)]+\)/gi) ?? []).length;
  const rawUrls = (body.match(/https?:\/\/[^\s)]+/gi) ?? []).length;
  const linkCount = Math.max(mdLinks, rawUrls);

  // 5.3 : un vrai manifeste a au moins un titre markdown et plusieurs sections
  const hasTitle = /^\s*#\s+\S/m.test(body);
  const sectionCount = (body.match(/^\s*##\s+\S/gm) ?? []).length;

  return [
    {
      id: "5.1",
      step: 5,
      label: "Fichier /llms.txt présent à la racine du site",
      priority: "BLOQUANT",
      status: "pass",
      detail: `Fichier détecté (${size} caractères).`,
    },
    {
      id: "5.2",
      step: 5,
      label: "URLs stratégiques listées dans le llms.txt",
      priority: "MOYENNE",
      status: linkCount >= 3 ? "pass" : linkCount >= 1 ? "warn" : "fail",
      detail:
        linkCount >= 3
          ? `${linkCount} URL(s) listée(s) dans le llms.txt pour guider les IA.`
          : linkCount >= 1
          ? `Seulement ${linkCount} URL listée. Un llms.txt utile pointe vers vos pages les plus importantes.`
          : "Le llms.txt ne liste aucune URL. Il n’oriente donc pas les IA vers vos pages stratégiques.",
      advice:
        linkCount >= 3
          ? undefined
          : "Listez dans le llms.txt vos pages clés sous forme de liens markdown (- [Titre](https://...)) : accueil, offres principales, pages piliers.",
    },
    {
      id: "5.3",
      step: 5,
      label: "Contenu du llms.txt pertinent et structuré",
      priority: "MOYENNE",
      status: hasTitle && sectionCount >= 1 ? "pass" : hasTitle || size >= 200 ? "warn" : "fail",
      detail:
        hasTitle && sectionCount >= 1
          ? `Manifeste structuré : titre + ${sectionCount} section(s).`
          : "llms.txt présent mais peu structuré (pas de titre # ni de sections ##). Les IA exploitent mal un manifeste sans hiérarchie.",
      advice:
        hasTitle && sectionCount >= 1
          ? undefined
          : "Structurez le llms.txt : un titre « # Nom du site », une description, puis des sections « ## » regroupant vos liens par thème.",
    },
  ];
}
