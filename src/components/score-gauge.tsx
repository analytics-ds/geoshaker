interface Props {
  score: number;
  size?: number;
}

function scoreColor(score: number): { stroke: string; label: string; bg: string } {
  if (score >= 80) return { stroke: "var(--green)", label: "GEO-ready", bg: "var(--green-bg)" };
  if (score >= 50) return { stroke: "var(--orange)", label: "À améliorer", bg: "var(--orange-bg)" };
  return { stroke: "var(--red)", label: "Critique", bg: "var(--red-bg)" };
}

export function ScoreGauge({ score, size = 220 }: Props) {
  const r = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = scoreColor(score);
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      role="img"
      aria-label={`Score GEOshaker : ${score} sur 100, ${color.label}`}
    >
      <div style={{ width: size, height: size }} className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="var(--border)"
            strokeWidth="10"
            fill="none"
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={color.stroke}
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-[72px] leading-none font-black tabular-nums"
            style={{ color: color.stroke, letterSpacing: "-0.04em" }}
          >
            {score}
          </span>
          <span className="text-xs uppercase tracking-widest text-[color:var(--text-muted)] mt-2 font-[family-name:var(--font-mono)]">
            sur 100
          </span>
        </div>
      </div>
      <span
        className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
        style={{ background: color.bg, color: color.stroke }}
      >
        {color.label}
      </span>
    </div>
  );
}
