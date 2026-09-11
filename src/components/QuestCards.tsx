"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { Quest } from "@/lib/quests";
import { filterQuestsByTier } from "@/lib/quests";
import { useVehicle } from "@/hooks/useVehicle";
import { canReachQuest, TIER_LABELS, tierLabel } from "@/lib/vehicle";
import { hasCompletedQuest, loadCompletions, WALLET_CHANGE_EVENT } from "@/lib/completions";
import { haversineMeters } from "@/lib/checkin";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_FILTER_OPTIONS,
  DIFFICULTY_LEGEND,
  DIFFICULTY_UI_ACCENT,
  difficultyToUiLabel,
  uiFilterToDifficulty,
  type DifficultyFilterUi,
} from "@/lib/questDifficultyUi";
import { QuestMap } from "./QuestMap";
import { CheckInModal } from "./CheckInModal";
import { QuestDirections } from "./QuestDirections";
import type { UserGeo } from "./UserLocationLayer";
import { LiveWeatherChip } from "./LiveWeatherChip";
import { googleMapsDirectionsUrl } from "@/lib/questDirections";

const QUEST_ALERTS_KEY = "overlandcoin.questAlerts.v1";
const MAP_GUEST_KEY = "overlandcoin.map.guest.v1";
const SEARCH_RESULT_LIMIT = 12;
const NEARBY_ALERT_METERS = 5000;

export function QuestCards({ quests }: { quests: Quest[] }) {
  const { data: session, status: authStatus } = useSession();
  const { tier, hydrated, vehicle } = useVehicle();
  const [walletEpoch, setWalletEpoch] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [guestOk, setGuestOk] = useState(false);
  const [guestHydrated, setGuestHydrated] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [findingId, setFindingId] = useState<string | undefined>(undefined);
  const [flyToId, setFlyToId] = useState<string | undefined>(undefined);
  const [flyNonce, setFlyNonce] = useState(0);
  const [search, setSearch] = useState("");
  const [difficultyUi, setDifficultyUi] = useState<DifficultyFilterUi>("All");
  const [checkInQuest, setCheckInQuest] = useState<Quest | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [userGeo, setUserGeo] = useState<UserGeo>({ status: "idle" });
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [sheetMin, setSheetMin] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [alertsHydrated, setAlertsHydrated] = useState(false);
  const [nearbyToast, setNearbyToast] = useState<string | null>(null);
  const [locateNonce, setLocateNonce] = useState(0);
  const [locateTo, setLocateTo] = useState<{ lat: number; lng: number } | null>(null);
  const [locateBusy, setLocateBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    try {
      setGuestOk(localStorage.getItem(MAP_GUEST_KEY) === "1");
      setAlertsOn(localStorage.getItem(QUEST_ALERTS_KEY) === "1");
    } catch {
      /* ignore */
    }
    setGuestHydrated(true);
    setAlertsHydrated(true);
  }, []);

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
  }, [refreshCompletions, walletEpoch]);

  useEffect(() => {
    const onWallet = () => {
      setWalletEpoch((n) => n + 1);
      refreshCompletions();
    };
    window.addEventListener(WALLET_CHANGE_EVENT, onWallet);
    window.addEventListener("olc-account-change", onWallet);
    return () => {
      window.removeEventListener(WALLET_CHANGE_EVENT, onWallet);
      window.removeEventListener("olc-account-change", onWallet);
    };
  }, [refreshCompletions]);

  // Deep-link: /map?quest=<id> (Telegram Mini App + bot)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const questId = params.get("quest");
    if (!questId) return;
    if (!quests.some((q) => q.id === questId)) return;
    setShowAll(true);
    setSelected(questId);
    setFlyToId(questId);
    setFlyNonce((n) => n + 1);
  }, [quests]);

  const visible = useMemo(() => {
    if (!hydrated) return quests;
    return filterQuestsByTier(quests, tier, showAll);
  }, [quests, tier, showAll, hydrated]);

  const selectedId =
    selected && visible.some((q) => q.id === selected) ? selected : undefined;

  const selectedQuest = selectedId
    ? visible.find((q) => q.id === selectedId)
    : undefined;

  const searchQuery = search.trim().toLowerCase();
  const difficulty = uiFilterToDifficulty(difficultyUi);

  const filtered = useMemo(() => {
    return visible.filter((q) => {
      if (difficulty && q.difficulty !== difficulty) return false;
      if (!searchQuery) return true;
      const hay = `${q.title} ${q.region} ${q.description} ${q.difficulty}`.toLowerCase();
      return hay.includes(searchQuery);
    });
  }, [visible, searchQuery, difficulty]);

  const completedCount = useMemo(() => {
    let n = 0;
    for (const q of visible) {
      if (completedIds.has(q.id) || hasCompletedQuest(q.id)) n += 1;
    }
    return n;
  }, [visible, completedIds]);

  const searchHits = useMemo(() => {
    if (!searchQuery) return [];
    const ranked =
      userGeo.status === "watching"
        ? [...filtered].sort(
            (a, b) =>
              haversineMeters({ lat: userGeo.lat, lng: userGeo.lng }, a) -
              haversineMeters({ lat: userGeo.lat, lng: userGeo.lng }, b),
          )
        : filtered;
    return ranked.slice(0, SEARCH_RESULT_LIMIT);
  }, [filtered, searchQuery, userGeo]);

  // Map shows difficulty-filtered set (not a DOM list of 1500 cards).
  const mapQuests = useMemo(() => {
    if (searchQuery) {
      // While searching, still show difficulty filter pins + ensure hits visible
      const ids = new Set(filtered.map((q) => q.id));
      if (selectedQuest && !ids.has(selectedQuest.id)) {
        return [...filtered, selectedQuest];
      }
      return filtered;
    }
    if (selectedQuest && !filtered.some((q) => q.id === selectedQuest.id)) {
      return [...filtered, selectedQuest];
    }
    return filtered;
  }, [filtered, selectedQuest, searchQuery]);

  useEffect(() => {
    setRouteCoords(null);
    setFindingId(undefined);
    setSheetMin(false);
  }, [selectedId]);

  useEffect(() => {
    if (routeCoords && routeCoords.length >= 2) setSheetMin(true);
  }, [routeCoords]);

  // Quest Alerts stub — notify when within ~5 km of an incomplete quest
  useEffect(() => {
    if (!alertsOn || userGeo.status !== "watching") return;
    const { lat, lng } = userGeo;
    let best: Quest | null = null;
    let bestD = Infinity;
    for (const q of filtered) {
      if (completedIds.has(q.id)) continue;
      const d = haversineMeters({ lat, lng }, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    if (best && bestD <= NEARBY_ALERT_METERS) {
      setNearbyToast(
        `${best.title} is ~${Math.round(bestD)}m away · ${best.rewardOlC} OLC`,
      );
    } else {
      setNearbyToast(null);
    }
  }, [alertsOn, userGeo, filtered, completedIds]);

  function requestFlyTo(id: string) {
    setFlyToId(id);
    setFlyNonce((n) => n + 1);
  }

  /** Map pin select: no fly. List/search: pass { fly: true } once. */
  function selectQuest(id: string, opts?: { fly?: boolean }) {
    setSelected(id);
    setSearchOpen(false);
    setListOpen(false);
    if (opts?.fly) requestFlyTo(id);
  }

  function startDirections(quest: Quest) {
    setFindingId(quest.id);
    requestFlyTo(quest.id);
    if (userGeo.status !== "watching") goToMyLocation();
  }

  function toggleAlerts() {
    setAlertsOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(QUEST_ALERTS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (next) {
        setNearbyToast("Quest Alerts on — we’ll ping when you’re within 5 km of a quest.");
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      } else {
        setNearbyToast(null);
      }
      return next;
    });
  }

  function continueAsGuest() {
    try {
      localStorage.setItem(MAP_GUEST_KEY, "1");
    } catch {
      /* ignore */
    }
    setGuestOk(true);
  }

  const showAuthGate =
    guestHydrated && authStatus !== "loading" && !session?.user && !guestOk;

  const finding = selectedQuest && findingId === selectedQuest.id;

  const isSelectedCompleted = Boolean(
    selectedQuest &&
      (completedIds.has(selectedQuest.id) || hasCompletedQuest(selectedQuest.id)),
  );

  const listQuests = useMemo(() => {
    const ranked =
      userGeo.status === "watching"
        ? [...filtered].sort(
            (a, b) =>
              haversineMeters({ lat: userGeo.lat, lng: userGeo.lng }, a) -
              haversineMeters({ lat: userGeo.lat, lng: userGeo.lng }, b),
          )
        : filtered;
    return ranked.slice(0, 80);
  }, [filtered, userGeo]);

  const googleDirectionsHref = selectedQuest
    ? googleMapsDirectionsUrl(
        { lat: selectedQuest.lat, lng: selectedQuest.lng },
        userGeo.status === "watching"
          ? { lat: userGeo.lat, lng: userGeo.lng }
          : null,
      )
    : null;

  const goToMyLocation = useCallback(() => {
    if (userGeo.status === "watching") {
      setLocateTo({ lat: userGeo.lat, lng: userGeo.lng });
      setLocateNonce((n) => n + 1);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocateBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocateBusy(false);
        setLocateTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocateNonce((n) => n + 1);
      },
      () => {
        setLocateBusy(false);
        setLocateNonce((n) => n + 1);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [userGeo]);

  const locationActive = userGeo.status === "watching";
  const locationDenied = userGeo.status === "denied";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a121c]">
      <QuestMap
        quests={mapQuests}
        selectedId={selectedId}
        flyToId={flyToId}
        flyNonce={flyNonce}
        onSelect={(id) => selectQuest(id)}
        onUserGeoChange={setUserGeo}
        routeCoords={routeCoords}
        completedIds={completedIds}
        hideLocateControl
        locateNonce={locateNonce}
        locateTo={locateTo}
        className="absolute inset-0"
      />

      {/* Overlay chrome — hidden while check-in is open so sheets don't stack */}
      <div className={`pointer-events-none absolute inset-0 z-[1100] ${checkInQuest ? "hidden" : ""}`}>
        {/* Top-left: search + locate/alerts on mobile, then badges */}
        <div className="pointer-events-auto absolute left-3 top-3 right-3 flex max-w-none flex-col gap-2 sm:right-auto sm:max-w-md">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search quests..."
                className="w-full rounded-xl border border-white/15 bg-black/75 px-3.5 py-2.5 text-sm text-white shadow-lg backdrop-blur-md placeholder:text-slate-500 focus:border-cyan-accent/50 focus:outline-none"
                aria-label="Search quests"
              />
              {searchOpen && searchQuery && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/15 bg-black/90 shadow-xl backdrop-blur-md">
                  {searchHits.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-slate-400">No quests match.</p>
                  ) : (
                    searchHits.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        className="flex w-full items-start gap-2 border-b border-white/5 px-3 py-2 text-left last:border-0 hover:bg-white/10"
                        onClick={() => {
                          selectQuest(q.id, { fly: true });
                          setSearch(q.title);
                          setSearchOpen(false);
                        }}
                      >
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: DIFFICULTY_COLORS[q.difficulty] }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-white">
                            {q.title}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {q.region} · {difficultyToUiLabel(q.difficulty)} · {q.rewardOlC} OLC
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={goToMyLocation}
              disabled={locateBusy}
              title="My location"
              aria-label="My location"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-lg backdrop-blur-md transition disabled:opacity-60 sm:hidden ${
                locationActive
                  ? "border-cyan-accent/50 bg-cyan-accent/20 text-cyan-accent"
                  : "border-white/15 bg-black/80 text-gold-bright"
              }`}
            >
              <LocationCrosshairIcon />
            </button>
            <button
              type="button"
              onClick={toggleAlerts}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-lg backdrop-blur-md sm:hidden ${
                alertsOn
                  ? "border-cyan-accent/50 bg-cyan-accent/20 text-cyan-accent"
                  : "border-white/15 bg-black/75 text-slate-200"
              }`}
              title="Quest Alerts — ping when you are within 5 km of a quest"
              aria-label="Quest Alerts — ping when you are within 5 km of a quest"
              aria-pressed={alertsOn}
            >
              🔔
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition ${
                listOpen
                  ? "border-cyan-accent/50 bg-cyan-accent/20 text-cyan-accent"
                  : "border-white/15 bg-black/70 text-slate-100 hover:border-cyan-accent/40"
              }`}
              aria-pressed={listOpen}
              aria-label="Toggle quest list"
            >
              {filtered.length} quests
            </button>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-md">
              {completedCount} completed
            </span>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition ${
                showAll
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                  : "border-white/15 bg-black/70 text-slate-300 hover:border-cyan-accent/40"
              }`}
              title="Toggle vehicle garage tier filter"
            >
              {hydrated
                ? showAll
                  ? "All tiers"
                  : `Tier ${tierLabel(tier)}`
                : "Garage…"}
            </button>
            <Link
              href="/garage"
              className="rounded-full border border-white/10 bg-black/50 px-2 py-1 text-[10px] text-cyan-accent/90 hover:text-cyan-accent"
            >
              Garage
            </Link>
          </div>
          <div className="md:hidden">
            <DifficultySeg value={difficultyUi} onChange={setDifficultyUi} compact />
          </div>
          <div className="md:hidden">
            <LiveWeatherChip geo={userGeo} />
          </div>
        </div>

        {/* Top-center: difficulty segmented control */}
        <div className="pointer-events-auto absolute left-1/2 top-3 hidden -translate-x-1/2 md:block">
          <DifficultySeg
            value={difficultyUi}
            onChange={setDifficultyUi}
          />
        </div>

        {/* Top-right: Quest Alerts (tablet/desktop) */}
        <div className="pointer-events-auto absolute right-3 top-3 z-20 hidden sm:block">
          <button
            type="button"
            onClick={toggleAlerts}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition ${
              alertsOn
                ? "border-cyan-accent/50 bg-cyan-accent/20 text-cyan-accent"
                : "border-white/15 bg-black/75 text-slate-200 hover:bg-white/10"
            }`}
            title="Ping when you are within 5 km of a quest"
            aria-pressed={alertsHydrated ? alertsOn : false}
          >
            <span aria-hidden>🔔</span>
            Quest Alerts
            {alertsOn ? " · On" : ""}
          </button>
        </div>

        {/* Live weather — desktop only (mobile is in the flowing column) */}
        <div className="pointer-events-auto absolute right-[11.5rem] top-3 z-10 hidden md:block">
          <LiveWeatherChip geo={userGeo} />
        </div>

        {/* Labeled locate — tablet/desktop only, under Quest Alerts */}
        <div className="pointer-events-auto absolute right-3 top-[3.75rem] z-10 hidden flex-col items-end gap-1 sm:flex md:top-16">
          {locationDenied && (
            <div className="max-w-[200px] rounded-md border border-amber-500/40 bg-black/90 px-2 py-1 text-[11px] text-amber-100 shadow-lg backdrop-blur-md">
              Location permission denied
            </div>
          )}
          <button
            type="button"
            onClick={goToMyLocation}
            disabled={locateBusy}
            title="My location"
            aria-label="My location"
            className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-lg backdrop-blur-md transition disabled:opacity-60 ${
              locationActive
                ? "border-cyan-accent/50 bg-cyan-accent/20 text-cyan-accent"
                : "border-white/15 bg-black/80 text-gold-bright hover:border-gold-bright/40 hover:bg-white/10"
            }`}
          >
            <LocationCrosshairIcon />
            <span>{locateBusy ? "Locating…" : "My location"}</span>
          </button>
        </div>

        {locationDenied && (
          <div className="pointer-events-auto absolute right-3 top-[3.6rem] z-20 max-w-[200px] rounded-md border border-amber-500/40 bg-black/90 px-2 py-1 text-[11px] text-amber-100 shadow-lg backdrop-blur-md sm:hidden">
            Location permission denied
          </div>
        )}

        {nearbyToast && alertsOn && (
          <div className="pointer-events-auto absolute left-1/2 top-20 z-30 w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl border border-cyan-accent/40 bg-black/85 px-3 py-2 text-center text-xs text-cyan-100 shadow-lg backdrop-blur-md md:top-16">
            {nearbyToast}
          </div>
        )}

        {/* Bottom-left legend */}
        <div className="pointer-events-auto absolute bottom-14 left-3 max-w-[11rem] rounded-xl border border-white/15 bg-black/75 p-2.5 text-[11px] shadow-lg backdrop-blur-md sm:bottom-16 sm:max-w-[13rem]">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Legend
          </p>
          <ul className="space-y-1">
            {DIFFICULTY_LEGEND.map((row) => (
              <li key={row.ui} className="flex items-center gap-2 text-slate-200">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: row.color }}
                />
                <span className="flex-1">{row.ui}</span>
                <span className="font-semibold text-gold-bright">{row.reward} OLC</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right-side quest list — opens from quest count pill */}
        {listOpen && (
          <div className="pointer-events-auto absolute inset-x-3 bottom-14 top-44 z-20 flex w-auto flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/90 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:right-3 sm:top-16 sm:w-[min(100%-1.5rem,20rem)] md:top-14">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <p className="text-xs font-semibold text-white">
                Quests · {filtered.length}
              </p>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
                onClick={() => setListOpen(false)}
                aria-label="Close quest list"
              >
                ✕
              </button>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {listQuests.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-slate-500">
                  No quests match filters
                </li>
              ) : (
                listQuests.map((q) => {
                  const done =
                    completedIds.has(q.id) || hasCompletedQuest(q.id);
                  const active = q.id === selectedId;
                  return (
                    <li key={q.id} className="border-b border-white/5 last:border-0">
                      <button
                        type="button"
                        className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition ${
                          active ? "bg-white/10" : "hover:bg-white/5"
                        }`}
                        onClick={() => {
                          selectQuest(q.id, { fly: true });
                        }}
                      >
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: DIFFICULTY_COLORS[q.difficulty] }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block truncate text-sm font-medium text-white">
                              {q.title}
                            </span>
                            {done && (
                              <span className="shrink-0 text-[10px] font-semibold text-emerald-400">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {q.region} · {difficultyToUiLabel(q.difficulty)} ·{" "}
                            {q.rewardOlC} OLC
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {filtered.length > listQuests.length && (
              <p className="border-t border-white/10 px-3 py-2 text-[10px] text-slate-500">
                Showing {listQuests.length} of {filtered.length} — refine search or
                difficulty to narrow.
              </p>
            )}
          </div>
        )}

        {/* Selected quest detail card — bottom-right / mobile bottom sheet */}
        {selectedQuest && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom,0px)] sm:inset-x-auto sm:bottom-14 sm:right-3 sm:w-[min(100%-1.5rem,22rem)] sm:pb-0 md:bottom-16">
            <div className={`${sheetMin ? "max-h-[7.5rem]" : "max-h-[55vh] sm:max-h-[min(70vh,28rem)]"} overflow-y-auto rounded-t-2xl border border-white/15 bg-black/90 p-4 shadow-2xl backdrop-blur-md sm:rounded-2xl`}>
              <div className="mb-2 flex items-start justify-between gap-2 sm:hidden">
                <div className="mx-auto h-1 w-10 rounded-full bg-white/25" />
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-white">{selectedQuest.title}</h3>
                <div className="flex shrink-0 items-center gap-1">
                  {routeCoords && routeCoords.length >= 2 ? (
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs text-cyan-accent hover:bg-white/10"
                      onClick={() => setSheetMin((v) => !v)}
                    >
                      {sheetMin ? "Details" : "See map"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
                    onClick={() => setSelected(undefined)}
                    aria-label="Close quest detail"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {sheetMin && routeCoords && routeCoords.length >= 2 ? (
                <p className="mt-1 text-xs text-cyan-accent">Route is on the map — tap Details for turn-by-turn apps.</p>
              ) : null}
              {!sheetMin && (
              <>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{
                    background: DIFFICULTY_COLORS[selectedQuest.difficulty],
                  }}
                >
                  {difficultyToUiLabel(selectedQuest.difficulty)}
                </span>
                <span className="text-xs text-slate-400">{selectedQuest.region}</span>
              </div>
              {selectedQuest.description ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-accent/90">
                    About this location
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-200">
                    {selectedQuest.description}
                  </p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="font-semibold text-gold-bright">
                  {selectedQuest.rewardOlC} OLC
                </span>
                <span>Check-in {selectedQuest.radiusMeters}m</span>
                <span>
                  Tier {selectedQuest.minTier}+ {TIER_LABELS[selectedQuest.minTier]}
                </span>
              </div>

              {isSelectedCompleted && (
                <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-center text-sm font-semibold text-emerald-300">
                  Quest Completed!
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {!isSelectedCompleted && !finding ? (
                  <button
                    type="button"
                    className="btn-primary !py-2 !text-xs"
                    onClick={() => startDirections(selectedQuest)}
                  >
                    Directions
                  </button>
                ) : null}
                {googleDirectionsHref && (
                  <a
                    href={googleDirectionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary !py-2 !text-xs"
                  >
                    Google Directions
                  </a>
                )}
                <button
                  type="button"
                  className="btn-secondary !py-2 !text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isSelectedCompleted}
                  title={
                    isSelectedCompleted
                      ? "Location locked — already completed for this wallet"
                      : undefined
                  }
                  onClick={() => {
                    if (isSelectedCompleted) return;
                    goToMyLocation();
                  }}
                >
                  {isSelectedCompleted
                    ? "Enable location"
                    : userGeo.status === "watching"
                      ? "Locate me"
                      : "Enable location"}
                </button>
                <button
                  type="button"
                  className="btn-secondary !py-2 !text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!hydrated || isSelectedCompleted}
                  onClick={() => {
                    setListOpen(false);
                    setSearchOpen(false);
                    setCheckInQuest(selectedQuest);
                  }}
                >
                  {isSelectedCompleted ? "Quest Completed!" : "Check in"}
                </button>
              </div>

              {hydrated &&
                !canReachQuest(tier, selectedQuest.minTier) &&
                !(
                  completedIds.has(selectedQuest.id) ||
                  hasCompletedQuest(selectedQuest.id)
                ) && (
                  <p className="mt-2 text-[11px] text-amber-300">
                    Needs Tier {selectedQuest.minTier} {TIER_LABELS[selectedQuest.minTier]} —{" "}
                    <Link href="/garage" className="underline hover:text-amber-200">
                      edit Garage
                    </Link>{" "}
                    or show all tiers.
                  </p>
                )}

              </>
              )}
              {finding && (
                <div className={sheetMin ? "hidden" : undefined}>
                  <QuestDirections
                    quest={selectedQuest}
                    userGeo={userGeo}
                    onRouteChange={setRouteCoords}
                    compact
                    autoStart
                    primaryLabel="Directions"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Soft auth gate — Base44 login prompt + Continue as guest */}
      {showAuthGate && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0d1520] p-6 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-bright">
              Quest Map
            </p>
            <h2 className="mt-2 text-xl font-bold text-white">Sign in to explore</h2>
            <p className="mt-2 text-sm text-slate-400">
              Log in to sync progress across devices. You can also continue as a guest
              for local check-ins on this device.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Link href="/login?callbackUrl=/map" className="btn-primary w-full">
                Log in
              </Link>
              <Link href="/register?callbackUrl=/map" className="btn-secondary w-full">
                Register
              </Link>
              <button
                type="button"
                onClick={continueAsGuest}
                className="mt-1 text-sm text-cyan-accent hover:underline"
              >
                Continue as guest
              </button>
            </div>
          </div>
        </div>
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

      {/* Vehicle name hint for a11y / debugging — visually subtle */}
      <span className="sr-only">
        Filtering for {hydrated ? vehicle.name : "vehicle"} · {filtered.length} quests
      </span>
    </div>
  );
}

function LocationCrosshairIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

function DifficultySeg({
  value,
  onChange,
  compact,
}: {
  value: DifficultyFilterUi;
  onChange: (v: DifficultyFilterUi) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex overflow-x-auto rounded-full border border-white/15 bg-black/75 p-0.5 shadow-lg backdrop-blur-md ${
        compact ? "w-full justify-between" : ""
      }`}
      role="group"
      aria-label="Difficulty filter"
    >
      {DIFFICULTY_FILTER_OPTIONS.map((opt) => {
        const active = value === opt;
        const accent =
          opt === "All" ? null : DIFFICULTY_UI_ACCENT[opt as Exclude<DifficultyFilterUi, "All">];
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={active}
            className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${
              active
                ? opt === "All"
                  ? "bg-white text-slate-900"
                  : `${accent!.bg} text-white`
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
