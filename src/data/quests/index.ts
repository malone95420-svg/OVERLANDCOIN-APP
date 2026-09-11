/**
 * Quest catalog — curated corridors plus GeoNames / Overpass NA + SA expansion,
 * plus a global hunt pack (`global-*.json`) covering every continent.
 * Spatially thinned (~25 km min spacing) via `node scripts/spread-quests.mjs`.
 * Base generators: `scripts/generate-quests.mjs`, `scripts/append-quests-us-sa.mjs`,
 * `scripts/append-poi-history-quests.mjs` (US/Canada/Hawaii history POIs).
 */
import type { CapabilityTier } from "@/lib/vehicle";
import { rewardForDifficulty } from "@/lib/questRewards";
import seed01 from "./seed-01.json";
import seed02 from "./seed-02.json";
import globalNorthAmerica from "./global-01-north-america.json";
import globalLatinAmerica from "./global-02-latin-america.json";
import globalEurope from "./global-03-europe.json";
import globalAfrica from "./global-04-africa.json";
import globalMenaCentralAsia from "./global-05-mena-central-asia.json";
import globalAsia from "./global-06-asia.json";
import globalOceaniaPolar from "./global-07-oceania-polar.json";
import globalWorldGaps from "./global-08-world-gaps.json";

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
  const rawDiff = (raw.difficulty as string | undefined) ?? "Easy";
  const difficulty: Quest["difficulty"] =
    rawDiff === "Medium" ? "Moderate" : ((rawDiff as Quest["difficulty"]) || "Easy");
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? "",
    lat: raw.lat,
    lng: raw.lng,
    rewardOlC: rewardForDifficulty(difficulty),
    difficulty,
    region: raw.region ?? "",
    minTier: (raw.minTier as CapabilityTier) ?? 1,
    terrainTags: raw.terrainTags,
    radiusMeters:
      typeof raw.radiusMeters === "number" && raw.radiusMeters > 0
        ? raw.radiusMeters
        : DEFAULT_RADIUS_METERS,
  };
}

/** Exclude dev/test seed quests (id prefix `q-test-`) from the production catalog. */
function isTestQuest(q: Quest): boolean {
  return q.id.startsWith("q-test-");
}

const RAW_QUESTS: Partial<Quest>[] = [
  ...(seed01 as Partial<Quest>[]),
  ...(seed02 as Partial<Quest>[]),
  ...(globalNorthAmerica as Partial<Quest>[]),
  ...(globalLatinAmerica as Partial<Quest>[]),
  ...(globalEurope as Partial<Quest>[]),
  ...(globalAfrica as Partial<Quest>[]),
  ...(globalMenaCentralAsia as Partial<Quest>[]),
  ...(globalAsia as Partial<Quest>[]),
  ...(globalOceaniaPolar as Partial<Quest>[]),
  ...(globalWorldGaps as Partial<Quest>[]),
];

export const QUESTS: Quest[] = RAW_QUESTS.map((q) =>
  normalizeQuest(q as Partial<Quest> & Pick<Quest, "id" | "title" | "lat" | "lng">),
).filter((q) => !isTestQuest(q));

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
