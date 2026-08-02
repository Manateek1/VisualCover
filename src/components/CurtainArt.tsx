import type { CSSProperties, ReactNode } from "react";
import type { PublicSettings } from "../types";

type CurtainArtProps = {
  settings: PublicSettings;
  children?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function CurtainArt({ settings, children, compact = false, className = "" }: CurtainArtProps) {
  const background = settings.background;
  const start = background.kind === "gradient" ? background.start : background.color;
  const end = background.kind === "gradient" ? background.end : background.color;
  const angle = background.kind === "gradient" ? background.angle : 90;
  const style = {
    "--curtain-start": start,
    "--curtain-end": end,
    "--curtain-angle": `${angle}deg`,
  } as CSSProperties;

  return (
    <div className={`curtain-art ${compact ? "curtain-art--compact" : ""} ${className}`.trim()} style={style}>
      <div className="curtain-art__wash" />
      <div className="curtain-art__folds curtain-art__folds--left" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <span key={index} style={{ "--fold": index } as CSSProperties} />)}
      </div>
      <div className="curtain-art__folds curtain-art__folds--right" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <span key={index} style={{ "--fold": index } as CSSProperties} />)}
      </div>
      <div className="curtain-art__vignette" />
      <div className="curtain-art__content">{children}</div>
    </div>
  );
}
