import { cn } from "@/lib/utils";

interface SpinnerProps {
  /** Pixel size (default 16 — button-sized). */
  size?: number;
  className?: string;
}

/** In-button loading spinner — swaps into a button label without resizing it
 * (design.md §4.1 Button loading). Primary ring on the neutral track. */
export function Spinner({ size = 16, className }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-primary-border border-t-primary",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
