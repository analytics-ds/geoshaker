"use client";
import { useEffect, useRef, useState } from "react";
import type { AuditResult } from "@/lib/types";
import { ScoreGauge } from "./score-gauge";
import { StepAccordion } from "./step-accordion";

const LOADING_STEPS = [
  "Connexion au site",
  "Lecture du robots.txt",
  "Test d’accès ChatGPT, Claude, Perplexity",
  "Recherche des pages clés",
  "Analyse du HTML sans JavaScript",
  "Détection du JSON-LD",
  "Mesure des temps de réponse serveur",
  "Recherche du fichier llms.txt",
  "Contrôle du sitemap et du on-page",
  "Vérification de la version internationale",
];

const MIN_LOADING_MS = 3800;

export function AuditApp() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const autoRan = useRef(false);
  const scoreRef = useRef<HTMLDivElement | null>(null);

  const runAudit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setLoadingStep(0);
    const loadStart = performance.now();

    const interval = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 400);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data: AuditResult | { error?: string } = await res.json();
      const elapsed = performance.now() - loadStart;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
      }
      if (!res.ok) {
        setError("error" in data && data.error ? data.error : "Erreur inconnue.");
      } else {
        const audit = data as AuditResult;
        if (audit.error) {
          setError(audit.error);
        } else {
          setResult(audit);
          try {
            const params = new URLSearchParams(window.location.search);
            params.set("url", trimmed);
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState(null, "", newUrl);
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const paramUrl = params.get("url");
      if (paramUrl) {
        setUrl(paramUrl);
        runAudit(paramUrl);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result || !scoreRef.current) return;
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (!isMobile) return;
    const t = setTimeout(() => {
      scoreRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [result]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAudit(url);
  };

  const hasOutput = loading || error || result;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <p className="ds-eyebrow mb-2">GEO · Technique</p>
          <h1 className="text-3xl sm:text-4xl lg:text-[30px] font-black leading-[1.05] tracking-[-0.035em] text-[color:var(--text)]">
            Prêt pour les moteurs génératifs&nbsp;?
          </h1>
          <p className="mt-3 text-sm text-[color:var(--text-secondary)] leading-snug">
            Testez en 10 secondes si votre site est lisible par ChatGPT, Claude, Perplexity et Gemini.
          </p>

          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2">
            <label htmlFor="url-input" className="ds-eyebrow">
              URL à tester
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="url-input"
                name="url"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                enterKeyHint="go"
                placeholder="votre-site.fr"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="flex-1 h-[72px] sm:h-13 px-5 sm:px-3.5 rounded-[14px] sm:rounded-[10px] border-2 border-[color:var(--border-strong)] bg-[color:var(--bg-card)] placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:outline-none font-medium text-[18px] sm:text-[16px]"
              />
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="h-[72px] sm:h-13 px-6 sm:px-5 rounded-[14px] sm:rounded-[10px] font-bold text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[130px] sm:min-w-[120px]"
                style={{
                  background: loading || !url.trim() ? "var(--bg-warm)" : "var(--text)",
                  color: loading || !url.trim() ? "var(--text-muted)" : "var(--text-inverse)",
                }}
              >
                {loading ? "Analyse..." : "Analyser"}
              </button>
            </div>
          </form>

          {loading && (
            <div className="mt-5 flex flex-col items-start gap-3" role="status" aria-live="polite">
              <div className="flex items-center gap-2.5">
                <Spinner />
                <span className="text-sm text-[color:var(--text-secondary)]">
                  {LOADING_STEPS[loadingStep]}
                </span>
              </div>
              <LoadingProgress current={loadingStep} total={LOADING_STEPS.length} />
            </div>
          )}

          {error && (
            <div
              className="mt-5 p-4 rounded-[10px] border-2"
              style={{ background: "var(--red-bg)", borderColor: "var(--red)", color: "var(--red)" }}
              role="alert"
            >
              <p className="font-bold text-sm">Audit impossible</p>
              <p className="text-xs mt-1 text-[color:var(--text)]">{error}</p>
            </div>
          )}

          {result && !result.error && <ScorePanel result={result} scoreRef={scoreRef} />}
        </div>

        <div className="mt-10 lg:mt-0">
          {!hasOutput && <WhatWeCheck />}
          {result && !result.error && <DetailPanel result={result} />}
        </div>
      </div>
    </div>
  );
}

function ScorePanel({ result, scoreRef }: { result: AuditResult; scoreRef: React.RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = useState(false);
  const displayUrl = result.normalizedUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const copyShareUrl = async () => {
    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}?url=${encodeURIComponent(
        result.url
      )}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      ref={scoreRef}
      className="mt-5 rounded-[14px] p-4 sm:p-5 flex flex-col items-center gap-3 bg-[color:var(--bg-card)] border border-[color:var(--border-default)]"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <div className="text-center w-full">
        <p className="ds-eyebrow mb-1">Score GEOshaker</p>
        <a
          href={result.normalizedUrl}
          target="_blank"
          rel="noopener"
          className="text-lg sm:text-xl lg:text-[22px] font-black leading-tight tracking-[-0.03em] break-all text-[color:var(--text)] hover:text-[color:var(--accent)]"
        >
          {displayUrl}
        </a>
        {result.siteTypeLabel && (
          <p className="text-[10px] uppercase tracking-[0.14em] mt-1 font-[family-name:var(--font-mono)] text-[color:var(--text-muted)]">
            {result.siteTypeLabel}
          </p>
        )}
      </div>
      <ScoreGauge score={result.score} size={160} />
      <p className="text-[10px] font-[family-name:var(--font-mono)] text-[color:var(--text-muted)] uppercase tracking-wider">
        {(result.durationMs / 1000).toFixed(1)}s · {result.checks.filter((c) => c.status !== "skip").length} contrôles
      </p>
      <button
        type="button"
        onClick={copyShareUrl}
        className="h-9 px-4 rounded-full text-xs font-semibold transition-colors"
        style={{
          background: "var(--bg-warm)",
          color: "var(--text)",
          border: "1px solid var(--border-default)",
        }}
      >
        {copied ? "Lien copié" : "Copier le lien du résultat"}
      </button>
    </div>
  );
}

function DetailPanel({ result }: { result: AuditResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="mb-2">
        <p className="ds-eyebrow">Détail</p>
        <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] mt-1 text-[color:var(--text)]">
          Le diagnostic, étape par étape
        </h2>
      </div>
      {result.steps.map((s) => (
        <StepAccordion key={s.step} step={s} />
      ))}
    </div>
  );
}

function WhatWeCheck() {
  const items = [
    { n: "01", title: "Robots.txt et accès réel des IA", desc: "ChatGPT, Claude, Perplexity et Gemini sont-ils vraiment autorisés — pare-feu compris ?" },
    { n: "02", title: "Rendu sans JavaScript", desc: "Votre contenu est-il visible par les IA qui n’exécutent pas le JS ?" },
    { n: "03", title: "Données structurées (JSON-LD)", desc: "Sont-elles dans le HTML source, pas seulement injectées via GTM ?" },
    { n: "04", title: "Temps de réponse serveur", desc: "TTFB sous 500 ms. Les IA crawlent vite et abandonnent les sites lents." },
    { n: "05", title: "Fichier llms.txt", desc: "Votre manifeste GEO guide-t-il les IA vers vos pages stratégiques ?" },
    { n: "06", title: "Structure on-page et crawl", desc: "Sitemap, H1 unique, HTTPS, canonical, hiérarchie, 300 mots minimum." },
    { n: "07", title: "Version internationale", desc: "Marché LLM = marché anglophone. Version EN accessible et déclarée via hreflang ?" },
  ];
  return (
    <section>
      <p className="ds-eyebrow mb-2">Sommaire</p>
      <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] mb-6 text-[color:var(--text)]">
        Ce que GEOshaker contrôle
      </h2>
      <div className="flex flex-col">
        {items.map((it) => (
          <div
            key={it.n}
            className="flex items-start gap-4 py-4 border-b border-[color:var(--border-default)] last:border-b-0"
          >
            <span
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-white font-bold font-[family-name:var(--font-mono)] text-xs"
              style={{ background: "var(--accent)" }}
            >
              {it.n}
            </span>
            <div className="flex-1">
              <p className="font-bold text-[color:var(--text)]">{it.title}</p>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                {it.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full max-w-md flex flex-col gap-2">
      <div className="h-1 rounded-full bg-[color:var(--border-default)] overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${((current + 1) / total) * 100}%`,
            background: "var(--accent)",
          }}
        />
      </div>
      <p className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-widest text-[color:var(--text-muted)]">
        Étape {String(current + 1).padStart(2, "0")} · {String(total).padStart(2, "0")}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-5 h-5 rounded-full border-[3px]"
      style={{
        borderColor: "var(--border)",
        borderTopColor: "var(--accent)",
        animation: "geoshaker-spin 900ms linear infinite",
      }}
      aria-hidden="true"
    >
      <style>{`@keyframes geoshaker-spin { to { transform: rotate(360deg) } }`}</style>
    </span>
  );
}
