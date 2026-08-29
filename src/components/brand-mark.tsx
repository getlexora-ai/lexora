import { cn } from "@/lib/utils";

/**
 * The graphite "L" tile. Same object at every size — the only place the primary
 * gradient appears outside a button. Carries the artifact's inner top highlight
 * (`inset 0 1px 0 rgba(255,255,255,.16)`) rather than an ambient shadow, so it
 * reads as a bevelled chip on both palettes instead of a floating card.
 */
export function BrandMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-extrabold btn-graphite",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.54),
        // 24px → 7px, 22px → 6px: the artifact's ratio at every size.
        borderRadius: Math.round(size * 0.29),
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.16)",
      }}
    >
      L
    </span>
  );
}

export function BrandLockup({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2.5 text-[16px] font-bold tracking-[-0.03em] text-foreground",
        className
      )}
    >
      <BrandMark size={size} />
      Lexora
    </span>
  );
}
