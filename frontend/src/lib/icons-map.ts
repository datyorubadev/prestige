import type { IconName } from "@/components/icons";

/** Dataset icon names (prototype/data.js) → Prestige icon set. */
const ICON_MAP: Record<string, IconName> = {
  alert: "zap",
  checkcircle: "check",
  card: "card",
  users: "users",
  building: "building",
  eye: "eye",
  message: "inbox",
  smile: "smile",
  ticket: "inbox",
  bot: "bot",
  edit: "edit",
  zap: "zap",
  warning: "zap",
  book: "book",
  trend: "trend",
  grid: "grid",
  shield: "shield",
  clock: "clock",
};

export function datasetIcon(name: string): IconName {
  return ICON_MAP[name] ?? "zap";
}
