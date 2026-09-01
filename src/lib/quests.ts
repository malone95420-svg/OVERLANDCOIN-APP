/**
 * Quest types + catalog.
 * Canonical seed lives in src/data/quests/ (grow toward 5000 there).
 */
export type {
  Quest,
  QuestDifficulty,
  TerrainTag,
} from "@/data/quests";
export {
  QUESTS,
  QUEST_COUNT,
  getQuestById,
  filterQuestsByTier,
} from "@/data/quests";

/** @deprecated Prefer QUESTS — kept for older imports during transition. */
export { QUESTS as DEMO_QUESTS } from "@/data/quests";

export { REWARD_BY_DIFFICULTY, rewardForDifficulty } from "@/lib/questRewards";
