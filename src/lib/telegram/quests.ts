import { QUESTS, type Quest } from "@/data/quests";
import { haversineMeters, formatDistance } from "@/lib/checkin";

const FEATURED_LIMIT = 6;
const NEARBY_LIMIT = 6;

function isTestQuest(q: Quest): boolean {
  return q.id.startsWith("q-test") || /test/i.test(q.title);
}

export function featuredQuests(limit = FEATURED_LIMIT): Quest[] {
  const pool = QUESTS.filter((q) => !isTestQuest(q));
  const order: Quest["difficulty"][] = ["Legendary", "Hard", "Moderate", "Easy"];
  const picked: Quest[] = [];
  for (const difficulty of order) {
    const hit = pool.find((q) => q.difficulty === difficulty && !picked.includes(q));
    if (hit) picked.push(hit);
  }
  for (const q of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return picked.slice(0, limit);
}

export function nearestQuests(
  lat: number,
  lng: number,
  limit = NEARBY_LIMIT,
): { quest: Quest; meters: number }[] {
  return QUESTS.map((quest) => ({
    quest,
    meters: haversineMeters({ lat, lng }, quest),
  }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}

export function formatQuestLine(q: Quest, meters?: number): string {
  const dist = meters != null ? ` · ${formatDistance(meters)}` : "";
  return `• ${q.title} — ${q.difficulty}, ${q.rewardOlC} OLC, ${q.region}${dist}`;
}
