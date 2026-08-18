import { cn } from "@/lib/utils";

const GRADIENTS: Record<string, string> = {
  green: "bg-gradient-to-br from-primary to-[#2ecf96]",
  violet: "bg-gradient-to-br from-violet to-[#a78bfa]",
  blue: "bg-gradient-to-br from-info to-[#60a5fa]",
  amber: "bg-gradient-to-br from-warning to-[#fbbf24]",
  slate: "bg-gradient-to-br from-slate-500 to-slate-400",
};

interface AvatarProps {
  name: string;
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

/** Initials on a deterministic gradient (design.md §4.1). */
export function Avatar({ name, color = "slate", size = "md", className }: AvatarProps) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white",
        size === "sm" ? "h-[26px] w-[26px] text-[13px]" : "h-8 w-8 text-[13px]",
        GRADIENTS[color] ?? GRADIENTS.slate,
        className,
      )}
    >
      {initials}
    </span>
  );
}
