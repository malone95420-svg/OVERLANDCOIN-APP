/**
 * Enrich notable existing quests with history blurbs and append curated
 * US/Canada/Hawaii POI quests from scripts/data/us-canada-poi-quests.json.
 * Enforces ~25 km spacing vs existing pins; always preserves q-test-gale-rs.
 *
 * Run: node scripts/append-poi-history-quests.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SEED_PATH = join(ROOT, "src/data/quests/seed.json");
const POI_PATH = join(__dirname, "data/us-canada-poi-quests.json");
const PRESERVE_ID = "q-test-gale-rs";
const MIN_KM = 25;
const REWARD = { Easy: 225, Moderate: 275, Hard: 350, Legendary: 600 };

const ENRICH_BY_TITLE = {
  "Hell's Revenge Trailhead":
    "Hell's Revenge is a Moab slickrock trail on BLM land east of the Colorado River, famous for steep off-camber fins and the Hot Tub drop. Sandstone grippiness when dry made it a proving ground for locked, high-clearance builds. Check current regulations — this is technical terrain, not a scenic cruise.",
  "Elephant Hill Trailhead":
    "Elephant Hill is the gateway to Canyonlands' Needles District backcountry, notorious for steep rock steps that demand short-wheelbase skill. Beyond the hill, jointed Cedar Mesa sandstone creates one of the Southwest's great jeep and hike landscapes. Permits and high clearance are essential.",
  "Burr Trail Switchbacks":
    "The Burr Trail began as a cattle route built by rancher John Atlantic Burr across what is now Grand Staircase–Escalante and Capitol Reef country. Steep switchbacks drop off the Waterpocket Fold into Strike Valley. Graded dirt and pavement mix depending on the segment — views are enormous.",
  "Notch Peak Trailhead":
    "Notch Peak in Utah's House Range hosts one of North America's highest pure limestone cliffs, rising above West Desert valleys. Remote BLM roads reach trailheads used by climbers and peakbaggers. The isolation explains why this skyline remains quiet compared with Zion or Arches.",
  "Little Sahara Sand Dunes":
    "Little Sahara Recreation Area protects a Jurassic sandstone dune field on BLM land in central Utah's Sevier Desert. Wind piles free sand into riding hills popular with OHVs and sandboards. Oasis campground cottonwoods mark a surprising green spot in the basin.",
  "Paiute ATV Trail (Circleville)":
    "The Paiute ATV Trail system links hundreds of miles of multi-use routes across Fishlake National Forest and adjoining public lands. Circleville is a classic southern Utah access community. High-plateau forests and desert edges alternate along the network.",
  "Mingus Mountain Forest Road":
    "Mingus Mountain rises between Prescott and Jerome with ponderosa roads and overlooks toward the Verde Valley. Mining and railroad history thread the Black Hills of Arizona. Cooler air makes it a summer escape from desert heat.",
  "Canyon de Chelly Overlook Road":
    "Canyon de Chelly National Monument protects continuous Navajo (Diné) homeland and Ancestral Puebloan cliff dwellings in sheer red sandstone canyons. South Rim overlooks including Spider Rock interpret living culture and deep archaeology. Tribal guides lead canyon-floor tours.",
  "Lake Havasu Backcountry":
    "Lake Havasu's desert tracks explore Mohave County country above the Colorado River reservoir created by Parker Dam. London Bridge's relocation made the town famous; the backcountry remains hot, rocky, and remote. Carry abundant water.",
  "Death Valley Dunes (Mesquite)":
    "Mesquite Flat Sand Dunes are Death Valley's most accessible dune field, sculpted by winds trapped near the Grapevine Mountains. Crescent and star dune forms shift seasonally. They sit far below sea-level-adjacent basins that define the valley's extremes.",
  "Racetrack Playa Road":
    "Racetrack Playa is home to sailing stones that leave tracks across a dry lake — moved by rare ice-window winds, not mystery alone. The rough washboard road from Ubehebe Crater demands high clearance and full-size spare tires. Night skies here are pristine.",
  "Titus Canyon Road":
    "Titus Canyon's one-way drive through the Grapevine Mountains passes lead-mining ruins at Leadfield and narrow limestone walls. It is among Death Valley's premier scenic geology routes. Check flood and road-status reports before committing.",
  "Alabama Hills Movie Road":
    "Alabama Hills' rounded granite and orange rock framed countless Westerns with Mount Whitney as backdrop. Movie Road loops past formations used as natural stage sets. The BLM National Scenic Area protects this cinematic landscape beside Lone Pine.",
  "Rubicon Trail (Wentworth Springs)":
    "The Rubicon Trail is a legendary Sierra granite rock-crawling route between Georgetown and Lake Tahoe country. Glacial erratics and slabs test armor and lockers. It helped define American four-wheeling culture from early Jeep expeditions onward.",
  "Black Bear Pass":
    "Black Bear Pass connects Telluride and Ouray via a notorious one-way shelf road with the 'steps' above Ingram Falls. Extreme exposure earned its reputation among San Juan alpine passes. Attempt only in capable vehicles with calm weather and local knowledge.",
  "Imogene Pass":
    "Imogene Pass tops over 13,000 feet between Ouray and Telluride through mining high country of the San Juans. Remnants of tram towers and claims line the climb. It is among Colorado's highest through-routes for licensed vehicles.",
  "Shafer Trail Overlook":
    "Shafer Trail drops from Island in the Sky mesa toward the White Rim along old uranium and cattle routes. Switchbacks etched in Wingate cliffs are a Canyonlands icon. High clearance and nerves help on the descent.",
  "White Rim Road (Island in the Sky)":
    "White Rim Road circles Canyonlands' Island in the Sky district on a sandstone bench above the Colorado and Green Rivers. Multi-day bike and 4x4 trips need permits. It is a master class in Colorado Plateau layer-cake geology.",
  "Monument Valley Visitor Approach":
    "Monument Valley's buttes on Navajo Nation land became global icons through Western films and still operate as a tribal park. Graded scenic loops pass Mittens and Merrick Butte. Hire Navajo guides for deeper cultural context.",
  "Chaco Canyon Approach":
    "Chaco Culture National Historical Park preserves monumental great houses of a ceremonial hub of the Ancestral Puebloan world. Washboard county roads intentionally limit casual access. Night skies and aligned walls reward unhurried visits.",
  "Big Bend River Road":
    "River Road parallels the Rio Grande through Chihuahuan Desert in Big Bend National Park toward remote hot springs and canyon mouths. Heat, distance, and border geography demand preparation. Santa Elena and Boquillas stories share the river.",
  "Sedona Schnebly Hill Road":
    "Schnebly Hill Road climbs red-rock benches above Sedona with sweeping views of the Verde Valley. Historic wagon freight grades evolved into a rough scenic climb. High clearance preferred when storms ravel the surface.",
  "Broken Arrow Trailhead":
    "Broken Arrow is Sedona's famous ledgy rock corridor for tours and capable 4x4s beneath iconic spires. Red Coconino and Schnebly Hill sandstones define the color. Permit and tour rules change — check before you go.",
  "Apache Trail (AZ-88)":
    "Historic Salt River canyon road built for Roosevelt Dam construction, clinging to cliffs above Apache Lake country. Sections remain dirt and exposed. It is a foundational Arizona Territory engineering story.",
  "Gemini Bridges Trailhead":
    "Gemini Bridges are twin natural rock spans west of Moab reached by dirt roads and short hikes. Uranium-road era tracks still lace the mesa. Classic sandstone architecture of the Colorado Plateau.",
  "Poison Spider Mesa":
    "Poison Spider Mesa trails survey Moab rim country with technical ledge obstacles and Colorado River overlooks. Early jeep clubs cemented its reputation. Extreme lines exist beside scenic overlooks.",
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function makeIndex(minKm) {
  const cellDeg = Math.max(0.05, (minKm / 111) * 0.9);
  const buckets = new Map();
  const key = (lat, lng) =>
    `${Math.floor(lat / cellDeg)},${Math.floor(lng / cellDeg)}`;
  return {
    add(q) {
      const k = key(q.lat, q.lng);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(q);
    },
    tooClose(lat, lng, minKm) {
      const i = Math.floor(lat / cellDeg);
      const j = Math.floor(lng / cellDeg);
      const reach = Math.ceil(minKm / (cellDeg * 111)) + 1;
      for (let di = -reach; di <= reach; di++) {
        for (let dj = -reach; dj <= reach; dj++) {
          const arr = buckets.get(`${i + di},${j + dj}`);
          if (!arr) continue;
          for (const y of arr) {
            if (haversineKm(lat, lng, y.lat, y.lng) < minKm) return true;
          }
        }
      }
      return false;
    },
  };
}

function nextId(seed) {
  let max = 0;
  for (const q of seed) {
    const m = String(q.id).match(/^q(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function slugId(n) {
  return `q${String(n).padStart(4, "0")}`;
}

const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const pois = JSON.parse(readFileSync(POI_PATH, "utf8"));

let enriched = 0;
for (const q of seed) {
  const blurb = ENRICH_BY_TITLE[q.title];
  if (!blurb) continue;
  if (q.description !== blurb) {
    q.description = blurb;
    enriched += 1;
  }
}

const titleSet = new Set(seed.map((q) => q.title.toLowerCase()));
const index = makeIndex(MIN_KM);
for (const q of seed) index.add(q);

let idNum = nextId(seed);
const added = [];
let skippedClose = 0;
let skippedDup = 0;

for (const p of pois) {
  if (titleSet.has(p.title.toLowerCase())) {
    skippedDup += 1;
    continue;
  }
  if (index.tooClose(p.lat, p.lng, MIN_KM)) {
    skippedClose += 1;
    continue;
  }
  const diff = p.difficulty in REWARD ? p.difficulty : "Easy";
  const quest = {
    id: slugId(idNum++),
    title: p.title,
    description: p.description,
    lat: p.lat,
    lng: p.lng,
    rewardOlC: REWARD[diff],
    difficulty: diff,
    region: p.region,
    minTier:
      p.minTier ??
      (diff === "Legendary" ? 5 : diff === "Hard" ? 3 : diff === "Moderate" ? 2 : 1),
    terrainTags: p.terrainTags || [],
    radiusMeters: p.radiusMeters || 100,
  };
  seed.push(quest);
  index.add(quest);
  titleSet.add(quest.title.toLowerCase());
  added.push(quest);
}

if (!seed.some((q) => q.id === PRESERVE_ID)) {
  throw new Error("FATAL: Gale test quest missing");
}

const gale = seed.find((q) => q.id === PRESERVE_ID);
const rest = seed.filter((q) => q.id !== PRESERVE_ID);
const out = gale ? [gale, ...rest] : seed;

writeFileSync(SEED_PATH, JSON.stringify(out, null, 2) + "\n");

const hi = added.filter((q) => /Hawaii/i.test(q.region)).length;
const ca = added.filter((q) => /Canada/i.test(q.region)).length;

console.log(
  JSON.stringify(
    {
      after: out.length,
      enriched,
      added: added.length,
      addedHawaii: hi,
      addedCanada: ca,
      addedUS: added.length - hi - ca,
      skippedClose,
      skippedDupTitle: skippedDup,
      minKm: MIN_KM,
      sample: added.slice(0, 2).map((q) => ({
        title: q.title,
        description: q.description,
      })),
    },
    null,
    2,
  ),
);
