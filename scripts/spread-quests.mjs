/**
 * One-off: greedy spatial thinning of seed.json so kept quests are
 * at least MIN_KM apart (haversine). Always preserves q-test-gale-rs.
 * Prefers ~25 km spacing; retunes only if kept count falls under ~1500.
 *
 * Run: node scripts/spread-quests.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SEED_PATH = join(ROOT, "src/data/quests/seed.json");

const PRESERVE_ID = "q-test-gale-rs";
const MIN_KM_PREFERRED = 25;
const FLOOR_COUNT = 1500;

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

const DIFF_RANK = { Legendary: 0, Hard: 1, Moderate: 2, Easy: 3 };

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
    tooClose(q, minKm) {
      const i = Math.floor(q.lat / cellDeg);
      const j = Math.floor(q.lng / cellDeg);
      const reach = Math.ceil(minKm / (cellDeg * 111)) + 1;
      for (let di = -reach; di <= reach; di++) {
        for (let dj = -reach; dj <= reach; dj++) {
          const arr = buckets.get(`${i + di},${j + dj}`);
          if (!arr) continue;
          for (const y of arr) {
            if (haversineKm(q.lat, q.lng, y.lat, y.lng) < minKm) return true;
          }
        }
      }
      return false;
    },
  };
}

/**
 * Order candidates for greedy keep:
 * - West→east sweep packs better than id order
 * - Within similar longitude, prefer rarer difficulties then id
 * - Light region rotation: after sorting by lon, stable by region bucket
 */
function orderCandidates(others) {
  // West→east then south→north packs denser under greedy thinning.
  // Difficulty / id only break exact-coordinate ties for diversity.
  return [...others].sort((a, b) => {
    if (a.lng !== b.lng) return a.lng - b.lng;
    if (a.lat !== b.lat) return a.lat - b.lat;
    const da = DIFF_RANK[a.difficulty] ?? 9;
    const db = DIFF_RANK[b.difficulty] ?? 9;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
}

function thin(quests, minKm) {
  const preserve = quests.find((q) => q.id === PRESERVE_ID);
  const others = orderCandidates(quests.filter((q) => q.id !== PRESERVE_ID));
  const index = makeIndex(minKm);
  const kept = [];

  if (preserve) {
    kept.push(preserve);
    index.add(preserve);
  }

  for (const q of others) {
    if (index.tooClose(q, minKm)) continue;
    kept.push(q);
    index.add(q);
  }

  const gale = kept.filter((q) => q.id === PRESERVE_ID);
  const rest = kept
    .filter((q) => q.id !== PRESERVE_ID)
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...gale, ...rest];
}

function nnStats(quests) {
  const cellDeg = 0.5;
  const buckets = new Map();
  const key = (lat, lng) =>
    `${Math.floor(lat / cellDeg)},${Math.floor(lng / cellDeg)}`;
  for (const x of quests) {
    const k = key(x.lat, x.lng);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(x);
  }
  const nns = [];
  for (const x of quests) {
    let best = Infinity;
    const i = Math.floor(x.lat / cellDeg);
    const j = Math.floor(x.lng / cellDeg);
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        const arr = buckets.get(`${i + di},${j + dj}`) || [];
        for (const y of arr) {
          if (y.id === x.id) continue;
          const d = haversineKm(x.lat, x.lng, y.lat, y.lng);
          if (d < best) best = d;
        }
      }
    }
    if (best < Infinity) nns.push(best);
  }
  nns.sort((a, b) => a - b);
  return {
    median: nns[Math.floor(nns.length / 2)] ?? 0,
    p10: nns[Math.floor(nns.length * 0.1)] ?? 0,
    min: nns[0] ?? 0,
    mean: nns.length ? nns.reduce((a, b) => a + b, 0) / nns.length : 0,
  };
}

function regionCoverage(quests) {
  const usish = quests.filter((q) =>
    /USA|Canada|Mexico|Hawaii/.test(q.region),
  ).length;
  const saish = quests.filter((q) =>
    /Argentina|Chile|Bolivia|Peru|Brazil|Colombia|Ecuador|Galápagos/.test(
      q.region,
    ),
  ).length;
  return {
    usish,
    saish,
    regions: new Set(quests.map((q) => q.region)).size,
  };
}

const raw = JSON.parse(readFileSync(SEED_PATH, "utf8"));
console.log(`Loaded ${raw.length} quests from ${SEED_PATH}`);
const beforeNN = nnStats(raw);
console.log(
  `BEFORE count=${raw.length} medianNN=${beforeNN.median.toFixed(2)}km p10=${beforeNN.p10.toFixed(2)} min=${beforeNN.min.toFixed(2)} mean=${beforeNN.mean.toFixed(2)}`,
);
console.log("BEFORE coverage", regionCoverage(raw));

let minKm = MIN_KM_PREFERRED;
let kept = thin(raw, minKm);
console.log(`Thin @ ${minKm}km -> ${kept.length}`);

if (kept.length < FLOOR_COUNT) {
  for (const tryKm of [22, 20, 18, 15]) {
    kept = thin(raw, tryKm);
    minKm = tryKm;
    console.log(`Retune @ ${tryKm}km -> ${kept.length}`);
    if (kept.length >= FLOOR_COUNT) break;
  }
}

if (!kept.some((q) => q.id === PRESERVE_ID)) {
  throw new Error("FATAL: preserved quest missing after thin");
}

const byId = new Map(raw.map((q) => [q.id, q]));
for (const q of kept) {
  const orig = byId.get(q.id);
  if (!orig || orig.lat !== q.lat || orig.lng !== q.lng) {
    throw new Error(`Coordinate drift or unknown id: ${q.id}`);
  }
}

const afterNN = nnStats(kept);
console.log(
  `AFTER  count=${kept.length} medianNN=${afterNN.median.toFixed(2)}km p10=${afterNN.p10.toFixed(2)} min=${afterNN.min.toFixed(2)} mean=${afterNN.mean.toFixed(2)}`,
);
console.log("AFTER coverage", regionCoverage(kept));

writeFileSync(SEED_PATH, JSON.stringify(kept, null, 2) + "\n");
console.log(`Wrote ${kept.length} quests to ${SEED_PATH}`);
console.log(
  JSON.stringify({
    before: raw.length,
    after: kept.length,
    minKm,
    beforeMedianNN: +beforeNN.median.toFixed(3),
    afterMedianNN: +afterNN.median.toFixed(3),
    galePresent: true,
  }),
);
