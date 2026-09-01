/**
 * Fixed OLC rewards by trail difficulty (Base44-style scaling).
 * No random scatter — every quest of a difficulty pays the same.
 */
export type DifficultyKey = "Easy" | "Moderate" | "Hard" | "Legendary" | "Medium";

export const REWARD_BY_DIFFICULTY = {
  Easy: 25,
  Moderate: 75,
  Hard: 150,
  Legendary: 400,
} as const;

export type CanonicalDifficulty = keyof typeof REWARD_BY_DIFFICULTY;

/** Map legacy "Medium" → Moderate; unknown → Easy. */
export function rewardForDifficulty(d: string | null | undefined): number {
  if (!d) return REWARD_BY_DIFFICULTY.Easy;
  if (d === "Medium") return REWARD_BY_DIFFICULTY.Moderate;
  if (d in REWARD_BY_DIFFICULTY) {
    return REWARD_BY_DIFFICULTY[d as CanonicalDifficulty];
  }
  return REWARD_BY_DIFFICULTY.Easy;
}
