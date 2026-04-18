import QRCode from "qrcode";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

const PUBLIC_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://geoshaker.fr";

export default async function QrPage() {
  const dataUrl = await QRCode.toString(PUBLIC_URL, {
    type: "svg",
    margin: 1,
    width: 600,
    color: {
      dark: "#0A0A0A",
      light: "#F2EDE4",
    },
    errorCorrectionLevel: "M",
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full border-b border-[color:var(--border-default)] bg-[color:var(--bg)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="ds-pixels" aria-hidden="true" />
            <Logo />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="flex flex-col items-center gap-8 max-w-xl text-center">
          <p className="ds-eyebrow">Conférence GEO · 5 mai 2026</p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-tight tracking-[-0.035em] text-[color:var(--text)]">
            Scannez pour tester votre site.
          </h1>
          <p className="text-base sm:text-lg text-[color:var(--text-secondary)] leading-relaxed">
            Pointez l’appareil photo de votre téléphone sur ce QR code. Vous arrivez sur GEOshaker et pouvez tester votre site pendant la conférence.
          </p>
          <div
            className="p-4 sm:p-6 rounded-[16px] bg-white w-full max-w-[min(80vw,420px)] [&>svg]:w-full [&>svg]:h-auto border border-[color:var(--border-default)]"
            dangerouslySetInnerHTML={{ __html: dataUrl }}
          />
          <p className="text-sm text-[color:var(--text-muted)] font-[family-name:var(--font-mono)]">
            {PUBLIC_URL.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </main>

      <footer className="w-full border-t border-[color:var(--border-default)] bg-[color:var(--bg)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-sm text-center text-[color:var(--text-muted)]">
          GEOshaker par datashake. Conférence GEO · 5 mai 2026.
        </div>
      </footer>
    </div>
  );
}
