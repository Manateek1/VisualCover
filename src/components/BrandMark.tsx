type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export function BrandMark({ compact = false, className = "" }: BrandMarkProps) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""} ${className}`.trim()}>
      <svg
        className="brand__mark"
        viewBox="0 0 64 58"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="brand-gradient" x1="4" y1="4" x2="60" y2="54">
            <stop stopColor="#6571FF" />
            <stop offset="1" stopColor="#58D7C3" />
          </linearGradient>
        </defs>
        <path d="M6 8v43c12-5 20-20 26-43 5 23 14 38 26 43V8H6Z" stroke="url(#brand-gradient)" strokeWidth="2.3" strokeLinejoin="round" />
        <path d="M14 8c0 23-2 34-8 43M22 8c-2 23-7 35-16 43M50 8c0 23 2 34 8 43M42 8c2 23 7 35 16 43" stroke="url(#brand-gradient)" strokeWidth="1.8" strokeLinecap="round" opacity=".86" />
      </svg>
      <span className="brand__name">VisualCover</span>
    </div>
  );
}
