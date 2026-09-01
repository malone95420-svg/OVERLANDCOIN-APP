"use client";

import { useCallback, useEffect, useState } from "react";
import type { Quest } from "@/lib/quests";
import { formatDistance, haversineMeters, isWithinRadius } from "@/lib/checkin";
import {
  compressImageToDataUrl,
  hasCompletedQuest,
  recordCheckIn,
} from "@/lib/completions";
import { canReachQuest, tierLabel, TIER_LABELS, type CapabilityTier } from "@/lib/vehicle";

type Props = {
  quest: Quest;
  vehicleTier: CapabilityTier;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number; accuracy?: number }
  | { status: "error"; message: string };

export function CheckInModal({ quest, vehicleTier, open, onClose, onSuccess }: Props) {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ olc: number } | null>(null);

  const tierOk = canReachQuest(vehicleTier, quest.minTier);
  const alreadyDone = hasCompletedQuest(quest.id);

  const requestGeo = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ status: "error", message: "Geolocation is not supported in this browser." });
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setGeo({
          status: "error",
          message: err.message || "Could not read GPS. Allow location and try again.",
        });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDone(null);
    setPhotoDataUrl(null);
    setPhotoName("");
    setCaption("");
    setSubmitting(false);
    requestGeo();
  }, [open, quest.id, requestGeo]);

  if (!open) return null;

  const distanceM =
    geo.status === "ready" ? haversineMeters({ lat: geo.lat, lng: geo.lng }, quest) : null;
  const inside =
    geo.status === "ready" && isWithinRadius({ lat: geo.lat, lng: geo.lng }, quest);

  async function onPhotoChange(file: File | null) {
    setError(null);
    setPhotoDataUrl(null);
    setPhotoName("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    try {
      const dataUrl = await compressImageToDataUrl(file, 800, 0.72);
      setPhotoDataUrl(dataUrl);
      setPhotoName(file.name);
    } catch {
      setError("Could not process photo. Try another image.");
    }
  }

  async function submit() {
    setError(null);
    if (!tierOk) {
      setError(
        `Blocked — this quest needs Tier ${quest.minTier} ${TIER_LABELS[quest.minTier]}. Upgrade your Garage.`,
      );
      return;
    }
    if (geo.status !== "ready" || !inside || !photoDataUrl) return;
    setSubmitting(true);
    try {
      const res = recordCheckIn({
        quest,
        lat: geo.lat,
        lng: geo.lng,
        distanceM: distanceM ?? 0,
        photoDataUrl,
        caption,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({ olc: res.completion.olcEarned });
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    tierOk && !alreadyDone && geo.status === "ready" && inside && !!photoDataUrl && !submitting;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-bg-card p-5 shadow-gold">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-cyan-accent">Check in</p>
            <h2 id="checkin-title" className="mt-1 text-xl font-bold text-white">
              {quest.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {quest.region} · {quest.rewardOlC} OLC · radius {quest.radiusMeters}m
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-border px-2 py-1 text-sm text-slate-300 hover:border-gold/40"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 rounded-lg border border-border/80 bg-bg-panel px-3 py-2 text-xs text-slate-400">
          Rewards are <span className="text-gold-bright">GPS + photo verified</span>. OLC is saved as{" "}
          <span className="font-mono text-cyan-accent">pending_claim</span> — on-chain claim comes later
          when a reward contract exists. No tokens move on BlockDAG today.
        </p>

        {!tierOk && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-3 text-sm text-red-200">
            Check-in blocked. Your rig is Tier {tierLabel(vehicleTier)}; this quest needs Tier{" "}
            {quest.minTier} {TIER_LABELS[quest.minTier]}. Upgrade in Garage — browsing with “Show all”
            does not unlock completion.
          </div>
        )}

        {alreadyDone && !done && (
          <div className="mt-4 rounded-xl border border-gold/40 bg-bg-panel px-3 py-3 text-sm text-gold-bright">
            You already completed this quest (local ledger). Photo is on the Adventure Feed.
          </div>
        )}

        {done ? (
          <div className="mt-5 space-y-3 text-center">
            <p className="text-2xl font-bold text-gold-bright">+{done.olc} OLC</p>
            <p className="badge !text-[11px]">GPS verified · Photo proof · OLC pending claim</p>
            <p className="text-sm text-slate-400">
              Saved to your local ledger and Adventure Feed. Claim on-chain when the reward contract
              ships.
            </p>
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <section className="rounded-xl border border-border bg-bg-panel/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">GPS</h3>
                <button
                  type="button"
                  className="text-xs text-cyan-accent hover:text-gold-bright"
                  onClick={requestGeo}
                >
                  Refresh location
                </button>
              </div>
              {geo.status === "loading" && (
                <p className="mt-2 text-sm text-slate-500">Requesting location…</p>
              )}
              {geo.status === "error" && (
                <p className="mt-2 text-sm text-red-300">{geo.message}</p>
              )}
              {geo.status === "ready" && (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-mono text-slate-300">
                    {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
                    {geo.accuracy != null && (
                      <span className="text-slate-500"> ±{Math.round(geo.accuracy)}m</span>
                    )}
                  </p>
                  <p>
                    Distance to pin:{" "}
                    <span className="font-semibold text-white">{formatDistance(distanceM ?? 0)}</span>
                    {" · "}
                    {inside ? (
                      <span className="text-emerald-400">Inside radius</span>
                    ) : (
                      <span className="text-amber-400">Outside {quest.radiusMeters}m radius</span>
                    )}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-bg-panel/80 p-3">
              <h3 className="text-sm font-semibold text-white">Photo proof</h3>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-bg-deep file:px-3 file:py-2 file:text-sm file:text-gold-bright"
                onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
                disabled={!tierOk || alreadyDone}
              />
              {photoName && (
                <p className="mt-1 truncate text-xs text-slate-500">{photoName} (compressed)</p>
              )}
              {photoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoDataUrl}
                  alt="Check-in proof"
                  className="mt-3 max-h-48 w-full rounded-lg object-cover"
                />
              )}
              <label className="mt-3 block text-xs text-slate-400">Caption (optional)</label>
              <textarea
                className="mt-1 w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                rows={2}
                maxLength={280}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Trail notes…"
                disabled={!tierOk || alreadyDone}
              />
            </section>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <button
              type="button"
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitting ? "Saving…" : "Complete quest"}
            </button>
            <p className="text-center text-[11px] text-slate-600">
              Submit enabled only when GPS is inside radius and a photo is attached.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
