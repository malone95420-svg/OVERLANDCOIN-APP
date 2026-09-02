/**
 * RANGER — local/rule-based overland assistant (v1).
 *
 * Personality: safety-first park-ranger tone ("RANGER online…").
 *
 * LLM wiring (later):
 *   // process.env.RANGER_API — base URL for a future chat completions endpoint
 *   // process.env.RANGER_API_KEY — never hardcode; server-side only when added
 *   // Until then, replyRanger() handles all prompts locally.
 */

import { QUESTS, type Quest } from "@/data/quests";
import {
  TIER_LABELS,
  canReachQuest,
  getVehicleTier,
  tierLabel,
  type CapabilityTier,
  type Vehicle,
} from "@/lib/vehicle";

export type RangerMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export const RANGER_GREETING =
  "RANGER online. I know every trail on Earth — or at least every waypoint in this catalog. Tell me about your rig, ask for quests you can reach, or tap a chip. Safety first: check weather, permits, and turnaround times before you roll.";

export const RANGER_CHIPS = [
  "Weather tip",
  "Trail conditions",
  "Route to quest",
  "Safety check",
  "Quests I can reach",
] as const;

export type RangerChip = (typeof RANGER_CHIPS)[number];

function reachable(quests: Quest[], tier: CapabilityTier): Quest[] {
  return quests.filter((q) => canReachQuest(tier, q.minTier));
}

function pickRegionMatches(text: string, quests: Quest[]): Quest[] {
  const lower = text.toLowerCase();
  return quests.filter(
    (q) =>
      q.region.toLowerCase().includes(lower) ||
      q.title.toLowerCase().includes(lower) ||
      (q.terrainTags ?? []).some((t) => lower.includes(t.toLowerCase())),
  );
}

function formatQuestLine(q: Quest): string {
  return `• ${q.title} (${q.region}) — ${q.difficulty}, min Tier ${q.minTier} ${TIER_LABELS[q.minTier]}, ${q.rewardOlC} OLC`;
}

function weatherTip(vehicle: Vehicle | null, tier: CapabilityTier | null): string {
  return [
    "Weather tip from RANGER:",
    "• Desert & slickrock: start early, carry 1+ gal water per person, watch monsoon cells.",
    "• Alpine passes: afternoon thunderstorms and sudden snow — pack layers and a turnaround time.",
    "• Sand & beaches: check tides and wind; soft sand after rain can trap even Built rigs.",
    vehicle && tier != null
      ? `• Your ${vehicle.name} (Tier ${tierLabel(tier)}): match tire pressure to terrain — air down for sand/rock, air up for highway.`
      : "• Save a vehicle in Garage so I can tailor pressure and clearance tips.",
    "Always verify local forecasts and park alerts before departure.",
  ].join("\n");
}

function trailConditions(): string {
  return [
    "Trail conditions (general — verify on-site):",
    "• Spring: mud season on forest roads; lockers help but don't invent traction.",
    "• Summer: flash floods in slot/wash country; never camp in washes.",
    "• Fall: best alpine window — ice can still form on shaded shelves.",
    "• Winter: many high passes closed; carry recovery gear and tell someone your plan.",
    "RANGER recommends checking recreation.gov, BLM, and local ranger districts for closures.",
  ].join("\n");
}

function safetyCheck(vehicle: Vehicle | null, tier: CapabilityTier | null): string {
  const lines = [
    "Safety check — RANGER checklist:",
    "1. Full-size spare, jack rated for your loaded weight, and recovery points.",
    "2. Water, food, first aid, navigation offline maps, and a sat messenger if remote.",
    "3. Know your turnaround: if the trail exceeds your tier, back up while you still can.",
    "4. Travel with a buddy when tackling Tier 4–5 routes.",
    "5. Permits & private land: when in doubt, don't cross.",
  ];
  if (vehicle && tier != null) {
    lines.push(
      `Your ${vehicle.name} scores Tier ${tierLabel(tier)}. Stay on quests at or below that tier unless you've upgraded.`,
    );
    if (!vehicle.winch && tier >= 3) {
      lines.push("Note: no winch on file — pack a second vehicle or traction boards for soft traps.");
    }
  } else {
    lines.push("Add your vehicle in Garage so I can flag gear gaps.");
  }
  return lines.join("\n");
}

function routeToQuest(text: string, tier: CapabilityTier | null): string {
  const needle = text.replace(/route to quest/i, "").replace(/route to/i, "").trim();
  let match: Quest | undefined;
  if (needle.length > 2) {
    match = QUESTS.find(
      (q) =>
        q.title.toLowerCase().includes(needle.toLowerCase()) ||
        q.id === needle ||
        q.region.toLowerCase().includes(needle.toLowerCase()),
    );
  }
  if (!match) {
    match = tier != null ? reachable(QUESTS, tier)[0] : QUESTS[0];
    return [
      "Route to quest:",
      match
        ? `I didn't catch a specific title — try naming one. Example pick: ${match.title} (${match.region}) at ${match.lat}, ${match.lng}.`
        : "Catalog empty.",
      "Open the Quest Map, select a pin, then ask: “Route to <quest title>”.",
      "RANGER v1 shares coordinates; turn-by-turn GPS arrives with a later map integration.",
    ].join("\n");
  }
  const ok = tier == null ? true : canReachQuest(tier, match.minTier);
  return [
    `Route briefing: ${match.title}`,
    `Region: ${match.region}`,
    `Coords: ${match.lat}, ${match.lng}`,
    `Difficulty: ${match.difficulty} · Min tier: ${match.minTier} ${TIER_LABELS[match.minTier]}`,
    `Terrain: ${(match.terrainTags ?? []).join(", ") || "varied"}`,
    ok
      ? "Your current tier can attempt this — still scout obstacles and have a bailout plan."
      : `Caution: this quest wants Tier ${match.minTier}+. Upgrade in Garage or pick a lower-tier route.`,
    "Navigate with offline maps; cell service is often absent on these corridors.",
  ].join("\n");
}

function questsICanReach(tier: CapabilityTier | null): string {
  if (tier == null) {
    return "Save a vehicle in Garage first — then I’ll list quests your tier can reach.";
  }
  const list = reachable(QUESTS, tier);
  const sample = list.slice(0, 8);
  return [
    `Quests you can reach at Tier ${tierLabel(tier)}: ${list.length} of ${QUESTS.length} in the catalog.`,
    ...sample.map(formatQuestLine),
    list.length > 8
      ? `…and ${list.length - 8} more. Toggle “Show all” off on the Quest Map to filter pins.`
      : "",
    "Push your skills gradually — Legendary trails wait for Built/Extreme rigs.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Local rule-based reply. Swap body for fetch(process.env.RANGER_API) later.
 */
export function replyRanger(
  userText: string,
  opts: { vehicle: Vehicle | null; tier: CapabilityTier | null },
): string {
  const text = userText.trim();
  const lower = text.toLowerCase();
  const { vehicle, tier } = opts;
  const resolvedTier = tier ?? (vehicle ? getVehicleTier(vehicle) : null);

  if (!text) return RANGER_GREETING;

  if (lower === "weather tip" || (lower.includes("weather") && !lower.includes("route"))) {
    return weatherTip(vehicle, resolvedTier);
  }
  if (lower === "trail conditions" || lower.includes("trail condition")) {
    return trailConditions();
  }
  if (lower === "safety check" || (lower.includes("safety") && lower.length < 40)) {
    return safetyCheck(vehicle, resolvedTier);
  }
  if (lower === "route to quest" || lower.startsWith("route to")) {
    return routeToQuest(text, resolvedTier);
  }
  if (
    lower === "quests i can reach" ||
    lower.includes("can reach") ||
    lower.includes("reachable")
  ) {
    return questsICanReach(resolvedTier);
  }

  if (resolvedTier != null) {
    const hits = pickRegionMatches(text, reachable(QUESTS, resolvedTier));
    if (hits.length > 0 && text.length > 2) {
      return [
        `RANGER found ${hits.length} reachable match(es) for “${text}”:`,
        ...hits.slice(0, 6).map(formatQuestLine),
        hits.length > 6 ? `…plus ${hits.length - 6} more on the map.` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  const anyHits = pickRegionMatches(text, QUESTS);
  if (anyHits.length > 0 && text.length > 2) {
    return [
      `Found ${anyHits.length} catalog hit(s) for “${text}” (may exceed your tier):`,
      ...anyHits.slice(0, 6).map(formatQuestLine),
      resolvedTier != null
        ? `Your Tier ${tierLabel(resolvedTier)} filter is active — upgrade in Garage or toggle Show all on the map.`
        : "Set up Garage so I can mark which ones your rig can attempt.",
    ].join("\n");
  }

  if (
    lower.includes("tier") ||
    lower.includes("vehicle") ||
    lower.includes("garage") ||
    lower.includes("rig")
  ) {
    if (vehicle && resolvedTier != null) {
      return `Your ${vehicle.name} is a ${vehicle.type} with ${vehicle.drivetrain}, ${vehicle.groundClearanceIn}" clearance, ${vehicle.tires} tires — Tier ${tierLabel(resolvedTier)}. Ask “Quests I can reach” or open /garage to tune upgrades.`;
    }
    return "No vehicle on file yet. Head to Garage, log your rig, and I’ll score its capability tier.";
  }

  if (lower.includes("legendary")) {
    const legs = QUESTS.filter((q) => q.difficulty === "Legendary").slice(0, 5);
    return [
      "Legendary quests demand Extreme (Tier 5) builds and serious recovery plans:",
      ...legs.map(formatQuestLine),
      "Respect closures and your limits — the trail will still be there tomorrow.",
    ].join("\n");
  }

  return [
    "RANGER copy that.",
    vehicle && resolvedTier != null
      ? `You’re in a Tier ${tierLabel(resolvedTier)} ${vehicle.name}.`
      : "I don’t have your vehicle yet — visit Garage when you can.",
    "Try a chip, name a region (e.g. “Moab”, “Iceland”, “Patagonia”), or ask for Legendary routes.",
    `Catalog size: ${QUESTS.length} waypoints and growing toward 5000.`,
  ].join("\n");
}
