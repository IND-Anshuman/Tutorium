// Zod validation for Trickster output: a malicious/creative LLM cannot inject
// styles beyond the declared shape, sizes, or enums. Invalid = wholesale reject.
import { z } from "zod";

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "bad hex");
// Free-form CSS color: gradients allowed (LLM loves them), but block url()/expression()
// so a creative patch can't smuggle a remote load or JS into a style value.
const cssColor = z
  .string()
  .max(160)
  .refine((v) => !/url\s*\(|expression\s*\(|javascript:/i.test(v), "unsafe css");

export const themePatchSchema = z.object({
  vibe: z.string().max(40).default(""),
  accent: z.union([hexColor, z.literal("var(--brand)"), z.literal("")]).default(""),
  bg: z.union([cssColor, z.literal("")]).default(""),
  radius: z.coerce.number().min(6).max(22).default(16),
  fontScale: z.coerce.number().min(0.95).max(1.15).default(1),
  icon: z.string().max(4).default("✅"),
  shuffleChoices: z.boolean().default(false),
  hideCorrectUntilPick: z.boolean().default(false),
  timePerQuestion: z.coerce.number().min(0).max(45).default(0),
  hintsEnabled: z.boolean().default(false),
  hintCount: z.coerce.number().min(0).max(2).default(0),
  hiddenAnswerStyle: z.enum(["veil", "blur", "scratch"]).nullable().default(null),
  streakMode: z.boolean().default(false),
  easterEgg: z.string().max(120).nullable().default(null),
  message: z.string().max(120).default(""),
  confetti: z.boolean().default(false),
});

export type ThemePatchInput = z.input<typeof themePatchSchema>;

// Returns a normalized TricksterTheme or null when the patch is invalid.
export function validateThemePatch(raw: unknown): import("@/lib/types").TricksterTheme | null {
  const parsed = themePatchSchema.safeParse(raw);
  return parsed.success ? (parsed.data as import("@/lib/types").TricksterTheme) : null;
}