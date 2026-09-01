/**
 * Vehicle Garage + Capability Scoring
 * -----------------------------------
 * Tiers map a stored vehicle profile to quest gating (minTier on each quest).
 *
 * Tier 1 Stock   — pavement / graded dirt, low clearance
 * Tier 2 Light   — mild washboard, shallow ruts, AWD crossover
 * Tier 3 Capable — real trails, moderate rocks, 4WD + AT tires
 * Tier 4 Built   — lockers, lift, MT tires, serious obstacles
 * Tier 5 Extreme — winch + dual lockers + snorkel class routes
 *
 * Score is computed from drivetrain, clearance, lift, tires, and gear flags.
 * Quests filter with: vehicleTier >= quest.minTier (unless "show all" is on).
 */

export type VehicleType = "car" | "crossover" | "truck" | "suv" | "overland-rig";
export type Drivetrain = "fwd" | "rwd" | "awd" | "4wd";
export type TireType = "all-season" | "at" | "mt";

export type CapabilityTier = 1 | 2 | 3 | 4 | 5;

export const TIER_LABELS: Record<CapabilityTier, string> = {
  1: "Stock",
  2: "Light",
  3: "Capable",
  4: "Built",
  5: "Extreme",
};

export type Vehicle = {
  name: string;
  type: VehicleType;
  drivetrain: Drivetrain;
  /** Ground clearance in inches (stock or after lift — use actual measured/stated). */
  groundClearanceIn: number;
  /** Extra lift in inches above stock (0 if stock height). */
  liftIn: number;
  tires: TireType;
  winch: boolean;
  frontLocker: boolean;
  rearLocker: boolean;
  snorkel: boolean;
};

export const DEFAULT_VEHICLE: Vehicle = {
  name: "My Rig",
  type: "suv",
  drivetrain: "awd",
  groundClearanceIn: 8,
  liftIn: 0,
  tires: "all-season",
  winch: false,
  frontLocker: false,
  rearLocker: false,
  snorkel: false,
};

export const VEHICLE_STORAGE_KEY = "overlandcoin.garage.vehicle.v1";

/**
 * Score rules (documented):
 * - Base by drivetrain: fwd=0, rwd=1, awd=3, 4wd=5
 * - Clearance: <7" =0, 7–8.9=1, 9–10.9=2, 11–12.9=3, 13+=4
 * - Lift: floor(liftIn / 2) capped at 3
 * - Tires: all-season=0, at=2, mt=4
 * - Gear: winch+2, rearLocker+2, frontLocker+2, snorkel+1
 * - Type nudge: car −1, crossover 0, suv +1, truck +1, overland-rig +2
 *
 * Tier thresholds on total points:
 *   ≤4 → 1 Stock
 *   5–9 → 2 Light
 *   10–15 → 3 Capable
 *   16–21 → 4 Built
 *   ≥22 → 5 Extreme
 */
export function scoreVehiclePoints(v: Vehicle): number {
  const drivetrainPts: Record<Drivetrain, number> = {
    fwd: 0,
    rwd: 1,
    awd: 3,
    "4wd": 5,
  };
  const tirePts: Record<TireType, number> = {
    "all-season": 0,
    at: 2,
    mt: 4,
  };
  const typePts: Record<VehicleType, number> = {
    car: -1,
    crossover: 0,
    suv: 1,
    truck: 1,
    "overland-rig": 2,
  };

  let clearancePts = 0;
  if (v.groundClearanceIn >= 13) clearancePts = 4;
  else if (v.groundClearanceIn >= 11) clearancePts = 3;
  else if (v.groundClearanceIn >= 9) clearancePts = 2;
  else if (v.groundClearanceIn >= 7) clearancePts = 1;

  const liftPts = Math.min(3, Math.floor(Math.max(0, v.liftIn) / 2));
  const gearPts =
    (v.winch ? 2 : 0) +
    (v.rearLocker ? 2 : 0) +
    (v.frontLocker ? 2 : 0) +
    (v.snorkel ? 1 : 0);

  return (
    drivetrainPts[v.drivetrain] +
    clearancePts +
    liftPts +
    tirePts[v.tires] +
    gearPts +
    typePts[v.type]
  );
}

export function pointsToTier(points: number): CapabilityTier {
  if (points >= 22) return 5;
  if (points >= 16) return 4;
  if (points >= 10) return 3;
  if (points >= 5) return 2;
  return 1;
}

export function getVehicleTier(v: Vehicle): CapabilityTier {
  return pointsToTier(scoreVehiclePoints(v));
}

export function canReachQuest(vehicleTier: CapabilityTier, minTier: CapabilityTier): boolean {
  return vehicleTier >= minTier;
}

export function tierLabel(tier: CapabilityTier): string {
  return `${tier} ${TIER_LABELS[tier]}`;
}
