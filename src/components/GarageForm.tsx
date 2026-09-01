"use client";

import Link from "next/link";
import { useVehicle } from "@/hooks/useVehicle";
import {
  TIER_LABELS,
  type Drivetrain,
  type TireType,
  type Vehicle,
  type VehicleType,
} from "@/lib/vehicle";

const TYPES: VehicleType[] = ["car", "crossover", "suv", "truck", "overland-rig"];
const DRIVES: Drivetrain[] = ["fwd", "rwd", "awd", "4wd"];
const TIRES: TireType[] = ["all-season", "at", "mt"];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-400">{children}</label>;
}

function inputClass() {
  return "w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50";
}

export function GarageForm() {
  const { vehicle, setVehicle, resetVehicle, points, tier, hydrated } = useVehicle();

  function patch<K extends keyof Vehicle>(key: K, value: Vehicle[K]) {
    setVehicle({ ...vehicle, [key]: value });
  }

  if (!hydrated) {
    return (
      <div className="card text-sm text-slate-500">Loading garage…</div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <form
        className="card lg:col-span-3 space-y-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <FieldLabel>Vehicle name</FieldLabel>
          <input
            className={inputClass()}
            value={vehicle.name}
            onChange={(e) => patch("name", e.target.value)}
            maxLength={64}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Type</FieldLabel>
            <select
              className={inputClass()}
              value={vehicle.type}
              onChange={(e) => patch("type", e.target.value as VehicleType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Drivetrain</FieldLabel>
            <select
              className={inputClass()}
              value={vehicle.drivetrain}
              onChange={(e) => patch("drivetrain", e.target.value as Drivetrain)}
            >
              {DRIVES.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel>Ground clearance (in)</FieldLabel>
            <input
              type="number"
              min={4}
              max={24}
              step={0.5}
              className={inputClass()}
              value={vehicle.groundClearanceIn}
              onChange={(e) => patch("groundClearanceIn", Number(e.target.value))}
            />
          </div>
          <div>
            <FieldLabel>Lift (in)</FieldLabel>
            <input
              type="number"
              min={0}
              max={12}
              step={0.5}
              className={inputClass()}
              value={vehicle.liftIn}
              onChange={(e) => patch("liftIn", Number(e.target.value))}
            />
          </div>
          <div>
            <FieldLabel>Tires</FieldLabel>
            <select
              className={inputClass()}
              value={vehicle.tires}
              onChange={(e) => patch("tires", e.target.value as TireType)}
            >
              {TIRES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["winch", "Winch"],
              ["frontLocker", "Front locker"],
              ["rearLocker", "Rear locker"],
              ["snorkel", "Snorkel"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-slate-200"
            >
              <input
                type="checkbox"
                checked={vehicle[key]}
                onChange={(e) => patch(key, e.target.checked)}
                className="accent-gold"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" className="btn-secondary !py-2 !text-xs" onClick={resetVehicle}>
            Reset to default
          </button>
          <Link href="/map" className="btn-primary !py-2 !text-xs">
            View filtered Quest Map
          </Link>
        </div>
        <p className="text-xs text-slate-600">
          Saved automatically to localStorage. Scoring rules live in{" "}
          <code className="text-slate-400">src/lib/vehicle.ts</code>.
        </p>
      </form>

      <aside className="card lg:col-span-2 h-fit space-y-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Capability</p>
        <p className="text-4xl font-bold text-gold-bright">
          Tier {tier}{" "}
          <span className="text-xl text-white">{TIER_LABELS[tier]}</span>
        </p>
        <p className="text-sm text-slate-400">
          Score <span className="font-mono text-cyan-accent">{points}</span> points from drivetrain,
          clearance, lift, tires, type, and gear.
        </p>
        <ul className="space-y-2 text-sm text-slate-400">
          <li>1 Stock — pavement / easy graded dirt</li>
          <li>2 Light — washboard, mild ruts</li>
          <li>3 Capable — real trails, AT + 4WD</li>
          <li>4 Built — lockers, lift, MT</li>
          <li>5 Extreme — winch + dual lockers class</li>
        </ul>
        <Link href="/ranger" className="btn-secondary w-full !text-xs">
          Ask RANGER about this rig
        </Link>
      </aside>
    </div>
  );
}
