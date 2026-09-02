/**
 * Append NEW US + South America overland quests to existing seed.json.
 * Does NOT wipe existing quests. Preserves q-test-gale-rs at front.
 *
 * Sources: curated extras, OSM Overpass (cached), GeoNames US + SA dumps.
 * Dedupes within ~150m of existing + newly selected points.
 * After appending, run `node scripts/spread-quests.mjs` to enforce ~25 km spacing.
 *
 * Run: node scripts/append-quests-us-sa.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from "fs";
import { createInterface } from "readline";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(__dirname, "cache");
const OUT_DIR = join(ROOT, "src/data/quests");
const SEED_PATH = join(OUT_DIR, "seed.json");
const DEDUPE_METERS = 150;
const TARGET_NEW = 2000;
const US_TARGET = 1300;
const SA_TARGET = 700;

const REWARD_BY_DIFFICULTY = {
  Easy: 25,
  Moderate: 75,
  Hard: 150,
  Legendary: 400,
};

function rewardForDifficulty(d) {
  if (d === "Medium") return REWARD_BY_DIFFICULTY.Moderate;
  return REWARD_BY_DIFFICULTY[d] ?? REWARD_BY_DIFFICULTY.Easy;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function makeDedupeIndex() {
  const cell = 0.002;
  const buckets = new Map();
  const key = (lat, lng) => `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
  return {
    hasNear(lat, lng, meters = DEDUPE_METERS) {
      const i0 = Math.floor(lat / cell);
      const j0 = Math.floor(lng / cell);
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const arr = buckets.get(`${i0 + di}:${j0 + dj}`);
          if (!arr) continue;
          for (const p of arr) {
            if (haversineM(lat, lng, p.lat, p.lng) < meters) return true;
          }
        }
      }
      return false;
    },
    add(lat, lng) {
      const k = key(lat, lng);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push({ lat, lng });
    },
  };
}

const HARD_RE =
  /\b(4wd|4x4|4-wheel|four[\s-]?wheel|jeep|ohv|atv|technical|wilderness|remote|alpine|ford|slickrock|rock crawl|extreme|ledge|shelf road|high clearance|altiplano|andes|patagonia)\b/i;
const LEGENDARY_RE =
  /\b(extreme|rubicon|hell'?s revenge|black bear|fordyce|cape york|simpson desert|salar de uyuni)\b/i;
const EASY_RE = /\b(scenic|overlook|viewpoint|visitor|picnic|parkway|paved|interpretive)\b/i;

function classifyFromName(name, fcode, elev) {
  const n = name || "";
  if (LEGENDARY_RE.test(n)) return { difficulty: "Legendary", minTier: 5, tags: ["extreme", "remote"] };
  if (HARD_RE.test(n) || fcode === "GAP" || (elev != null && elev >= 3000)) {
    const tags = ["dirt", "mountain"];
    if (elev != null && elev >= 3000) tags.push("high-alpine");
    if (elev != null && elev >= 3500) tags.push("high-altitude");
    if (/rock|ledge|slick/i.test(n)) tags.push("rock");
    if (/andes|cordillera/i.test(n)) tags.push("andes");
    if (/patagon/i.test(n)) tags.push("patagonia");
    if (/salar|salt/i.test(n)) tags.push("saltflat");
    return { difficulty: "Hard", minTier: elev != null && elev >= 3500 ? 4 : 3, tags };
  }
  if (fcode === "PRK" || EASY_RE.test(n) || fcode === "viewpoint" || fcode === "picnic_site") {
    return { difficulty: "Easy", minTier: 1, tags: ["scenic"] };
  }
  if (fcode === "CMP" || fcode === "camp_site") {
    return { difficulty: "Moderate", minTier: 2, tags: ["dirt", "forest"] };
  }
  if (fcode === "TRL" || fcode === "trailhead") {
    return { difficulty: "Moderate", minTier: 2, tags: ["dirt", "forest"] };
  }
  if (fcode === "MT" || fcode === "RDGE" || fcode === "CLF") {
    return { difficulty: "Hard", minTier: 3, tags: ["mountain", "dirt"] };
  }
  if (fcode === "LK" || fcode === "SPNG" || fcode === "FALL") {
    return { difficulty: "Moderate", minTier: 2, tags: ["scenic", "dirt"] };
  }
  return { difficulty: "Moderate", minTier: 2, tags: ["dirt"] };
}

function titleFor(name, fcode) {
  const n = name.trim().replace(/\s+/g, " ");
  if (/camp|trail|park|pass|gap|overlook|viewpoint|picnic|hut|salar|laguna|mirador/i.test(n)) return n;
  const suffix = {
    CMP: "Camp",
    camp_site: "Camp",
    TRL: "Trail",
    trailhead: "Trailhead",
    PRK: "Park",
    GAP: "Gap",
    PASS: "Pass",
    viewpoint: "Viewpoint",
    picnic_site: "Picnic Site",
    wilderness_hut: "Hut",
    MT: "Peak Area",
    LK: "Lake Access",
    SPNG: "Spring",
    RDGE: "Ridge",
    AREA: "Recreation Area",
    FALL: "Falls",
    VAL: "Valley",
    RSV: "Reservoir Access",
    CLF: "Cliff Overlook",
    MESA: "Mesa",
    BUTE: "Butte",
    PLAT: "Plateau",
    RESV: "Reserve",
  }[fcode];
  return suffix ? `${n} ${suffix}` : n;
}

function descFor(title, region, fcode, difficulty) {
  const place = region.replace(/, USA|, Canada/g, "");
  const byCode = {
    CMP: `Dispersed / developed camp access in ${place} — verify fire rules and surface conditions.`,
    camp_site: `Camp site waypoint in ${place}. High-clearance helpful on approach spurs.`,
    TRL: `Named trail corridor in ${place}. Overland staging / trailhead-style check-in.`,
    trailhead: `Trailhead access in ${place}.`,
    PRK: `Park / recreation site in ${place}. Stock vehicles often OK to the pin.`,
    GAP: `Mountain gap / pass notch in ${place}. Expect grades, weather, and possible snow seasonally.`,
    viewpoint: `Scenic viewpoint / mirador in ${place}.`,
    picnic_site: `Picnic site pullout in ${place}.`,
    wilderness_hut: `Backcountry hut vicinity in ${place}.`,
    MT: `Mountain waypoint in ${place}. Approach roads may be rough.`,
    LK: `Lake / laguna access area in ${place}.`,
    SPNG: `Named spring area in ${place}.`,
    RDGE: `Ridge access in ${place}.`,
    FALL: `Waterfall area access in ${place}.`,
    VAL: `Valley corridor in ${place}.`,
    RSV: `Reservoir access in ${place}.`,
    AREA: `Recreation area in ${place}.`,
    RESV: `Reserve / protected area access in ${place}.`,
  };
  const base = byCode[fcode] || `Overland waypoint in ${place}.`;
  if (difficulty === "Hard" || difficulty === "Legendary") {
    return `${base} Rated ${difficulty} — clearance / recovery gear recommended.`;
  }
  return base;
}

function isBadName(name) {
  if (!name || name.length < 3) return true;
  if (/^unnamed/i.test(name)) return true;
  if (/^\d+$/.test(name.trim())) return true;
  if (/^(a|the|north|south|east|west)\s*\d+$/i.test(name)) return true;
  if (/indian reserve|pre-reserve|réserve indienne/i.test(name)) return true;
  if (/^\{\d+\}/.test(name)) return true;
  if (/^[0-9A-Z]{2,5}$/i.test(name.trim())) return true;
  if (/^\d[A-Z]\d\b/i.test(name) && name.length < 14) return true;
  if (/^(calle|avenida|rua|street|road)\b/i.test(name) && name.length < 12) return true;
  return false;
}

/** Expanded US coverage — skip WY (already saturated). */
const STATE_REGION = {
  CO: "Colorado, USA",
  UT: "Utah, USA",
  MT: "Montana, USA",
  ID: "Idaho, USA",
  NM: "New Mexico, USA",
  AZ: "Arizona, USA",
  NV: "Nevada, USA",
  OR: "Oregon, USA",
  WA: "Washington, USA",
  CA: "California, USA",
  SD: "South Dakota, USA",
  ND: "North Dakota, USA",
  AK: "Alaska, USA",
  TX: "Texas, USA",
  NE: "Nebraska, USA",
  KS: "Kansas, USA",
  OK: "Oklahoma, USA",
  MI: "Michigan, USA",
  MN: "Minnesota, USA",
  WI: "Wisconsin, USA",
  AR: "Arkansas, USA",
  MO: "Missouri, USA",
  TN: "Tennessee, USA",
  NC: "North Carolina, USA",
  SC: "South Carolina, USA",
  VA: "Virginia, USA",
  WV: "West Virginia, USA",
  GA: "Georgia, USA",
  FL: "Florida, USA",
  AL: "Alabama, USA",
  MS: "Mississippi, USA",
  LA: "Louisiana, USA",
  KY: "Kentucky, USA",
  PA: "Pennsylvania, USA",
  NY: "New York, USA",
  ME: "Maine, USA",
  NH: "New Hampshire, USA",
  VT: "Vermont, USA",
  HI: "Hawaii, USA",
  // intentionally omit WY
};

const CORE = new Set(["CMP", "TRL", "PRK", "GAP"]);
/** Extra fcodes — avoid MT/LK flood from GeoNames */
const EXTRA = new Set(["RDGE", "AREA", "FALL", "CLF", "MESA", "BUTE", "PLAT", "RSV", "VAL", "RESV", "SPNG"]);
/** Thin / expansion states get EXTRA; already-heavy Mountain West stays CORE-only */
const EXTRA_STATES = new Set([
  "AZ", "NM", "TX", "NV", "OR", "WA", "ID", "AK",
  "MI", "MN", "WI", "AR", "MO", "TN", "NC", "SC", "VA", "WV", "GA", "FL",
  "AL", "MS", "LA", "KY", "PA", "NY", "ME", "NH", "VT", "HI", "SD", "OK",
]);

const SA_COUNTRIES = {
  AR: "Argentina",
  CL: "Chile",
  PE: "Peru",
  BO: "Bolivia",
  BR: "Brazil",
  CO: "Colombia",
  EC: "Ecuador",
};

const SA_CORE = new Set(["CMP", "TRL", "PRK", "GAP", "AREA", "RESV", "RDGE", "FALL", "CLF", "VAL", "PLAT", "MESA"]);
const SA_EXTRA = new Set(["MT", "LK", "SPNG"]); // only for Andean/Patagonia countries

/** Hand-curated US + SA corridors not already saturated in seed */
const CURATED_EXTRA = [
  // US Southwest / Rockies / PNW / South / Midwest
  ["Organ Pipe Bates Well Road", "Arizona, USA", 32.0, -112.95, "Hard", 3, ["desert", "remote"], "Remote Sonoran desert track in Organ Pipe."],
  ["Kofa National Wildlife Refuge Roads", "Arizona, USA", 33.35, -114.0, "Hard", 3, ["desert", "remote"], "Kofa Mountains desert backroads."],
  ["Baboquivari Peak Approach", "Arizona, USA", 31.72, -111.6, "Hard", 3, ["desert", "mountain"], "Tohono O'odham borderlands approach."],
  ["Chiricahua Sky Island Roads", "Arizona, USA", 31.95, -109.35, "Moderate", 2, ["forest", "mountain"], "Sky island forest roads SE Arizona."],
  ["Superstition Mountains FR", "Arizona, USA", 33.45, -111.35, "Hard", 3, ["desert", "rock"], "Superstition Wilderness edge FRs."],
  ["Four Peaks Road", "Arizona, USA", 33.7, -111.35, "Hard", 3, ["mountain", "dirt"], "Mazatzal / Four Peaks high road."],
  ["Pinal Mountain Roads", "Arizona, USA", 33.28, -110.9, "Moderate", 2, ["forest", "dirt"], "Globe area sky-island roads."],
  ["Mount Lemmon Control Road", "Arizona, USA", 32.45, -110.75, "Hard", 3, ["mountain", "dirt"], "Old Control Road on Catalinas."],
  ["Buenos Aires NWR Roads", "Arizona, USA", 31.55, -111.5, "Moderate", 2, ["desert", "dirt"], "Border grasslands refuge roads."],
  ["El Camino del Diablo Segment", "Arizona, USA", 32.15, -113.5, "Hard", 4, ["desert", "remote"], "Historic devil's highway segment — remote."],
  ["Valley of Fires Backroads", "New Mexico, USA", 33.68, -105.92, "Moderate", 2, ["volcanic", "dirt"], "Malpais lava-flow area roads."],
  ["Bisti / De-Na-Zin Access", "New Mexico, USA", 36.25, -108.25, "Moderate", 2, ["desert", "badlands"], "Badlands wilderness access roads."],
  ["El Malpais Chain of Craters", "New Mexico, USA", 34.85, -108.1, "Hard", 3, ["volcanic", "dirt"], "Chain of Craters Backcountry Byway."],
  ["San Pedro Parks FR", "New Mexico, USA", 36.1, -106.85, "Moderate", 2, ["forest", "dirt"], "Jemez / San Pedro Parks forest roads."],
  ["Latir Peak Wilderness Edge", "New Mexico, USA", 36.8, -105.45, "Hard", 3, ["alpine", "dirt"], "Northern Sangre de Cristo access."],
  ["Guadalupe Ridge Roads", "New Mexico, USA", 32.15, -104.7, "Moderate", 2, ["desert", "mountain"], "Guadalupe Mountains NM approaches."],
  ["Capitan Mountains FR", "New Mexico, USA", 33.6, -105.4, "Moderate", 2, ["forest", "dirt"], "Lincoln NF Capitan range roads."],
  ["Bootheel Animas Mountains", "New Mexico, USA", 31.55, -108.8, "Hard", 3, ["desert", "remote"], "NM bootheel remote mountain tracks."],
  ["Big Bend Glenn Spring Road", "Texas, USA", 29.2, -103.15, "Hard", 3, ["desert", "remote"], "Big Bend primitive road to Glenn Spring."],
  ["Big Bend Paint Gap Road", "Texas, USA", 29.3, -103.25, "Hard", 3, ["desert", "dirt"], "Chisos foothill primitive road."],
  ["Big Bend Hot Springs Historic", "Texas, USA", 29.18, -102.99, "Moderate", 2, ["desert", "scenic"], "Rio Grande Village hot springs area."],
  ["Davis Mountains Scenic Loop Spurs", "Texas, USA", 30.65, -104.1, "Moderate", 2, ["mountain", "dirt"], "Sky-island spurs near Fort Davis."],
  ["Chinati Hot Springs Road", "Texas, USA", 29.8, -104.5, "Hard", 3, ["desert", "remote"], "Remote Trans-Pecos canyon approach."],
  ["Palo Duro Canyon Rim Roads", "Texas, USA", 34.95, -101.67, "Moderate", 2, ["canyon", "dirt"], "Panhandle canyon rim tracks."],
  ["Padre Island Beach Access", "Texas, USA", 27.45, -97.28, "Hard", 3, ["sand", "beach"], "Coastal beach driving — tide aware."],
  ["Sam Houston NF Forest Roads", "Texas, USA", 30.55, -95.25, "Moderate", 2, ["forest", "dirt"], "East Texas piney woods FRs."],
  ["Alabama Hills Movie Flat Spur", "California, USA", 36.59, -118.12, "Easy", 1, ["scenic", "dirt"], "Classic Lone Pine dirt loops."],
  ["Death Valley Warm Springs Canyon", "California, USA", 36.15, -117.05, "Hard", 3, ["desert", "remote"], "Remote West Side Road connector."],
  ["Death Valley Echo Canyon", "California, USA", 36.55, -116.7, "Hard", 3, ["canyon", "dirt"], "One-way canyon toward Death Valley."],
  ["Mojave Preserve Kelbaker Spurs", "California, USA", 34.9, -115.65, "Moderate", 2, ["desert", "dirt"], "Mojave National Preserve side roads."],
  ["Mojave Preserve Mojave Road", "California, USA", 35.05, -115.4, "Hard", 3, ["desert", "historic"], "Historic Mojave Road segment."],
  ["Carrizo Plain Soda Lake Roads", "California, USA", 35.2, -119.75, "Moderate", 2, ["desert", "dirt"], "Carrizo Plain grassland / playa roads."],
  ["Los Padres Figueroa Mountain", "California, USA", 34.75, -119.98, "Moderate", 2, ["forest", "dirt"], "Santa Barbara backcountry FRs."],
  ["Los Padres Sierra Madre Ridge", "California, USA", 34.85, -119.7, "Hard", 3, ["mountain", "dirt"], "Remote Sierra Madre ridge road."],
  ["Inyo White Mountain Road", "California, USA", 37.5, -118.2, "Hard", 3, ["high-alpine", "dirt"], "Ancient bristlecone / White Mtn road."],
  ["Toiyabe Austin Backroads", "Nevada, USA", 39.5, -117.1, "Moderate", 2, ["desert", "dirt"], "Central Nevada basin-and-range tracks."],
  ["Ruby Mountains Lamoille Canyon Spurs", "Nevada, USA", 40.65, -115.4, "Moderate", 2, ["alpine", "dirt"], "Ruby Mountains side roads."],
  ["Great Basin Wheeler Peak Camp Roads", "Nevada, USA", 39.01, -114.31, "Easy", 1, ["scenic", "paved"], "Wheeler Peak scenic drive area."],
  ["Sheldon NWR Backroads", "Nevada, USA", 41.85, -119.05, "Hard", 3, ["high-desert", "remote"], "Remote NW Nevada refuge roads."],
  ["Steens East Rim Viewpoint", "Oregon, USA", 42.7, -118.55, "Moderate", 2, ["high-desert", "scenic"], "Steens Mountain east rim overlooks."],
  ["Hart Mountain Antelope Refuge", "Oregon, USA", 42.5, -119.65, "Moderate", 2, ["high-desert", "dirt"], "Remote SE Oregon refuge roads."],
  ["Owyhee Canyonlands OR", "Oregon, USA", 43.2, -117.5, "Hard", 3, ["desert", "remote"], "Owyhee canyon rim tracks."],
  ["Fremont NF Gearhart Mountain", "Oregon, USA", 42.5, -120.9, "Moderate", 2, ["forest", "dirt"], "South-central Oregon forest roads."],
  ["Willamette NF Santiam Spurs", "Oregon, USA", 44.5, -121.9, "Moderate", 2, ["forest", "dirt"], "Cascades Santiam corridor FRs."],
  ["Olympic NF Dosewallips Roads", "Washington, USA", 47.75, -123.1, "Moderate", 2, ["forest", "dirt"], "East Olympic forest approaches."],
  ["Mount Baker NF Roads", "Washington, USA", 48.75, -121.7, "Moderate", 2, ["forest", "mountain"], "North Cascades Baker area FRs."],
  ["Gifford Pinchot FR", "Washington, USA", 46.3, -121.8, "Moderate", 2, ["forest", "volcanic"], "South Cascades forest road network."],
  ["Colville NF Kettle Crest", "Washington, USA", 48.6, -118.5, "Moderate", 2, ["forest", "dirt"], "NE Washington Kettle Crest roads."],
  ["Sawtooth Basin Roads", "Idaho, USA", 44.15, -114.9, "Moderate", 2, ["alpine", "dirt"], "Sawtooth / Stanley basin access."],
  ["Frank Church Salmon River Road", "Idaho, USA", 45.4, -114.7, "Hard", 3, ["remote", "dirt"], "Wilderness-edge Salmon River corridor."],
  ["Owyhee Canyonlands ID", "Idaho, USA", 42.6, -116.5, "Hard", 3, ["desert", "remote"], "Idaho Owyhee desert canyon tracks."],
  ["Seven Devils FR", "Idaho, USA", 45.3, -116.55, "Hard", 3, ["mountain", "dirt"], "Hells Canyon rim forest roads."],
  ["Lolo Pass Area Spurs", "Idaho, USA", 46.55, -114.65, "Moderate", 2, ["forest", "dirt"], "Idaho-Montana Lolo corridor FRs."],
  ["Bob Marshall Edge Roads", "Montana, USA", 47.5, -113.0, "Hard", 3, ["forest", "remote"], "Bob Marshall Wilderness periphery."],
  ["Absaroka Beartooth FR", "Montana, USA", 45.2, -109.8, "Hard", 3, ["alpine", "dirt"], "Beartooth / Absaroka forest roads."],
  ["Missouri Breaks Backcountry", "Montana, USA", 47.7, -108.5, "Hard", 3, ["prairie", "remote"], "Upper Missouri Breaks remote tracks."],
  ["Cabinet Mountains FR", "Montana, USA", 48.2, -115.7, "Moderate", 2, ["forest", "dirt"], "NW Montana Cabinet range roads."],
  ["San Juan Silverton Spurs", "Colorado, USA", 37.82, -107.65, "Hard", 3, ["alpine", "rock"], "Silverton high-country spur roads."],
  ["Flat Tops Trail Scenic Byway Spurs", "Colorado, USA", 40.0, -107.4, "Moderate", 2, ["forest", "dirt"], "Flat Tops plateau forest roads."],
  ["Buffalo Peaks FR", "Colorado, USA", 39.05, -106.15, "Moderate", 2, ["alpine", "dirt"], "Buffalo Peaks Wilderness edge."],
  ["Unaweep Canyon Rim", "Colorado, USA", 38.8, -108.7, "Moderate", 2, ["canyon", "dirt"], "Unaweep / Tabeguache rim tracks."],
  ["Grand Mesa Land's End Road", "Colorado, USA", 39.0, -108.2, "Moderate", 2, ["forest", "dirt"], "Grand Mesa high plateau roads."],
  ["White River NF Maroon Spurs", "Colorado, USA", 39.1, -106.95, "Hard", 3, ["alpine", "dirt"], "Maroon Bells / Crystal River spurs."],
  ["Henry Mountains Roads", "Utah, USA", 38.1, -110.8, "Hard", 3, ["desert", "remote"], "Remote Henry Mountains bison country."],
  ["Abajo / Blue Mountain Loop", "Utah, USA", 37.85, -109.5, "Moderate", 2, ["forest", "dirt"], "Monticello high forest loop."],
  ["Book Cliffs Tavaputs Plateau", "Utah, USA", 39.5, -109.5, "Hard", 3, ["desert", "remote"], "Remote Book Cliffs plateau roads."],
  ["Uinta Highline Access FR", "Utah, USA", 40.7, -110.5, "Hard", 3, ["alpine", "dirt"], "Uinta Mountains forest road approaches."],
  ["Pine Valley Mountains FR", "Utah, USA", 37.4, -113.4, "Moderate", 2, ["forest", "dirt"], "SW Utah pine valley forest roads."],
  ["Ozark Buffalo River Access", "Arkansas, USA", 36.0, -93.1, "Moderate", 2, ["forest", "dirt"], "Buffalo National River forest access."],
  ["Caney Creek Wilderness FR", "Arkansas, USA", 34.4, -94.0, "Moderate", 2, ["forest", "dirt"], "Ouachita Caney Creek approaches."],
  ["Mark Twain NF Current River", "Missouri, USA", 37.2, -91.2, "Moderate", 2, ["forest", "dirt"], "Ozark Current River forest roads."],
  ["Huron-Manistee FR", "Michigan, USA", 44.4, -84.0, "Moderate", 2, ["forest", "sand"], "Lower Peninsula forest & sand tracks."],
  ["Seney NWR Backroads", "Michigan, USA", 46.25, -86.0, "Moderate", 2, ["forest", "dirt"], "UP Seney refuge area roads."],
  ["Superior NF Gunflint Spurs", "Minnesota, USA", 48.05, -90.7, "Moderate", 2, ["forest", "dirt"], "Gunflint Trail side forest roads."],
  ["Chequamegon-Nicolet FR", "Wisconsin, USA", 46.0, -90.5, "Moderate", 2, ["forest", "dirt"], "Northwoods national forest roads."],
  ["Daniel Boone NF Red River Gorge", "Kentucky, USA", 37.85, -83.65, "Moderate", 2, ["forest", "dirt"], "Red River Gorge forest access."],
  ["Pisgah NF Blue Ridge Spurs", "North Carolina, USA", 35.4, -82.75, "Moderate", 2, ["forest", "dirt"], "Pisgah forest road network."],
  ["Nantahala NF Forest Roads", "North Carolina, USA", 35.25, -83.7, "Moderate", 2, ["forest", "dirt"], "Nantahala mountain forest roads."],
  ["Chattahoochee Cohutta FR", "Georgia, USA", 34.85, -84.6, "Moderate", 2, ["forest", "dirt"], "Cohutta Wilderness edge FRs."],
  ["Tallahala / Bienville FR", "Mississippi, USA", 32.3, -89.3, "Moderate", 2, ["forest", "dirt"], "Central Mississippi forest roads."],
  ["Apalachicola NF Roads", "Florida, USA", 30.2, -84.7, "Moderate", 2, ["forest", "sand"], "Panhandle pine flatwoods tracks."],
  ["Ocala Big Scrub OHV", "Florida, USA", 29.1, -81.8, "Hard", 3, ["sand", "ohv"], "Ocala NF Big Scrub sand OHV."],
  ["Francis Marion FR", "South Carolina, USA", 33.15, -79.7, "Moderate", 2, ["forest", "dirt"], "Coastal plain forest roads."],
  ["George Washington NF Roads", "Virginia, USA", 38.5, -79.0, "Moderate", 2, ["forest", "dirt"], "Allegheny / Blue Ridge forest roads."],
  ["Monongahela NF Spruce Knob Spurs", "West Virginia, USA", 38.7, -79.55, "Moderate", 2, ["forest", "dirt"], "Highest WV spruce highland roads."],
  ["Allegheny NF Buzzard Swamp", "Pennsylvania, USA", 41.55, -79.1, "Moderate", 2, ["forest", "dirt"], "Allegheny Plateau forest roads."],
  ["Adirondack Moose River Plains", "New York, USA", 43.7, -74.75, "Moderate", 2, ["forest", "dirt"], "ADK interior dirt corridor."],
  ["White Mountain Kanc Spurs", "New Hampshire, USA", 44.05, -71.45, "Moderate", 2, ["forest", "dirt"], "White Mountains forest road spurs."],
  ["Baxter Perimeter Tote Road", "Maine, USA", 46.0, -68.9, "Moderate", 2, ["forest", "dirt"], "North Maine woods tote roads."],
  ["Chugach Forest Road Spurs", "Alaska, USA", 60.9, -149.1, "Moderate", 2, ["forest", "dirt"], "Kenai / Chugach forest road network."],
  ["Denali Highway Spurs", "Alaska, USA", 63.1, -147.5, "Hard", 3, ["remote", "gravel"], "Denali Highway side tracks."],
  ["Hana Dirt Spurs Maui", "Hawaii, USA", 20.75, -156.05, "Moderate", 2, ["tropical", "dirt"], "East Maui coastal dirt spurs."],
  // South America corridors
  ["Ruta 40 Lago Buenos Aires", "Santa Cruz, Argentina", -46.55, -71.65, "Moderate", 2, ["patagonia", "gravel"], "Patagonian steppe along Ruta 40."],
  ["Ruta 40 Copahue Approach", "Neuquén, Argentina", -37.85, -71.1, "Hard", 3, ["andes", "dirt"], "Volcanic Copahue / Caviahue approach."],
  ["Ruta 40 Cuesta del Yeso", "Mendoza, Argentina", -34.65, -69.55, "Hard", 3, ["andes", "dirt"], "High Andean graded / dirt corridor."],
  ["Paso de Jama Argentine Side", "Jujuy, Argentina", -23.25, -67.05, "Hard", 3, ["high-altitude", "remote"], "Altiplano border pass approach."],
  ["Quebrada de Humahuaca Spurs", "Jujuy, Argentina", -23.2, -65.35, "Moderate", 2, ["andes", "dirt"], "Colored valley side tracks."],
  ["Parque Nacional Los Glaciares Spurs", "Santa Cruz, Argentina", -50.35, -72.9, "Moderate", 2, ["patagonia", "gravel"], "Glacier park approach gravel."],
  ["Peninsula Valdés Interior Tracks", "Chubut, Argentina", -42.5, -64.0, "Moderate", 2, ["patagonia", "dirt"], "Wildlife peninsula interior roads."],
  ["Parque Nacional Talampaya Access", "La Rioja, Argentina", -29.8, -67.85, "Moderate", 2, ["desert", "scenic"], "Red canyon park approaches."],
  ["Sierras de Córdoba Altas Cumbres", "Córdoba, Argentina", -31.6, -64.85, "Moderate", 2, ["mountain", "dirt"], "Central Argentina highland road."],
  ["Parque Nacional El Impenetrable Edge", "Chaco, Argentina", -25.0, -61.0, "Hard", 3, ["remote", "dirt"], "Gran Chaco remote park edge."],
  ["Carretera Austral Puyuhuapi", "Aysén, Chile", -44.35, -72.55, "Moderate", 2, ["patagonia", "gravel"], "Fjord-side Austral gravel corridor."],
  ["Carretera Austral Caleta Tortel", "Aysén, Chile", -47.8, -73.55, "Hard", 3, ["patagonia", "remote"], "Boardwalk village Austral spur."],
  ["Carretera Austral Cerro Castillo", "Aysén, Chile", -46.1, -72.15, "Moderate", 2, ["patagonia", "gravel"], "Cerro Castillo park approach."],
  ["Parque Patagonia Chile Chico", "Aysén, Chile", -46.6, -71.75, "Hard", 3, ["patagonia", "dirt"], "Patagonia National Park tracks."],
  ["Atacama Cordillera Domeyko Tracks", "Antofagasta, Chile", -24.5, -69.2, "Hard", 3, ["desert", "remote"], "Atacama mountain desert tracks."],
  ["Salar de Atacama East Shore", "Antofagasta, Chile", -23.5, -68.15, "Moderate", 2, ["saltflat", "desert"], "Atacama salt flat shore roads."],
  ["El Tatio Geysers Road", "Antofagasta, Chile", -22.35, -68.05, "Hard", 3, ["high-altitude", "geothermal"], "High geyser field approach road."],
  ["Paso San Francisco Chilean Side", "Atacama, Chile", -27.3, -69.0, "Hard", 3, ["high-altitude", "remote"], "High Andean border pass."],
  ["Parque Nacional Lauca Roads", "Arica y Parinacota, Chile", -18.2, -69.3, "Hard", 3, ["high-altitude", "andes"], "Altiplano Lauca park roads."],
  ["Parque Nacional Torres del Paine Y End", "Magallanes, Chile", -51.0, -73.0, "Moderate", 2, ["patagonia", "gravel"], "Park internal gravel corridors."],
  ["Tierra del Fuego Karukinka Tracks", "Magallanes, Chile", -54.0, -69.0, "Hard", 3, ["patagonia", "remote"], "Chilean Tierra del Fuego tracks."],
  ["Ruta del Fin del Mundo Tolhuin", "Tierra del Fuego, Argentina", -54.5, -67.2, "Moderate", 2, ["patagonia", "gravel"], "Ushuaia–Río Grande corridor."],
  ["Laguna Verde Altiplano", "Potosí, Bolivia", -22.8, -67.8, "Hard", 3, ["high-altitude", "saltflat"], "Southern altiplano colored lagoons."],
  ["Salar de Coipasa Edge", "Oruro, Bolivia", -19.4, -68.15, "Hard", 3, ["saltflat", "high-altitude"], "Coipasa salt flat corridors."],
  ["Parque Nacional Sajama Approach", "Oruro, Bolivia", -18.1, -68.9, "Hard", 3, ["high-altitude", "andes"], "Volcán Sajama park approaches."],
  ["Cordillera Real Takesi Edge", "La Paz, Bolivia", -16.4, -67.9, "Hard", 3, ["andes", "dirt"], "Cordillera Real mountain spurs."],
  ["Ruta de las Yungas Death Road Spur", "La Paz, Bolivia", -16.3, -67.8, "Hard", 4, ["cliff", "dirt"], "Old Yungas cliff road segment."],
  ["Madidi Park Edge Roads", "La Paz, Bolivia", -14.5, -68.0, "Hard", 3, ["jungle", "remote"], "Amazon foothill park edge."],
  ["Salar de Uyuni Incahuasi Approach", "Potosí, Bolivia", -20.25, -67.65, "Hard", 3, ["saltflat", "high-altitude"], "Fish Island salt flat approach."],
  ["Cordillera Blanca Llanganuco", "Ancash, Peru", -9.05, -77.65, "Hard", 3, ["andes", "dirt"], "Llanganuco lakes high valley."],
  ["Cordillera Huayhuash Edge", "Ancash, Peru", -10.25, -76.9, "Hard", 4, ["andes", "remote"], "Remote Huayhuash circuit approaches."],
  ["Ausangate Circuit Access", "Cusco, Peru", -13.8, -71.2, "Hard", 3, ["andes", "high-altitude"], "Ausangate sacred mountain approaches."],
  ["Colca Canyon Rim Roads", "Arequipa, Peru", -15.6, -71.9, "Moderate", 2, ["andes", "dirt"], "Colca Canyon rim viewpoints roads."],
  ["Salinas y Aguada Blanca Reserve", "Arequipa, Peru", -16.1, -71.4, "Hard", 3, ["high-altitude", "dirt"], "High puna reserve roads."],
  ["Paracas Reserve Coastal Tracks", "Ica, Peru", -13.9, -76.3, "Moderate", 2, ["desert", "coast"], "Pacific desert coastal reserve."],
  ["Huacachina Dune Edge", "Ica, Peru", -14.09, -75.76, "Hard", 3, ["sand", "dunes"], "Oasis dune periphery tracks."],
  ["Manu Road Cloud Forest", "Cusco, Peru", -13.1, -71.4, "Hard", 3, ["jungle", "dirt"], "Cloud forest descent toward Manu."],
  ["Lake Titicaca Capachica Spurs", "Puno, Peru", -15.65, -69.85, "Moderate", 2, ["high-altitude", "dirt"], "Titicaca peninsula dirt roads."],
  ["Chapada dos Veadeiros Roads", "Goiás, Brazil", -14.1, -47.5, "Moderate", 2, ["plateau", "dirt"], "Central Brazil cerrado plateau."],
  ["Pantanal Transpantaneira", "Mato Grosso, Brazil", -16.5, -56.7, "Hard", 3, ["swamp", "dirt"], "Classic Pantanal wildlife corridor."],
  ["Serra do Cipó Park Roads", "Minas Gerais, Brazil", -19.3, -43.6, "Moderate", 2, ["mountain", "dirt"], "Espinhaço range park access."],
  ["Jalapão Dune Roads", "Tocantins, Brazil", -10.35, -46.55, "Hard", 3, ["sand", "remote"], "Jalapão sand dune / cerrado tracks."],
  ["Serra da Canastra Access", "Minas Gerais, Brazil", -20.25, -46.55, "Moderate", 2, ["plateau", "dirt"], "Canastra plateau park roads."],
  ["Lençóis Maranhenses Interior", "Maranhão, Brazil", -2.65, -42.8, "Hard", 3, ["sand", "coast"], "Dune-and-lagoon interior tracks."],
  ["Chapada Diamantina Vale do Capão", "Bahia, Brazil", -12.55, -41.5, "Moderate", 2, ["plateau", "dirt"], "Diamond highlands valley access."],
  ["Iguaçu Park Interior Roads", "Paraná, Brazil", -25.65, -54.45, "Easy", 1, ["scenic", "forest"], "Falls park approach roads."],
  ["Eje Cafetero Mountain Tracks", "Quindío, Colombia", 4.55, -75.7, "Moderate", 2, ["mountain", "dirt"], "Coffee axis highland tracks."],
  ["Parque Los Nevados Approach", "Tolima, Colombia", 4.9, -75.35, "Hard", 3, ["andes", "high-altitude"], "Los Nevados volcanic park approach."],
  ["Sierra Nevada de Santa Marta Spurs", "Magdalena, Colombia", 10.85, -73.7, "Hard", 3, ["mountain", "remote"], "Coastal sierra mountain approaches."],
  ["Parque Nacional El Cocuy Access", "Boyacá, Colombia", 6.45, -72.3, "Hard", 3, ["andes", "high-altitude"], "El Cocuy glacier park roads."],
  ["Tatacoa Desert Tracks", "Huila, Colombia", 3.25, -75.15, "Moderate", 2, ["desert", "dirt"], "Tropical desert badland tracks."],
  ["Caño Cristales Access Road", "Meta, Colombia", 2.2, -73.8, "Hard", 3, ["remote", "dirt"], "Remote Serranía de la Macarena approach."],
  ["Quilotoa Loop Spurs", "Cotopaxi, Ecuador", -0.85, -78.9, "Moderate", 2, ["andes", "dirt"], "Quilotoa crater highland loop."],
  ["Cotopaxi Park Roads", "Cotopaxi, Ecuador", -0.68, -78.45, "Moderate", 2, ["andes", "dirt"], "Cotopaxi volcano park roads."],
  ["Parque Nacional Cajas Access", "Azuay, Ecuador", -2.9, -79.2, "Moderate", 2, ["andes", "high-altitude"], "Cajas highland lake park."],
  ["Otavalo Laguna Cuicocha Roads", "Imbabura, Ecuador", 0.3, -78.35, "Easy", 1, ["andes", "scenic"], "Cuicocha crater lake approaches."],
  ["Podocarpus Park Edge", "Loja, Ecuador", -4.2, -79.1, "Hard", 3, ["forest", "mountain"], "Southern Ecuador cloud forest park."],
  ["Galápagos Santa Cruz Highlands", "Galápagos, Ecuador", -0.65, -90.4, "Easy", 1, ["volcanic", "scenic"], "Santa Cruz highland roads (island)."],
  ["Mindo Cloud Forest Roads", "Pichincha, Ecuador", -0.05, -78.8, "Moderate", 2, ["forest", "dirt"], "NW Quito cloud forest tracks."],
  ["Nariz del Diablo Rail Corridor Spurs", "Chimborazo, Ecuador", -2.2, -78.85, "Moderate", 2, ["andes", "dirt"], "Andean switchback corridor spurs."],
];

function loadAdmin1Map() {
  const path = join(CACHE, "admin1CodesASCII.txt");
  const map = new Map();
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const [code, name] = line.split("\t");
    if (code && name) map.set(code, name);
  }
  return map;
}

function saRegion(country, admin1, admin1Map) {
  const countryName = SA_COUNTRIES[country] || country;
  const key = `${country}.${admin1}`;
  const prov = admin1Map.get(key);
  if (prov) {
    // shorten "Department" / long names
    const short = prov.replace(/ Department$/i, "").replace(/ Province$/i, "");
    return `${short}, ${countryName}`;
  }
  return countryName;
}

function priorityScore(admin1, fcode, country, region) {
  let p = 0;
  if (SA_COUNTRIES[country]) {
    p += 800;
    // boost classic overland countries
    if (["AR", "CL", "PE", "BO"].includes(country)) p += 100;
    else if (["CO", "EC"].includes(country)) p += 80;
    else p += 50; // BR
  } else {
    // US — boost underrepresented vs already-heavy Mountain West
    const boost = {
      AZ: 500, NM: 500, TX: 480, NV: 450, CA: 420, OR: 450, WA: 450, ID: 400,
      CO: 350, UT: 350, MT: 350, AK: 400,
      MI: 520, MN: 500, WI: 480, AR: 520, MO: 500, TN: 500, NC: 500, SC: 480,
      VA: 480, WV: 500, GA: 480, FL: 500, AL: 470, MS: 460, LA: 460, KY: 480,
      PA: 450, NY: 450, ME: 480, NH: 470, VT: 470, HI: 450,
      SD: 400, OK: 400, NE: 350, KS: 350, ND: 350,
    };
    p += boost[admin1] || 200;
  }
  const codeBoost = {
    CMP: 50, PRK: 45, GAP: 40, camp_site: 50, viewpoint: 42, picnic_site: 35,
    trailhead: 38, TRL: 30, MT: 18, LK: 14, SPNG: 10, RDGE: 12, AREA: 22,
    RESV: 20, FALL: 14, CLF: 12, VAL: 12, MESA: 12, PLAT: 12, BUTE: 10, RSV: 10,
  };
  p += codeBoost[fcode] || 0;
  return p;
}

async function ensureGeonamesUs() {
  mkdirSync(CACHE, { recursive: true });
  const txtPath = join(CACHE, "US.txt");
  if (existsSync(txtPath)) return;
  const zipPath = join(CACHE, "US.zip");
  if (!existsSync(zipPath)) {
    console.log("Downloading US.zip ...");
    const res = await fetch("https://download.geonames.org/export/dump/US.zip", {
      headers: { "User-Agent": "OverlandCoinQuestBot/1.0" },
    });
    if (!res.ok) throw new Error(`US.zip download failed: ${res.status}`);
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  }
  execSync(`unzip -o -q US.zip US.txt`, { cwd: CACHE });
}

async function ensureGeonamesSA() {
  mkdirSync(CACHE, { recursive: true });
  for (const code of Object.keys(SA_COUNTRIES)) {
    const txt = `${code}.txt`;
    const txtPath = join(CACHE, txt);
    if (existsSync(txtPath)) continue;
    const zip = `${code}.zip`;
    const zipPath = join(CACHE, zip);
    if (!existsSync(zipPath)) {
      const url = `https://download.geonames.org/export/dump/${zip}`;
      console.log(`Downloading ${url} ...`);
      const res = await fetch(url, { headers: { "User-Agent": "OverlandCoinQuestBot/1.0" } });
      if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
      writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    }
    console.log(`Unzipping ${zip} ...`);
    execSync(`unzip -o -q ${JSON.stringify(zip)} ${JSON.stringify(txt)}`, { cwd: CACHE });
  }
  // admin1 codes
  const adminPath = join(CACHE, "admin1CodesASCII.txt");
  if (!existsSync(adminPath)) {
    const url = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";
    console.log(`Downloading ${url} ...`);
    const res = await fetch(url, { headers: { "User-Agent": "OverlandCoinQuestBot/1.0" } });
    if (!res.ok) throw new Error(`admin1 download failed: ${res.status}`);
    writeFileSync(adminPath, Buffer.from(await res.arrayBuffer()));
  }
}

async function parseGeonamesUS(path) {
  if (!existsSync(path)) return [];
  const out = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    const row = line.split("\t");
    if (row.length < 11) continue;
    const name = row[1];
    const lat = parseFloat(row[4]);
    const lng = parseFloat(row[5]);
    const fcode = row[7];
    const admin1 = row[10];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (isBadName(name)) continue;
    if (!STATE_REGION[admin1]) continue; // skips WY and non-listed
    const keep = CORE.has(fcode) || (EXTRA_STATES.has(admin1) && EXTRA.has(fcode));
    if (!keep) continue;
    let elev = null;
    if (row[15]) elev = parseInt(row[15], 10);
    else if (row[16]) elev = parseInt(row[16], 10);
    if (!Number.isFinite(elev)) elev = null;
    const region = STATE_REGION[admin1];
    out.push({
      name, lat, lng, fcode, region, admin1, elev,
      source: "geonames",
      continent: "US",
      priority: priorityScore(admin1, fcode, "US", region),
    });
  }
  return out;
}

async function parseGeonamesSA(path, country, admin1Map) {
  if (!existsSync(path)) return [];
  const out = [];
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    const row = line.split("\t");
    if (row.length < 11) continue;
    const name = row[1];
    const lat = parseFloat(row[4]);
    const lng = parseFloat(row[5]);
    const fcode = row[7];
    const admin1 = row[10];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (isBadName(name)) continue;
    const andean = ["AR", "CL", "PE", "BO", "CO", "EC"].includes(country);
    const keep = SA_CORE.has(fcode) || (andean && SA_EXTRA.has(fcode));
    if (!keep) continue;
    // Brazil: prefer interior / highland belts
    if (country === "BR") {
      if (lng > -40) continue;
    }
    // Drop coastal mega-city noise for parks named too generically later via isBadName
    let elev = null;
    if (row[15]) elev = parseInt(row[15], 10);
    else if (row[16]) elev = parseInt(row[16], 10);
    if (!Number.isFinite(elev)) elev = null;
    const region = saRegion(country, admin1, admin1Map);
    out.push({
      name, lat, lng, fcode, region, admin1, elev,
      source: "geonames",
      continent: "SA",
      country,
      priority: priorityScore(admin1, fcode, country, region),
    });
  }
  return out;
}

async function fetchOverpassBbox(name, south, west, north, east) {
  const outPath = join(CACHE, `${name}.json`);
  if (existsSync(outPath)) {
    try {
      const d = JSON.parse(readFileSync(outPath, "utf8"));
      if (Array.isArray(d.elements)) return d.elements;
    } catch { /* refetch */ }
  }
  const query = `[out:json][timeout:75];(
  node["tourism"~"^(viewpoint|camp_site|picnic_site|wilderness_hut)$"](${south},${west},${north},${east});
  node["highway"="trailhead"](${south},${west},${north},${east});
  node["tourism"="information"]["information"="trailhead"](${south},${west},${north},${east});
  node["amenity"="parking"]["hiking"="yes"](${south},${west},${north},${east});
  node["tourism"="camp_site"](${south},${west},${north},${east});
);out body;`;
  const endpoints = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  for (const url of endpoints) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Overpass ${name} via ${url} (try ${attempt})...`);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "User-Agent": "OverlandCoinQuestBot/1.0",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(100000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = JSON.parse(await res.text());
        if (!Array.isArray(d.elements)) throw new Error("no elements");
        writeFileSync(outPath, JSON.stringify(d));
        console.log(`  -> ${d.elements.length} elements`);
        return d.elements;
      } catch (e) {
        console.warn(`  failed: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2500 * attempt));
      }
    }
  }
  console.warn(`Overpass ${name}: giving up, using empty`);
  return [];
}

function elementsToCandidates(elements, region, admin1, continent, country) {
  const out = [];
  for (const e of elements) {
    if (e.type !== "node" || e.lat == null) continue;
    const tags = e.tags || {};
    const name = tags.name || tags["name:en"] || tags["name:es"] || tags["name:pt"];
    if (isBadName(name)) continue;
    const fcode = tags.tourism || tags.highway || tags.leisure || tags.amenity || "poi";
    out.push({
      name,
      lat: e.lat,
      lng: e.lon,
      fcode,
      region,
      admin1,
      elev: tags.ele ? parseFloat(tags.ele) : null,
      source: "overpass",
      continent,
      country,
      priority: priorityScore(admin1, fcode, country || "US", region) + 90,
    });
  }
  return out;
}

/** Soft caps so one state/province cannot eat the whole budget */
const REGION_CAPS = {
  // US expansion — allow substantial fills where seed is thin
  "Arizona, USA": 120,
  "New Mexico, USA": 100,
  "Texas, USA": 110,
  "California, USA": 100,
  "Nevada, USA": 80,
  "Oregon, USA": 90,
  "Washington, USA": 80,
  "Idaho, USA": 70,
  "Colorado, USA": 80,
  "Utah, USA": 70,
  "Montana, USA": 60,
  "Alaska, USA": 60,
  "Michigan, USA": 80,
  "Minnesota, USA": 70,
  "Wisconsin, USA": 60,
  "Arkansas, USA": 70,
  "Missouri, USA": 60,
  "Tennessee, USA": 60,
  "North Carolina, USA": 70,
  "South Carolina, USA": 40,
  "Virginia, USA": 50,
  "West Virginia, USA": 50,
  "Georgia, USA": 50,
  "Florida, USA": 70,
  "Alabama, USA": 40,
  "Mississippi, USA": 35,
  "Louisiana, USA": 35,
  "Kentucky, USA": 45,
  "Pennsylvania, USA": 40,
  "New York, USA": 45,
  "Maine, USA": 45,
  "New Hampshire, USA": 35,
  "Vermont, USA": 30,
  "Hawaii, USA": 25,
  "South Dakota, USA": 40,
  "Oklahoma, USA": 40,
  "Nebraska, USA": 25,
  "Kansas, USA": 25,
  "North Dakota, USA": 25,
  // SA — generous per-country province caps applied via countryCounts too
};

const SA_COUNTRY_CAPS = {
  AR: 160,
  CL: 140,
  PE: 120,
  BO: 100,
  BR: 120,
  CO: 90,
  EC: 80,
};

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  if (!existsSync(SEED_PATH)) throw new Error(`Missing seed: ${SEED_PATH}`);
  const existing = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  if (!Array.isArray(existing) || existing.length < 100) {
    throw new Error(`Seed looks invalid (len=${existing?.length})`);
  }

  const gale = existing.filter((q) => q.id === "q-test-gale-rs");
  const rest = existing.filter((q) => q.id !== "q-test-gale-rs");
  console.log(`Existing seed: ${existing.length} (gale=${gale.length})`);

  const index = makeDedupeIndex();
  for (const q of existing) index.add(q.lat, q.lng);

  // Max numeric id
  let maxNum = 0;
  for (const q of existing) {
    const m = /^q(\d+)$/.exec(q.id);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }

  const candidates = [];

  // 1) Curated extras
  for (const row of CURATED_EXTRA) {
    const [title, region, lat, lng, difficulty, minTier, terrainTags, description] = row;
    const continent = /Argentina|Chile|Peru|Bolivia|Brazil|Colombia|Ecuador|Patagonia|Ancash|Potos|Aysén|Magallanes|Neuquén|Mendoza|Jujuy|Chubut|La Rioja|Córdoba|Chaco|Antofagasta|Atacama|Arica|Oruro|La Paz|Cusco|Arequipa|Ica|Puno|Goiás|Mato Grosso|Minas Gerais|Tocantins|Maranhão|Bahia|Paraná|Quindío|Tolima|Magdalena|Boyacá|Huila|Meta|Cotopaxi|Azuay|Imbabura|Loja|Galápagos|Pichincha|Chimborazo/i.test(region)
      ? "SA"
      : "US";
    candidates.push({
      name: title,
      lat,
      lng,
      fcode: "curated",
      region,
      admin1: continent === "SA" ? "SA" : "US",
      elev: null,
      source: "curated",
      continent,
      country: continent === "SA" ? "SA" : "US",
      priority: 2000,
      _ready: {
        title,
        description,
        difficulty,
        minTier,
        terrainTags,
      },
    });
  }
  console.log(`Curated extras: ${CURATED_EXTRA.length}`);

  // 2) GeoNames
  await ensureGeonamesUs();
  await ensureGeonamesSA();
  const admin1Map = loadAdmin1Map();

  console.log("Parsing GeoNames US (expanded states, no WY) ...");
  const geoUs = await parseGeonamesUS(join(CACHE, "US.txt"));
  console.log(`  US candidates: ${geoUs.length}`);
  for (const c of geoUs) candidates.push(c);

  let geoSaCount = 0;
  for (const code of Object.keys(SA_COUNTRIES)) {
    console.log(`Parsing GeoNames ${code} ...`);
    const rows = await parseGeonamesSA(join(CACHE, `${code}.txt`), code, admin1Map);
    console.log(`  ${code}: ${rows.length}`);
    geoSaCount += rows.length;
    for (const c of rows) candidates.push(c);
  }
  console.log(`SA GeoNames total: ${geoSaCount}`);

  // 3) Overpass tiles — US beyond WY + SA corridors
  const overpassTiles = [
    // US Southwest
    ["az_south", 31.3, -114.8, 33.5, -109.0, "Arizona, USA", "AZ", "US", "US"],
    ["az_north", 33.5, -114.8, 37.0, -109.0, "Arizona, USA", "AZ", "US", "US"],
    ["nm_south", 31.3, -109.05, 34.5, -103.0, "New Mexico, USA", "NM", "US", "US"],
    ["nm_north", 34.5, -109.05, 37.0, -104.0, "New Mexico, USA", "NM", "US", "US"],
    ["tx_west", 29.0, -106.5, 32.0, -101.0, "Texas, USA", "TX", "US", "US"],
    ["tx_bigbend", 28.9, -104.0, 30.0, -102.5, "Texas, USA", "TX", "US", "US"],
    ["nv_south", 35.0, -120.0, 39.0, -114.0, "Nevada, USA", "NV", "US", "US"],
    ["ca_south", 32.5, -118.5, 36.0, -114.5, "California, USA", "CA", "US", "US"],
    ["ca_sierra", 36.0, -121.5, 39.5, -118.0, "California, USA", "CA", "US", "US"],
    ["ut_south", 37.0, -114.0, 39.5, -109.0, "Utah, USA", "UT", "US", "US"],
    ["co_south", 37.0, -109.0, 39.0, -104.5, "Colorado, USA", "CO", "US", "US"],
    // PNW / Rockies north
    ["or_east", 42.0, -121.5, 45.5, -117.0, "Oregon, USA", "OR", "US", "US"],
    ["or_cascades", 42.0, -123.5, 45.5, -121.0, "Oregon, USA", "OR", "US", "US"],
    ["wa_cascades", 45.5, -123.0, 49.0, -120.0, "Washington, USA", "WA", "US", "US"],
    ["id_central", 43.0, -116.5, 46.5, -113.5, "Idaho, USA", "ID", "US", "US"],
    ["mt_west", 45.0, -115.0, 49.0, -111.0, "Montana, USA", "MT", "US", "US"],
    // South / Midwest / East
    ["ar_ozark", 34.0, -94.5, 36.5, -90.5, "Arkansas, USA", "AR", "US", "US"],
    ["mi_up", 45.5, -90.5, 47.5, -83.5, "Michigan, USA", "MI", "US", "US"],
    ["mn_north", 46.5, -95.0, 49.0, -89.5, "Minnesota, USA", "MN", "US", "US"],
    ["nc_west", 35.0, -84.5, 36.6, -80.5, "North Carolina, USA", "NC", "US", "US"],
    ["fl_central", 27.5, -83.0, 30.5, -80.5, "Florida, USA", "FL", "US", "US"],
    ["tn_east", 35.0, -85.0, 36.7, -81.5, "Tennessee, USA", "TN", "US", "US"],
    ["wv_highland", 37.5, -81.5, 40.0, -78.0, "West Virginia, USA", "WV", "US", "US"],
    ["ak_southcentral", 59.5, -152.0, 62.5, -145.0, "Alaska, USA", "AK", "US", "US"],
    // South America
    ["sa_patagonia_ar", -52.0, -73.5, -45.0, -66.0, "Santa Cruz, Argentina", "20", "SA", "AR"],
    ["sa_patagonia_cl", -53.0, -75.0, -44.0, -70.0, "Aysén, Chile", "11", "SA", "CL"],
    ["sa_mendoza", -36.5, -70.5, -32.0, -67.5, "Mendoza, Argentina", "13", "SA", "AR"],
    ["sa_neuquen", -41.0, -72.0, -36.5, -68.0, "Neuquén, Argentina", "15", "SA", "AR"],
    ["sa_atacama", -27.0, -70.5, -22.0, -67.5, "Antofagasta, Chile", "02", "SA", "CL"],
    ["sa_altiplano_bo", -23.0, -69.5, -18.0, -65.5, "Potosí, Bolivia", "07", "SA", "BO"],
    ["sa_lapaz", -17.5, -69.5, -14.5, -66.5, "La Paz, Bolivia", "04", "SA", "BO"],
    ["sa_cusco_pe", -15.5, -73.0, -12.5, -70.0, "Cusco, Peru", "08", "SA", "PE"],
    ["sa_ancash_pe", -10.5, -78.5, -8.5, -76.5, "Ancash, Peru", "02", "SA", "PE"],
    ["sa_arequipa_pe", -17.0, -73.0, -15.0, -70.5, "Arequipa, Peru", "04", "SA", "PE"],
    ["sa_colombia_andes", 3.5, -77.0, 7.5, -72.5, "Tolima, Colombia", "86", "SA", "CO"],
    ["sa_ecuador_andes", -3.5, -80.0, 1.0, -77.5, "Cotopaxi, Ecuador", "06", "SA", "EC"],
    ["sa_brazil_pantanal", -19.0, -58.5, -15.0, -55.0, "Mato Grosso, Brazil", "14", "SA", "BR"],
    ["sa_brazil_chapada", -14.5, -48.0, -11.5, -45.5, "Bahia, Brazil", "05", "SA", "BR"],
    ["sa_tdf", -55.2, -69.5, -53.5, -66.5, "Tierra del Fuego, Argentina", "23", "SA", "AR"],
  ];

  let overpassCands = [];
  for (const [name, s, w, n, e, region, admin1, continent, country] of overpassTiles) {
    const els = await fetchOverpassBbox(name, s, w, n, e);
    const mapped = elementsToCandidates(els, region, admin1, continent, country);
    // For SA overpass, refine region label via country if generic
    overpassCands = overpassCands.concat(mapped);
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(`Overpass named candidates: ${overpassCands.length}`);
  for (const c of overpassCands) candidates.push(c);

  candidates.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  console.log(`Total candidates: ${candidates.length}`);

  const selected = [];
  const regionCounts = {};
  const countryCounts = { US: 0, AR: 0, CL: 0, PE: 0, BO: 0, BR: 0, CO: 0, EC: 0, SA: 0 };
  let usCount = 0;
  let saCount = 0;

  const tryAdd = (c) => {
    if (selected.length >= TARGET_NEW) return false;
    if (index.hasNear(c.lat, c.lng)) return false;

    const isSA = c.continent === "SA";
    if (isSA) {
      if (saCount >= Math.ceil(SA_TARGET * 1.15)) return false;
      const cc = c.country && SA_COUNTRY_CAPS[c.country] != null ? c.country : "SA";
      const cap = SA_COUNTRY_CAPS[cc] ?? 60;
      if ((countryCounts[cc] || 0) >= cap) return false;
    } else {
      if (usCount >= Math.ceil(US_TARGET * 1.15)) return false;
      const cap = REGION_CAPS[c.region] ?? 40;
      if ((regionCounts[c.region] || 0) >= cap) return false;
    }

    let quest;
    if (c._ready) {
      quest = {
        title: c._ready.title,
        description: c._ready.description,
        lat: Number(c.lat.toFixed(5)),
        lng: Number(c.lng.toFixed(5)),
        rewardOlC: rewardForDifficulty(c._ready.difficulty),
        difficulty: c._ready.difficulty,
        region: c.region,
        minTier: c._ready.minTier,
        terrainTags: c._ready.terrainTags,
        radiusMeters: 100,
        _source: "curated",
        _continent: c.continent,
      };
    } else {
      const { difficulty, minTier, tags } = classifyFromName(c.name, c.fcode, c.elev);
      const title = titleFor(c.name, c.fcode);
      quest = {
        title,
        description: descFor(title, c.region, c.fcode, difficulty),
        lat: Number(c.lat.toFixed(5)),
        lng: Number(c.lng.toFixed(5)),
        rewardOlC: rewardForDifficulty(difficulty),
        difficulty,
        region: c.region,
        minTier,
        terrainTags: tags,
        radiusMeters: 100,
        _source: c.source,
        _continent: c.continent,
      };
    }

    selected.push(quest);
    index.add(quest.lat, quest.lng);
    regionCounts[c.region] = (regionCounts[c.region] || 0) + 1;
    if (isSA) {
      saCount++;
      const cc = c.country && SA_COUNTRY_CAPS[c.country] != null ? c.country : "SA";
      countryCounts[cc] = (countryCounts[cc] || 0) + 1;
    } else {
      usCount++;
      countryCounts.US++;
    }
    return true;
  };

  // Phase A — curated first
  for (const c of candidates) {
    if (c.source !== "curated") continue;
    tryAdd(c);
  }

  // Phase B — soft-fill SA then US toward geographic spread
  for (const c of candidates) {
    if (selected.length >= TARGET_NEW) break;
    if (c.continent !== "SA") continue;
    tryAdd(c);
  }
  for (const c of candidates) {
    if (selected.length >= TARGET_NEW) break;
    if (c.continent === "SA") continue;
    tryAdd(c);
  }

  // Phase C — if under target, relax region caps (+50%) and retry
  if (selected.length < TARGET_NEW) {
    console.log(`Relaxing caps to fill remaining (have ${selected.length})...`);
    for (const k of Object.keys(REGION_CAPS)) REGION_CAPS[k] = Math.ceil(REGION_CAPS[k] * 1.6);
    for (const k of Object.keys(SA_COUNTRY_CAPS)) SA_COUNTRY_CAPS[k] = Math.ceil(SA_COUNTRY_CAPS[k] * 1.5);
    for (const c of candidates) {
      if (selected.length >= TARGET_NEW) break;
      tryAdd(c);
    }
  }

  // Phase D — last resort: ignore soft region/country caps; keep overall TARGET_NEW
  if (selected.length < TARGET_NEW) {
    console.log(`Final uncapped fill (have ${selected.length})...`);
    for (const k of Object.keys(REGION_CAPS)) REGION_CAPS[k] = 99999;
    for (const k of Object.keys(SA_COUNTRY_CAPS)) SA_COUNTRY_CAPS[k] = 99999;
    for (const c of candidates) {
      if (selected.length >= TARGET_NEW) break;
      tryAdd(c);
    }
  }

  const newQuests = selected.map(({ _source, _continent, ...q }, i) => ({
    ...q,
    id: `q${String(maxNum + i + 1).padStart(4, "0")}`,
  }));

  const all = [...gale, ...rest, ...newQuests];
  const payload = JSON.stringify(all, null, 2) + "\n";
  writeFileSync(SEED_PATH, payload);

  // Stats
  const byRegion = {};
  for (const q of newQuests) byRegion[q.region] = (byRegion[q.region] || 0) + 1;
  const usNew = newQuests.filter((q) => /, USA$/i.test(q.region) || /USA/i.test(q.region)).length;
  const saNew = newQuests.length - usNew;
  const top = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 25);

  console.log(
    JSON.stringify(
      {
        previousTotal: existing.length,
        added: newQuests.length,
        newTotal: all.length,
        usNewApprox: usNew,
        saNewApprox: saNew,
        galePreserved: all[0]?.id === "q-test-gale-rs",
        bytes: payload.length,
        topNewRegions: Object.fromEntries(top),
        sources: {
          curated: selected.filter((s) => s._source === "curated").length,
          overpass: selected.filter((s) => s._source === "overpass").length,
          geonames: selected.filter((s) => s._source === "geonames").length,
        },
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${all.length} quests to ${SEED_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
