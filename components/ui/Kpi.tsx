import type { ReactNode } from "react";
import Caption from "@/components/ui/Caption";

/**
 * Kpi: one tile of a KPI row. The grid is the caller's job.
 * Formats nothing: callers pass formatted strings (durations as 1h 30m).
 *
 * In a short window (the `short:` variant, under 920px tall) the tile folds to
 * one line: label and value on the left, the foot on the right, no visual.
 * Same facts, about half the height, so the page's list starts higher.
 */
export interface KpiProps {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  /** Right-hand visual, e.g. a Spark. */
  visual?: ReactNode;
  foot?: { label: ReactNode; value: ReactNode; tone?: "neutral" | "up" };
  className?: string;
  as?: "div" | "section" | "li";
}

export default function Kpi({
  label,
  value,
  unit,
  visual,
  foot,
  className,
  as = "div",
}: KpiProps) {
  const Tag = as;
  const classes = [
    "overflow-hidden rounded-kpi bg-surface ring-1 ring-line short:flex short:items-center",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag data-part="kpi" className={classes}>
      <div className="flex items-end justify-between gap-2 p-4 short:shrink-0 short:py-3">
        <dl className="m-0 short:flex short:items-baseline short:gap-3">
          <Caption as="dt">{label}</Caption>
          <dd className="m-0 mt-2 short:mt-0 font-mono text-kpi font-medium leading-none text-ink">
            {value}
            {unit ? (
              <small className="ml-1 font-sans text-secondary font-normal tracking-normal text-ink-3">
                {unit}
              </small>
            ) : null}
          </dd>
        </dl>
        {visual ? <div className="shrink-0 short:hidden">{visual}</div> : null}
      </div>
      {foot ? (
        <div
          data-testid="kpi-foot"
          className="flex justify-between bg-sunk px-4 py-2 text-meta text-ink-3 short:ml-auto short:min-w-0 short:gap-1.5 short:bg-transparent short:py-0 short:pl-0"
        >
          <span className="short:min-w-0 short:truncate">{foot.label}</span>
          <span
            className={
              foot.tone === "up"
                ? "font-medium text-ok short:shrink-0"
                : "font-medium text-ink-2 short:shrink-0"
            }
          >
            {foot.value}
          </span>
        </div>
      ) : null}
    </Tag>
  );
}
