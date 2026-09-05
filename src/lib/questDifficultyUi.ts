import type { QuestDifficulty } from "@/lib/quests";
import { REWARD_BY_DIFFICULTY } from "@/lib/questRewards";

/** Base44 segmented labels; Medium maps to our Moderate data. */
export type DifficultyFilterUi = "All" | "Easy" | "Medium" | "Hard" | "Legendary";

export const DIFFICULTY_FILTER_OPTIONS: DifficultyFilterUi[] = [
  "All",
  "Easy",
  "Medium",
  "Hard",
  "Legendary",
];

export function uiFilterToDifficulty(
  ui: DifficultyFilterUi,
): QuestDifficulty | null {
  if (ui === "All") return null;
  if (ui === "Medium") return "Moderate";
  return ui;
}

export function difficultyToUiLabel(d: QuestDifficulty): string {
  return d === "Moderate" ? "Medium" : d;
}

export const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  Easy: "#22c55e",
  Moderate: "#f97316",
  Hard: "#ef4444",
  Legendary: "#a855f7",
};

export const DIFFICULTY_UI_ACCENT: Record<
  Exclude<DifficultyFilterUi, "All">,
  { bg: string; text: string; ring: string }
> = {
  Easy: { bg: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/50" },
  Medium: { bg: "bg-orange-500", text: "text-orange-400", ring: "ring-orange-500/50" },
  Hard: { bg: "bg-red-500", text: "text-red-400", ring: "ring-red-500/50" },
  Legendary: { bg: "bg-purple-500", text: "text-purple-400", ring: "ring-purple-500/50" },
};

/** Legend rows — Base44 labels, our real OLC rewards. */
export const DIFFICULTY_LEGEND: Array<{
  ui: Exclude<DifficultyFilterUi, "All">;
  difficulty: QuestDifficulty;
  color: string;
  reward: number;
}> = [
  { ui: "Easy", difficulty: "Easy", color: DIFFICULTY_COLORS.Easy, reward: REWARD_BY_DIFFICULTY.Easy },
  {
    ui: "Medium",
    difficulty: "Moderate",
    color: DIFFICULTY_COLORS.Moderate,
    reward: REWARD_BY_DIFFICULTY.Moderate,
  },
  { ui: "Hard", difficulty: "Hard", color: DIFFICULTY_COLORS.Hard, reward: REWARD_BY_DIFFICULTY.Hard },
  {
    ui: "Legendary",
    difficulty: "Legendary",
    color: DIFFICULTY_COLORS.Legendary,
    reward: REWARD_BY_DIFFICULTY.Legendary,
  },
];
