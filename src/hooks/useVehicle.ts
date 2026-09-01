"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_VEHICLE,
  VEHICLE_STORAGE_KEY,
  getVehicleTier,
  scoreVehiclePoints,
  type CapabilityTier,
  type Vehicle,
} from "@/lib/vehicle";

function readStored(): Vehicle {
  if (typeof window === "undefined") return DEFAULT_VEHICLE;
  try {
    const raw = localStorage.getItem(VEHICLE_STORAGE_KEY);
    if (!raw) return DEFAULT_VEHICLE;
    const parsed = JSON.parse(raw) as Partial<Vehicle>;
    return { ...DEFAULT_VEHICLE, ...parsed };
  } catch {
    return DEFAULT_VEHICLE;
  }
}

export function useVehicle() {
  const [vehicle, setVehicleState] = useState<Vehicle>(DEFAULT_VEHICLE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVehicleState(readStored());
    setHydrated(true);
  }, []);

  const setVehicle = useCallback((next: Vehicle | ((prev: Vehicle) => Vehicle)) => {
    setVehicleState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try {
        localStorage.setItem(VEHICLE_STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* ignore quota */
      }
      return value;
    });
  }, []);

  const resetVehicle = useCallback(() => {
    setVehicle(DEFAULT_VEHICLE);
  }, [setVehicle]);

  const points = scoreVehiclePoints(vehicle);
  const tier: CapabilityTier = getVehicleTier(vehicle);

  return { vehicle, setVehicle, resetVehicle, points, tier, hydrated };
}
