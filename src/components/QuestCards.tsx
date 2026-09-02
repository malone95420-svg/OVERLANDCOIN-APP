"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Quest } from "@/lib/quests";
import { filterQuestsByTier } from "@/lib/quests";
import { useVehicle } from "@/hooks/useVehicle";
import { canReachQuest, TIER_LABELS, tierLabel } from "@/lib/vehicle";
import { hasCompletedQuest, loadCompletions } from "@/lib/completions";
import { QuestMap } from "./QuestMap";
import { CheckInModal } from "./CheckInModal";
import { QuestDirections } from "./QuestDirections";
import type { UserGeo } from "./UserLocationLayer";

export function QuestCards({ quests }: { quests: Quest[] }) {
  const { tier, hydrated, vehicle } = useVehicle();
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [checkInQuest, setCheckInQuest] = useState<Quest | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [userGeo, setUserGeo] = useState<UserGeo>({ status: "idle" });
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);

  const refreshCompletions = useCallback(() => {
    const ids = new Set<string>();
    for (const c of loadCompletions()) ids.add(c.questId);
    for (const q of quests) {
      if (hasCompletedQuest(q.id)) ids.add(q.id);
    }
    setCompletedIds(ids);
  }, [quests]);

  useEffect(() => {
    refreshCompletions();
  }, [refreshCompletions]);

  const visible = useMemo(() => {
    if (!hydrated) return quests;
    return filterQuestsByTier(quests, tier, showAll);
  }, [quests, tier, showAll, hydrated]);

  const selectedId =
    selected && visible.some((q) => q.id === selected) ? selected : visible[0]?.id;

  const selectedQuest = visible.find((q) => q.id === selectedId);

  useEffect(() => {
    setRouteCoords(null);
  }, [selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-panel/80 px-4 py-3">
        <div className="text-sm text-slate-300">
          {hydrated ? (
            <>
              Filtering for{" "}
              <span className="font-semibold text-gold-bright">{vehicle.name}</span> — Tier{" "}
              <span className="font-semibold text-cyan-accent">{tierLabel(tier)}</span>
              {" · "}
              <span className="text-slate-400">
                {visible.length} / {quests.length} quests
              </span>
            </>
          ) : (
            <span className="text-slate-500">Loading vehicle filter…</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="accent-gold"
            />
            Show all quests
          </label>
          <Link href="/garage" className="text-xs text-cyan-accent hover:text-gold-bright">
            Edit Garage →
          </Link>
          <Link href="/feed" className="text-xs text-cyan-accent hover:text-gold-bright">
            Adventure Feed →
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <QuestMap
            quests={visible}
            selectedId={selectedId}
            onSelect={setSelected}
            onUserGeoChange={setUserGeo}
            routeCoords={routeCoords}
          />
        </div>
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto lg:col-span-2">
          {visible.length === 0 && (
            <p className="rounded-xl border border-border bg-bg-panel p-4 text-sm text-slate-400">
              No quests match Tier {hydrated ? tier : "—"}. Toggle “Show all” or upgrade in Garage.
            </p>
          )}
          {visible.map((q) => {
            const active = q.id === selectedId;
            const done = completedIds.has(q.id) || hasCompletedQuest(q.id);
            const tierOk = !hydrated || canReachQuest(tier, q.minTier);
            return (
              <div
                key={q.id}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-gold/60 bg-bg-card shadow-gold"
                    : "border-border bg-bg-panel hover:border-gold/30"
                }`}
              >
                <button type="button" className="w-full text-left" onClick={() => setSelected(q.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-white">{q.title}</h3>
                    <span className="badge !text-[10px]">{q.difficulty}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {q.region} · Min Tier {q.minTier} {TIER_LABELS[q.minTier]} ·{" "}
                    {q.radiusMeters}m check-in
                  </p>
                  <p className="mt-2 text-sm text-slate-400">{q.description}</p>
                  {(q.terrainTags?.length ?? 0) > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1">
                      {q.terrainTags!.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] text-slate-500"
                        >
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="mt-3 text-sm font-semibold text-gold-bright">
                    {q.rewardOlC} OLC reward
                    {done && (
                      <span className="ml-2 text-xs font-normal text-emerald-400">Completed</span>
                    )}
                  </p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!hydrated || done}
                    onClick={() => setCheckInQuest(q)}
                    title={
                      !tierOk
                        ? `Needs Tier ${q.minTier}+ — check-in will explain`
                        : done
                          ? "Already completed on this device"
                          : "Open GPS + photo check-in"
                    }
                  >
                    {done ? "Checked in" : "Check in"}
                  </button>
                  {!tierOk && !done && (
                    <span className="self-center text-[11px] text-amber-400">
                      Needs Tier {q.minTier} {TIER_LABELS[q.minTier]}
                    </span>
                  )}
                </div>
                {active && (
                  <QuestDirections
                    quest={q}
                    userGeo={userGeo}
                    onRouteChange={setRouteCoords}
                    compact
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedQuest && (
        <p className="text-xs text-slate-600">
          Selected: {selectedQuest.title}. Check-in requires GPS within{" "}
          {selectedQuest.radiusMeters}m + photo proof. OLC stays pending_claim until a reward
          contract exists.
        </p>
      )}

      {checkInQuest && hydrated && (
        <CheckInModal
          quest={checkInQuest}
          vehicleTier={tier}
          open={!!checkInQuest}
          onClose={() => setCheckInQuest(null)}
          onSuccess={refreshCompletions}
        />
      )}
    </div>
  );
}
