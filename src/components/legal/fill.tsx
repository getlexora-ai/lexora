import type { ReactNode } from "react";

const PLACEHOLDER =
  "mx-[1px] inline rounded-[3px] border border-dashed border-risk-medium-line bg-risk-medium-soft px-1.5 py-px font-mono text-[0.82em] text-risk-medium";

/**
 * Renders `value` when it is set, otherwise an amber placeholder carrying the
 * label. Used across the legal pages so any operator detail that has not been
 * confirmed yet is obvious on the page and impossible to ship by accident.
 */
export function Fill({
  value,
  children,
}: {
  value?: string | null;
  children: ReactNode;
}) {
  if (value != null && value !== "") return <>{value}</>;
  return (
    <span className={PLACEHOLDER} title="Placeholder, complete before launch">
      {children}
    </span>
  );
}

/** Multi-line variant, for the postal address block. */
export function FillLines({
  value,
  children,
}: {
  value?: string[] | null;
  children: ReactNode;
}) {
  if (value && value.length > 0) {
    return (
      <>
        {value.map((line, i) => (
          <span key={i}>
            {line}
            {i < value.length - 1 ? <br /> : null}
          </span>
        ))}
      </>
    );
  }
  return (
    <span className={PLACEHOLDER} title="Placeholder, complete before launch">
      {children}
    </span>
  );
}
