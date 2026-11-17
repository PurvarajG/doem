import { categoryColorVar } from "./colors";

/**
 * The colour swatch used everywhere a category is named but not filled — pickers, legends, lists.
 * Decorative unless `label` is given, for a dot that stands in for the name.
 */
export default function CategoryDot({ color, label, className = "" }: { color: string; label?: string; className?: string }) {
  return (
    <span
      {...(label ? { role: "img", "aria-label": label, title: label } : { "aria-hidden": true })}
      className={`size-2 shrink-0 rounded-full ${className}`}
      style={{ background: categoryColorVar(color) }}
    />
  );
}
