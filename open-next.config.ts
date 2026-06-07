import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// App quasi 100% dynamique (page d'accueil + route /api/check), aucun ISR.
// Pas de cache incremental R2 necessaire pour l'instant.
export default defineCloudflareConfig({});
