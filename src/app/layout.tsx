import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "GEOshaker. Votre site est-il prêt pour les moteurs génératifs ?",
  description:
    "Audit GEO express. Score de 0 à 100 pour savoir si votre site est lisible par ChatGPT, Claude, Perplexity et Gemini. Un outil datashake.",
  applicationName: "GEOshaker",
  creator: "datashake",
  publisher: "datashake",
  robots: { index: true, follow: true },
  openGraph: {
    title: "GEOshaker. Prêt pour les moteurs génératifs ?",
    description:
      "Testez en 10 secondes si votre site est lisible par les IA. Score de 0 à 100, détail par étape.",
    type: "website",
    siteName: "GEOshaker",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "GEOshaker",
    description: "Audit GEO express. Score de 0 à 100.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F2EDE4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
