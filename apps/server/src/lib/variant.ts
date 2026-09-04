import type { Variant } from "@funnel/shared";

export function assignVariant(override?: string | null): Variant {
  if (override === "A" || override === "B") return override;
  return Math.random() < 0.5 ? "A" : "B";
}
