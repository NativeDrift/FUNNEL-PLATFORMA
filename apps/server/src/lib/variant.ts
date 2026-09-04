import type { Variant, VariantDef } from "@funnel/shared";

export function assignVariant(variants: Record<Variant, VariantDef>, override?: string | null): Variant {
  if (override === "A" || override === "B") return override;

  const weightA = variants.A.weight ?? 50;
  const weightB = variants.B.weight ?? 50;
  const total = weightA + weightB;
  if (total <= 0) return "A";

  return Math.random() * total < weightA ? "A" : "B";
}
