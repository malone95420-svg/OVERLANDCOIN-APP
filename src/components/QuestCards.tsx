"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Quest } from "@/lib/quests";
import { filterQuestsByTier } from "@/lib/quests";
import { useVehicle } from "@/hooks/useVehicle";
import { canReachQuest, TIER_LABELS, tierLabel } from "@/lib/vehicle";
import { hasCompletedQuest, loadCompletions } from "@/lib/completions";
import { haversineMeters } from "@/lib/checkin";
import { QuestMap } from "./QuestMap";
import { CheckInModal } from "./CheckInModal";
import { QuestDirections } from "./QuestDirections";
import type { UserGeo } from "./UserLocationLayer";

const PAGE_SIZE = 40;

function truncate(text: string, max = 90): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function QuestCards({ quests }: { quests: Quest[] }) {
  const { tier, hydrated, vehicle } = useVehicle();
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [findingId, setFindingId] = useState<string | undefined>(undefined);
  const [flyToId, setFlyToId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [listLimit, setListLimit] = useState(PAGE_SIZE);
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

  // selectedId stays undefined until the user picks a quest; clear if filtered out.
  const selectedId =
    selected && visible.some((q) => q.id === selected) ? selected : undefined;

  const selectedQuest = selectedId
    ? visible.find((q) => q.id === selectedId)
    : undefined;

  const searchQuery = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!searchQuery) return visible;
    return visible.filter((q) => {
      const hay = `${q.title} ${q.region} ${q.description}`.toLowerCase();
      return hay.includes(searchQuery);
    });
  }, [visible, searchQuery]);

  const ranked = useMemo(() => {
    if (userGeo.status !== "watching") return filtered;
    const { lat, lng } = userGeo;
    return [...filtered].sort(
      (a, b) =>
        haversineMeters({ lat, lng }, a) - haversineMeters({ lat, lng }, b),
    );
  }, [filtered, userGeo]);

  // Reset page size when filters / search / geo ranking basis change.
  useEffect(() => {
    setListLimit(PAGE_SIZE);
  }, [searchQuery, showAll, tier, hydrated, userGeo.status]);

  const listed = useMemo(
    () => ranked.slice(0, listLimit),
    [ranked, listLimit],
  );

  const mapQuests = useMemo(() => {
    if (!selectedQuest) return listed;
    if (listed.some((q) => q.id === selectedQuest.id)) return listed;
    return [...listed, selectedQuest];
  }, [listed, selectedQuest]);

  useEffect(() => {
    setRouteCoords(null);
    setFindingId(undefined);
    setFlyToId(undefined);
  }, [selectedId]);

  function selectQuest(id: string) {
    setSelected(id);
  }

  function startFinding(quest: Quest) {
    setFindingId(quest.id);
    setFlyToId(quest.id);
  }

  const detailPanel =
    selectedQuest &&
    (() => {
      const q = selectedQuest;
      const done = completedIds.has(q.id) || hasCompletedQuest(q.id);
      const tierOk = !hydrated || canReachQuest(tier, q.minTier);
      const finding = findingId === q.id;
      return (
        <div className="sticky top-0 z-10 rounded-xl border border-gold/50 bg-bg-card p-4 shadow-gold">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-white">{q.title}</h3>
            <span className="badge !text-[10px]">{q.difficulty}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {q.region} · Min Tier {q.minTier} {TIER_LABELS[q.minTier]} ·{" "}
            {q.radiusMeters}m check-in
          </p>
          <p className="mt-2 text-sm text-slate-300">{q.description}</p>
          {(q.terrainTags?.length ?? 0) > 0 && (
            <p className="mt-2 flex flex-wrap gap-1">
              {q.terrainTags!.slice(0, 8).map((t) => (
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
              <span className="ml-2 text-xs font-normal text-emerald-400">
                Completed
              </span>
            )}
          </p>
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
            {!finding ? (
              <button
                type="button"
                className="btn-secondary !py-1.5 !text-xs"
                onClick={() => startFinding(q)}
              >
                Find quest
              </button>
            ) : null}
            {!tierOk && !done && (
              <span className="self-center text-[11px] text-amber-400">
                Needs Tier {q.minTier} {TIER_LABELS[q.minTier]}
              </span>
            )}
          </div>
          {finding && (
            <QuestDirections
              quest={q}
              userGeo={userGeo}
              onRouteChange={setRouteCoords}
              compact
              autoStart
            />
          )}
        </div>
      );
    })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-panel/80 px-4 py-3">
        <div className="text-sm text-slate-300">
          {hydrated ? (
            <>
              Filtering for{" "}
              <span className="font-semibold text-gold-bright">{vehicle.name}</span>{" "}
              — Tier{" "}
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
        <div className="space-y-3 lg:col-span-3">
          <QuestMap
            quests={mapQuests}
            selectedId={selectedId}
            flyToId={flyToId}
            onSelect={selectQuest}
            onUserGeoChange={setUserGeo}
            routeCoords={routeCoords}
          />
          {/* Mobile: detail panel below map */}
          <div className="lg:hidden">{detailPanel}</div>
        </div>

        <div className="flex max-h-[520px] flex-col gap-3 lg:col-span-2">
          <div className="shrink-0">
            <label className="sr-only" htmlFor="quest-search">
              Search quests
            </label>
            <input
              id="quest-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, region, or description…"
              className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-gold/50 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Showing {listed.length} of {ranked.length}
              {userGeo.status === "watching" && !searchQuery
                ? " · nearest first"
                : ""}
              {searchQuery ? " · search filter" : ""}
            </p>
          </div>

          {/* Desktop: sticky detail above the list */}
          <div className="hidden shrink-0 lg:block">{detailPanel}</div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {visible.length === 0 && (
              <p className="rounded-xl border border-border bg-bg-panel p-4 text-sm text-slate-400">
                No quests match Tier {hydrated ? tier : "—"}. Toggle “Show all” or
                upgrade in Garage.
              </p>
            )}
            {visible.length > 0 && ranked.length === 0 && (
              <p className="rounded-xl border border-border bg-bg-panel p-4 text-sm text-slate-400">
                No quests match “{search.trim()}”.
              </p>
            )}
            {!selectedId && ranked.length > 0 && (
              <p className="rounded-lg border border-dashed border-border bg-bg-panel/50 px-3 py-2 text-xs text-slate-500">
                Select a quest in the list or on the map to read details. Find
                quest only after you choose one.
              </p>
            )}
            {listed.map((q) => {
              const active = q.id === selectedId;
              const done = completedIds.has(q.id) || hasCompletedQuest(q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-gold/60 bg-bg-card shadow-gold"
                      : "border-border bg-bg-panel hover:border-gold/30"
                  }`}
                  onClick={() => selectQuest(q.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">{q.title}</h3>
                    <span className="badge shrink-0 !text-[10px]">{q.difficulty}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {q.region}
                    <span className="mx-1 text-slate-600">·</span>
                    <span className="font-medium text-gold-bright/90">
                      {q.rewardOlC} OLC
                    </span>
                    {done && (
                      <span className="ml-2 text-emerald-400">Completed</span>
                    )}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                    {truncate(q.description)}
                  </p>
                </button>
              );
            })}
            {listed.length < ranked.length && (
              <button
                type="button"
                className="btn-secondary shrink-0 !py-2 !text-xs"
                onClick={() => setListLimit((n) => n + PAGE_SIZE)}
              >
                Load more ({Math.min(PAGE_SIZE, ranked.length - listed.length)}{" "}
                more)
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        {selectedQuest
          ? `Selected: ${selectedQuest.title}. Check-in needs GPS within ${selectedQuest.radiusMeters}m + a photo.`
          : "Browse and select a quest to read details. Check-in needs GPS within the quest radius + a photo."}
      </p>

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
