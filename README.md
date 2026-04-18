# GEOshaker

> Audit GEO express pour savoir si ton site est pret pour les IA. Score de 0 a 100, detail par etape. Un outil Datashake.

GEOshaker fait un audit technique automatise en 10 secondes pour evaluer la capacite d'un site a etre correctement crawle, compris et cite par les moteurs IA (ChatGPT Search, Claude, Perplexity, Gemini, Google AI Overviews).

## Demo

Lance le serveur local puis ouvre `http://localhost:3000` sur ton mobile ou desktop.

```bash
npm install
npm run dev
```

## Ce que GEOshaker controle

7 etapes, 29 points de controle, ponderes par priorite (BLOQUANT, HAUTE, MOYENNE).

1. **Robots.txt** : GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Disallow global
2. **Rendu sans JavaScript** : contenu visible dans le HTML source (homepage, produit, a propos, blog)
3. **JSON-LD** : presence dans le HTML source, pas seulement via GTM, validite, types pertinents
4. **TTFB** : temps de reponse serveur sous 500ms
5. **/llms.txt** : existence, pertinence, URLs strategiques
6. **On-page et crawl** : sitemap, H1 unique, meta description, canonical, HTTPS, hierarchie Hn, 300 mots minimum
7. **Version internationale** : presence d'une version EN et declaration hreflang

## Ponderation du score

- **BLOQUANT** compte x 3
- **HAUTE** compte x 2
- **MOYENNE** compte x 1

Un check `warn` donne la moitie du poids, un check `skip` est exclu du denominateur. Le resultat est normalise en entier 0 a 100 (sans decimale).

### Codes couleur du score

- **80 a 100** : vert, GEO-ready
- **50 a 79** : orange, a ameliorer
- **0 a 49** : rouge, critique

## Stack technique

- Next.js 16 (app router, Turbopack)
- React 19
- TypeScript strict
- Tailwind CSS 4
- Route API `/api/check` (Node runtime, jusqu a 30s d execution)
- Palette Datashake (alignee sur la DA Datafer)
- Mobile-first, touch-friendly (cibles 48px min), gauge lisible a distance

Zero dependance externe pour l audit : tout repose sur le fetch natif de Node et des regex robustes qui gerent le HTML minifie comme le HTML classique.

## Developpement

```bash
# Typecheck
npx tsc --noEmit

# Build production
npm run build

# Dev server
npm run dev
```

## Deploiement

Pense pour Vercel. Lier le repo GitHub a un nouveau projet Vercel, la route API est executee cote serveur Node (requis pour les fetch sortants).

## Creator

Outil gratuit cree par [Datashake](https://datashake.fr), agence SEO a Paris.
