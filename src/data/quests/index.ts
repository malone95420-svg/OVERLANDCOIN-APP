/**
 * Quest catalog — curated corridors plus GeoNames / Overpass NA expansion.
 * Regenerate with `node scripts/generate-quests.mjs` (Wyoming-heavy NA set).
 */
import type { CapabilityTier } from "@/lib/vehicle";
import seed from "./seed.json";

export type QuestDifficulty = "Easy" | "Moderate" | "Hard" | "Legendary";

export type TerrainTag =
  | "rock"
  | "desert"
  | "dirt"
  | "sand"
  | "mud"
  | "snow"
  | "forest"
  | "alpine"
  | "high-alpine"
  | "cliff"
  | "water"
  | "creek"
  | "remote"
  | "scenic"
  | "paved"
  | "gravel"
  | "technical"
  | "extreme"
  | "slickrock"
  | "ledge"
  | "ohv"
  | "beach"
  | "coast"
  | "fjord"
  | "savanna"
  | "steppe"
  | "outback"
  | "patagonia"
  | "f-road"
  | "river"
  | "volcanic"
  | "arctic"
  | "tropical"
  | "jungle"
  | "canyon"
  | "plateau"
  | "mountain"
  | "moor"
  | "lake"
  | "playa"
  | "saltflat"
  | "saltpan"
  | "high-altitude"
  | "wind"
  | "wildlife"
  | "historic"
  | "one-way"
  | "switchback"
  | "steep"
  | "granite"
  | "redrock"
  | "wash"
  | "geothermal"
  | "private-adjacent"
  | "high-country"
  | "high-plains"
  | "prairie"
  | "badlands"
  | "scrub"
  | "swamp"
  | "clay"
  | "slot"
  | "dunes"
  | "andes"
  | "washboard";

export type Quest = {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  rewardOlC: number;
  difficulty: QuestDifficulty;
  region: string;
  /** Minimum vehicle capability tier required (1–5). */
  minTier: CapabilityTier;
  /** Optional terrain hints for Ranger + UI chips. */
  terrainTags?: string[];
  /** GPS check-in radius in meters (default 100). */
  radiusMeters: number;
};

const DEFAULT_RADIUS_METERS = 100;

function normalizeQuest(raw: Partial<Quest> & Pick<Quest, "id" | "title" | "lat" | "lng">): Quest {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? "",
    lat: raw.lat,
    lng: raw.lng,
    rewardOlC: raw.rewardOlC ?? 0,
    difficulty: (raw.difficulty as Quest["difficulty"]) ?? "Easy",
    region: raw.region ?? "",
    minTier: (raw.minTier as CapabilityTier) ?? 1,
    terrainTags: raw.terrainTags,
    radiusMeters:
      typeof raw.radiusMeters === "number" && raw.radiusMeters > 0
        ? raw.radiusMeters
        : DEFAULT_RADIUS_METERS,
  };
}

export const QUESTS: Quest[] = (seed as Partial<Quest>[]).map((q) =>
  normalizeQuest(q as Partial<Quest> & Pick<Quest, "id" | "title" | "lat" | "lng">),
);

export const QUEST_COUNT = QUESTS.length;

export function getQuestById(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id);
}

export function filterQuestsByTier(
  quests: Quest[],
  vehicleTier: CapabilityTier,
  showAll: boolean,
): Quest[] {
  if (showAll) return quests;
  return quests.filter((q) => vehicleTier >= q.minTier);
}
